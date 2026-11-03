// lib/server/meta-capi-sync.js - sends each owner's newly confirmed sign-ups to Meta as hashed Lead events, once per sign-up.
// Off unless: the server has META_DATASET_ID and META_CAPI_TOKEN, AND the owner confirmed data sharing in Account.
// Never throws. Records the time of its last run, so a sign-up is sent once.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { loadList, suppressedEmails } from './signup.js';
import { signupsMetaBody, signupsForMeta } from '../meta-capi.js';

const GRAPH = 'https://graph.facebook.com/v19.0';
const MAX_PER_RUN = 1000;

export async function syncConfirmedToMeta(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
  if (!env.META_DATASET_ID || !env.META_CAPI_TOKEN) return { sent: 0, skipped: 'no_keys' };
  try {
    const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null);
    if (biz?.data?.()?.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastMetaSyncAt || '') || now - 26 * 3600000;
    const contacts = await loadList(db, uid);
    const suppressed = await suppressedEmails(db, uid);
    const fresh = signupsForMeta(contacts, { since, suppressed }).slice(0, MAX_PER_RUN);
    if (!fresh.length) { await setDoc(stateRef, { lastMetaSyncAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const body = signupsMetaBody(contacts.filter((c) => fresh.some((f) => f.email === c.email)), { since, suppressed, eventTime: now });
    const url = `${GRAPH}/${encodeURIComponent(env.META_DATASET_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let ok = false;
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      ok = !!r?.ok;
    } finally {
      clearTimeout(timer);
    }
    if (ok) await setDoc(stateRef, { lastMetaSyncAt: new Date(now).toISOString() }, { merge: true });
    return ok ? { sent: body.data.length } : { sent: 0, skipped: 'meta_refused' };
  } catch (e) {
    console.error('[meta-capi] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
