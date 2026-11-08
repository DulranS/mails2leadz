// lib/server/ebay-sync.js - sends changed products to the owner's eBay inventory, using the owner's own user token. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { ebayInventoryBody, EBAY_API, offerBody, pickPolicies } from '../ebay.js';
import { switchState } from '../switches.js';

export async function syncProductsToEbay(db, uid, { env = process.env, fetchImpl = fetch, now = Date.now(), max = 50 } = {}) {
  try {
    const s = await secretsFor(db, uid, ['EBAY_USER_TOKEN', 'EBAY_REFRESH_TOKEN'], { env }).catch(() => ({}));
    const token = await ebayAccessToken(s, env, fetchImpl);
    if (!token) return { sent: 0, skipped: 'not_connected' };
    s.EBAY_USER_TOKEN = token;
    const stateRef = doc(db, 'users', uid, 'settings', 'listings');
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const autoPublish = switchState('ebayAutoPublish', biz, { ...env, EBAY_USER_TOKEN: s.EBAY_USER_TOKEN }).status === 'on' && /^\d{1,10}$/.test(String(biz.ebayCategoryId || ''));
    let policies = null;
    const lastSync = (await getDoc(stateRef).catch(() => null))?.data?.()?.ebayLastSyncAt || '1970-01-01T00:00:00.000Z';
    const products = (await getDocs(query(collection(db, 'users', uid, 'products'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const changed = products.filter((p) => String(p.updatedAt || p.createdAt || '') > lastSync).slice(0, max);
    let sent = 0;
    for (const p of changed) {
      const item = ebayInventoryBody(p);
      if (!item) continue;
      const r = await fetchImpl(`${EBAY_API}/inventory_item/${encodeURIComponent(item.sku)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.EBAY_USER_TOKEN}`, 'Content-Language': 'en-US' }, body: JSON.stringify(item.body) });
      if (r?.ok || r?.status === 204) sent++;
      if (autoPublish && r?.ok !== false && !p.ebayListingId) {
        policies = policies || (await policiesFor(uid, s.EBAY_USER_TOKEN, fetchImpl, db));
        const offer = policies && offerBody({ sku: item.sku, categoryId: biz.ebayCategoryId, quantity: p.stockOnHand, price: p.price, currency: biz.currency || 'USD', description: p.description || p.name, policies });
        if (offer) await publishOffer(db, uid, p, offer, s.EBAY_USER_TOKEN, fetchImpl);
      }
    }
    await setDoc(stateRef, { ebayLastSyncAt: new Date(now).toISOString() }, { merge: true });
    return { sent, of: changed.length };
  } catch (e) {
    console.error('[ebay] sync failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}

/** The owner's policies from eBay, kept for a day so a sync does not ask eBay again for each product. */
async function policiesFor(uid, token, fetchImpl, db) {
  const ref = doc(db, 'users', uid, 'settings', 'listings');
  const cached = (await getDoc(ref).catch(() => null))?.data?.()?.ebayPolicies;
  if (cached && Date.now() - Date.parse(cached.at) < 24 * 3600000) return cached.value;
  const auth = { Authorization: `Bearer ${token}` };
  const get = async (path) => { const r = await fetchImpl(`https://api.ebay.com/sell/account/v1/${path}?marketplace_id=EBAY_US`, { headers: auth }); return r?.ok ? r.json() : null; };
  const value = pickPolicies({ fulfillment: await get('fulfillment_policy'), payment: await get('payment_policy'), returns: await get('return_policy') });
  if (value) await setDoc(ref, { ebayPolicies: { at: new Date().toISOString(), value } }, { merge: true });
  return value;
}

/** Creates the offer and publishes it; the listing id is kept on the product so it is not published twice. */
async function publishOffer(db, uid, product, offer, token, fetchImpl) {
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
  const created = await fetchImpl(`${EBAY_API}/offer`, { method: 'POST', headers: auth, body: JSON.stringify(offer) });
  if (!created?.ok) return;
  const offerId = (await created.json())?.offerId;
  if (!offerId) return;
  const pub = await fetchImpl(`${EBAY_API}/offer/${encodeURIComponent(offerId)}/publish`, { method: 'POST', headers: auth });
  if (!pub?.ok) return;
  const listingId = (await pub.json())?.listingId;
  await setDoc(doc(db, 'users', uid, 'products', product.id), { ebayOfferId: String(offerId), ebayListingId: String(listingId || 'published') }, { merge: true });
}

/** A short-lived eBay access token from the connection's refresh token (Connect), or the pasted token as a fallback. */
async function ebayAccessToken(s, env, fetchImpl) {
  if (!s.EBAY_REFRESH_TOKEN) return s.EBAY_USER_TOKEN || '';
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID || ''}:${env.EBAY_CLIENT_SECRET || ''}`).toString('base64');
  const r = await fetchImpl('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.EBAY_REFRESH_TOKEN, scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account' }) });
  if (!r?.ok) return '';
  return (await r.json())?.access_token || '';
}
