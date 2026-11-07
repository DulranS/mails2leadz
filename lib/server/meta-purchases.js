// lib/server/meta-purchases.js - sends Purchase events for consented customers' paid invoices, once each. Off without the Meta keys and the owner's data-sharing confirmation.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { loadList } from './signup.js';
import { signupsForMeta } from '../meta-capi.js';
import { purchaseBody } from '../meta-purchases.js';
import { secretsFor } from './integration-secrets.js';

const GRAPH = 'https://graph.facebook.com/v19.0';

export async function syncPurchasesToMeta(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
  env = { ...env, ...(await secretsFor(db, uid, ['META_DATASET_ID', 'META_CAPI_TOKEN'], { env }).catch(() => ({}))) }; // the owner's own keys first, the server's only as a fallback
  if (!env.META_DATASET_ID || !env.META_CAPI_TOKEN) return { sent: 0, skipped: 'no_keys' };
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (biz.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastMetaPurchaseAt || '') || now - 26 * 3600000;
    const consented = new Set(signupsForMeta(await loadList(db, uid), { since: 0 }).map((c) => String(c.email).trim().toLowerCase()));
    if (!consented.size) { await setDoc(stateRef, { lastMetaPurchaseAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const invoices = (await getDocs(query(collection(db, 'users', uid, 'invoices'), where('status', '==', 'paid'), limit(500)))).docs.map((d) => d.data());
    const body = purchaseBody({ invoices, consentedEmails: consented, since, currency: biz.currency || 'USD', eventTime: now });
    if (!body.data.length) { await setDoc(stateRef, { lastMetaPurchaseAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const r = await fetchImpl(`${GRAPH}/${encodeURIComponent(env.META_DATASET_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r?.ok) return { sent: 0, skipped: 'meta_refused' };
    await setDoc(stateRef, { lastMetaPurchaseAt: new Date(now).toISOString() }, { merge: true });
    return { sent: body.data.length };
  } catch (e) {
    console.error('[meta-purchases] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
