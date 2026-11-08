// lib/server/connect.js - finishes a Connect: exchanges the platform's code for access and stores it for the owner. Never throws.
import { randomBytes } from 'node:crypto';
import { writeAccountSecret } from './integration-secrets.js';

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const ADS_API = 'https://googleads.googleapis.com/v17';
const GRAPH = 'https://graph.facebook.com/v19.0';
const TIKTOK = 'https://business-api.tiktok.com/open_api/v1.3';

async function googleAds(db, uid, code, redirectUri, env, f) {
  const t = await f(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, client_secret: env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!t?.ok) return { ok: false, error: 'Google did not accept the approval. Try again.' };
  const tok = await t.json();
  if (!tok.refresh_token) return { ok: false, error: 'Google did not return a long-term grant. Disconnect the app in your Google account, then connect again.' };
  const list = await f(`${ADS_API}/customers:listAccessibleCustomers`, { headers: { Authorization: `Bearer ${tok.access_token}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN || '' } });
  if (!list?.ok) return { ok: false, error: 'Google Ads did not list your accounts. Check that your Google account has Google Ads access.' };
  const first = ((await list.json()).resourceNames || [])[0] || '';
  const cid = first.replace(/^customers\//, '');
  if (!cid) return { ok: false, error: 'No Google Ads account was found for this Google login.' };
  await writeAccountSecret(db, uid, 'GOOGLE_ADS_REFRESH_TOKEN', tok.refresh_token);
  await writeAccountSecret(db, uid, 'GOOGLE_ADS_CUSTOMER_ID', cid);
  return { ok: true, customerId: cid };
}

async function metaLeads(db, uid, code, redirectUri, env, f) {
  const t = await f(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_OAUTH_SECRET, redirect_uri: redirectUri, code })}`);
  if (!t?.ok) return { ok: false, error: 'Meta did not accept the approval. Try again.' };
  const userToken = (await t.json()).access_token;
  const pages = await f(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(userToken)}`);
  if (!pages?.ok) return { ok: false, error: 'Meta did not list your Pages. Check the Page permission was granted.' };
  const page = ((await pages.json()).data || [])[0];
  if (!page?.id || !page?.access_token) return { ok: false, error: 'No Facebook Page was chosen. Connect again and pick the Page.' };
  // The Lead Ads check needs the app secret and a verify token: the app supplies both, the owner never types them.
  const verify = randomBytes(18).toString('base64url');
  await writeAccountSecret(db, uid, 'META_PAGE_ID', String(page.id));
  await writeAccountSecret(db, uid, 'META_PAGE_ACCESS_TOKEN', String(page.access_token));
  await writeAccountSecret(db, uid, 'META_APP_SECRET', String(env.META_OAUTH_SECRET || ''));
  await writeAccountSecret(db, uid, 'META_VERIFY_TOKEN', verify);
  return { ok: true, pageId: String(page.id), verifyToken: verify };
}

async function tiktokEvents(db, uid, code, env, f) {
  const t = await f(`${TIKTOK}/oauth2/access_token/`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.TIKTOK_APP_ID, secret: env.TIKTOK_APP_SECRET, auth_code: code }) });
  if (!t?.ok) return { ok: false, error: 'TikTok did not accept the approval. Try again.' };
  const data = (await t.json()).data || {};
  const advertiser = (data.advertiser_ids || [])[0];
  if (!data.access_token || !advertiser) return { ok: false, error: 'TikTok did not return an ad account for this login.' };
  const pixels = await f(`${TIKTOK}/pixel/list/?advertiser_id=${encodeURIComponent(advertiser)}`, { headers: { 'Access-Token': data.access_token } });
  if (!pixels?.ok) return { ok: false, error: 'TikTok did not list your pixels. Create a pixel in TikTok Ads Manager, then connect again.' };
  const pixel = ((await pixels.json()).data?.list || [])[0];
  if (!pixel?.pixel_code) return { ok: false, error: 'No TikTok pixel was found. Create one in TikTok Ads Manager, then connect again.' };
  await writeAccountSecret(db, uid, 'TIKTOK_EVENTS_TOKEN', String(data.access_token));
  await writeAccountSecret(db, uid, 'TIKTOK_PIXEL_CODE', String(pixel.pixel_code));
  return { ok: true, pixelCode: String(pixel.pixel_code) };
}

async function shopifyConnect(db, uid, code, shop, env, f) {
  const t = await f(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, code }) });
  if (!t?.ok) return { ok: false, error: 'Shopify did not accept the approval. Try again.' };
  const token = (await t.json())?.access_token;
  if (!token) return { ok: false, error: 'Shopify did not return an access token.' };
  await writeAccountSecret(db, uid, 'SHOPIFY_STORE_DOMAIN', shop);
  await writeAccountSecret(db, uid, 'SHOPIFY_ACCESS_TOKEN', String(token));
  return { ok: true, shop };
}

async function ebayConnect(db, uid, code, env, f) {
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
  const t = await f('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.EBAY_RUNAME || '' }) });
  if (!t?.ok) return { ok: false, error: 'eBay did not accept the approval. Try again.' };
  const refresh = (await t.json())?.refresh_token;
  if (!refresh) return { ok: false, error: 'eBay did not return a long-term grant. Connect again.' };
  await writeAccountSecret(db, uid, 'EBAY_REFRESH_TOKEN', String(refresh));
  return { ok: true };
}

export async function finishConnect(db, provider, { uid, code, redirectUri, shop = '', env = process.env, fetchImpl = fetch }) {
  try {
    if (provider === 'shopify') return await shopifyConnect(db, uid, code, shop, env, fetchImpl);
    if (provider === 'ebay') return await ebayConnect(db, uid, code, env, fetchImpl);
    if (provider === 'google_ads') return await googleAds(db, uid, code, redirectUri, env, fetchImpl);
    if (provider === 'meta_leads') return await metaLeads(db, uid, code, redirectUri, env, fetchImpl);
    if (provider === 'tiktok_events') return await tiktokEvents(db, uid, code, env, fetchImpl);
    return { ok: false, error: 'Unknown platform.' };
  } catch (e) {
    console.error('[connect] failed:', provider, String(e?.message || '').slice(0, 120));
    return { ok: false, error: 'The connection could not be finished. Try again.' };
  }
}
