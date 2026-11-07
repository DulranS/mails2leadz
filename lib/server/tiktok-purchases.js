// lib/server/tiktok-purchases.js - sends CompletePayment events for consented customers' paid invoices, once each. Off without the owner's TikTok keys and data-sharing confirmation.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { loadList } from './signup.js';
import { signupsForMeta } from '../meta-capi.js';
import { secretsFor } from './integration-secrets.js';
import { tiktokPurchaseBody } from '../tiktok-purchases.js';

const URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export async function syncPurchasesToTiktok(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
  try {
    env = { ...env, ...(await secretsFor(db, uid, ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'], { env }).catch(() => ({}))) };
    if (!env.TIKTOK_PIXEL_CODE || !env.TIKTOK_EVENTS_TOKEN) return { sent: 0, skipped: 'no_keys' };
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (biz.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastTiktokPurchaseAt || '') || now - 26 * 3600000;
    const consented = new Set(signupsForMeta(await loadList(db, uid), { since: 0 }).map((c) => String(c.email).trim().toLowerCase()));
    const invoices = consented.size ? (await getDocs(query(collection(db, 'users', uid, 'invoices'), where('status', '==', 'paid'), limit(500)))).docs.map((d) => d.data()) : [];
    const body = tiktokPurchaseBody({ invoices, consentedEmails: consented, since, pixelCode: env.TIKTOK_PIXEL_CODE, currency: biz.currency || 'USD', eventTime: now });
    if (!body.data.length) { await setDoc(stateRef, { lastTiktokPurchaseAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const { eventTime, ...payload } = body;
    const r = await fetchImpl(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Access-Token': env.TIKTOK_EVENTS_TOKEN }, body: JSON.stringify(payload) });
    if (!r?.ok) return { sent: 0, skipped: 'tiktok_refused' };
    await setDoc(stateRef, { lastTiktokPurchaseAt: new Date(now).toISOString() }, { merge: true });
    return { sent: body.data.length };
  } catch (e) {
    console.error('[tiktok-purchases] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
