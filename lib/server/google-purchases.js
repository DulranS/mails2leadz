// lib/server/google-purchases.js - sends consented buyers' paid invoices to Google Ads as conversions, once each. Off without the owner's Google Ads keys, conversion action and data-sharing confirmation.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { loadList } from './signup.js';
import { signupsForMeta } from '../meta-capi.js';
import { secretsFor } from './integration-secrets.js';
import { GOOGLE_ADS_API, GOOGLE_OAUTH_URL, adsHeaders } from '../google-customer-match.js';
import { googleConversionsBody } from '../google-purchases.js';

const ADS_NAMES = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_CONVERSION_ACTION'];

async function accessToken(env, fetchImpl) {
  const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
  const r = await fetchImpl(GOOGLE_OAUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r?.ok) throw new Error('token refresh refused');
  return (await r.json()).access_token;
}

export async function syncPurchasesToGoogle(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
  try {
    env = { ...env, ...(await secretsFor(db, uid, ADS_NAMES, { env }).catch(() => ({}))) };
    if (!ADS_NAMES.every((k) => k === 'GOOGLE_ADS_LOGIN_CUSTOMER_ID' || env[k])) return { sent: 0, skipped: 'no_keys' };
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (biz.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastGooglePurchaseAt || '') || now - 26 * 3600000;
    const consented = new Set(signupsForMeta(await loadList(db, uid), { since: 0 }).map((c) => String(c.email).trim().toLowerCase()));
    const invoices = consented.size ? (await getDocs(query(collection(db, 'users', uid, 'invoices'), where('status', '==', 'paid'), limit(500)))).docs.map((d) => d.data()) : [];
    const body = googleConversionsBody({ invoices, consentedEmails: consented, since, conversionAction: env.GOOGLE_ADS_CONVERSION_ACTION, currency: biz.currency || 'USD' });
    if (!body.conversions.length) { await setDoc(stateRef, { lastGooglePurchaseAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const cid = String(env.GOOGLE_ADS_CUSTOMER_ID).replace(/-/g, '');
    const token = await accessToken(env, fetchImpl);
    const r = await fetchImpl(`${GOOGLE_ADS_API}/customers/${cid}:uploadClickConversions`, { method: 'POST', headers: adsHeaders(env, token), body: JSON.stringify(body) });
    if (!r?.ok) return { sent: 0, skipped: 'google_refused' };
    await setDoc(stateRef, { lastGooglePurchaseAt: new Date(now).toISOString() }, { merge: true });
    return { sent: body.conversions.length };
  } catch (e) {
    console.error('[google-purchases] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
