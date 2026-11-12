// lib/server/ebay-discovery.js - searches eBay's official Browse API for the owner's saved searches, and keeps the undervalued candidates. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, addDoc } from '../server-firestore.js';
import { parseEbaySearch, findUndervalued } from '../deals/discover.js';
import { operatorEnv } from './operator-settings.js';

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MAX_SEARCHES = 5;

/** An application token from the operator's eBay app (client credentials: no owner login is needed for search). */
export async function ebayAppToken(env, fetchImpl = fetch) {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return '';
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
  const r = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }) });
  if (!r?.ok) return '';
  return (await r.json())?.access_token || '';
}

export async function searchUndervalued(db, uid, { env = operatorEnv(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const terms = (Array.isArray(biz.dealSearches) ? biz.dealSearches : []).map((t) => String(t).trim()).filter((t) => t.length >= 2).slice(0, MAX_SEARCHES);
    if (!terms.length) return { searched: 0, added: 0 };
    const token = await ebayAppToken(env, fetchImpl);
    if (!token) return { searched: 0, added: 0, skipped: 'not_connected' };
    let added = 0;
    const seenRows = (await getDocs(query(collection(db, 'users', uid, 'acquisition_targets'), where('source', '==', 'ebay-search'), limit(500)))).docs.map((d) => d.id);
    const seen = new Set(seenRows);
    for (const term of terms) {
      const r = await fetchImpl(`${SEARCH}?q=${encodeURIComponent(term)}&limit=50`, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
      if (!r?.ok) continue;
      const result = findUndervalued(parseEbaySearch(await r.json()), { minDiscountPct: 20, limit: 5 });
      for (const c of result.candidates) {
        const id = `e-${c.itemId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        await setDoc(doc(db, 'users', uid, 'acquisition_targets', id), { side: 'buy', source: 'ebay-search', search: term, name: c.title, askingPrice: c.price, currency: c.currency, condition: c.condition, url: c.url, medianPrice: c.medianPrice, discountPct: c.discountPct, stage: 'sourced', updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString() }, { merge: true });
        added++;
      }
    }
    await setDoc(doc(db, 'users', uid, 'settings', 'listings'), { dealSearchedAt: new Date(now).toISOString() }, { merge: true });
    return { searched: terms.length, added };
  } catch (e) {
    console.error('[ebay-discovery] failed:', uid, String(e?.message || '').slice(0, 120));
    return { searched: 0, added: 0, skipped: 'error' };
  }
}
