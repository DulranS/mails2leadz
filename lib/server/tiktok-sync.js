// lib/server/tiktok-sync.js - sends each owner's newly confirmed sign-ups to TikTok. Off unless the owner turns on tiktokSync, the
// server has TIKTOK_PIXEL_CODE and TIKTOK_EVENTS_TOKEN, and the owner ticked the data-sharing box (same as Meta). Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { loadList, suppressedEmails } from './signup.js';
import { signupsForMeta } from '../meta-capi.js';
import { tiktokEventsBody } from '../tiktok-sync.js';
import { switchState } from '../switches.js';
import { secretsFor } from './integration-secrets.js';

const URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export async function syncConfirmedToTiktok(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch, prepared = null } = {}) {
  env = { ...env, ...(await secretsFor(db, uid, ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'], { env }).catch(() => ({}))) }; // the owner's own keys first, the server's only as a fallback
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (switchState('tiktokSync', biz, env).status !== 'on') return { sent: 0, skipped: 'off' };
    if (biz.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastTiktokSyncAt || '') || now - 26 * 3600000;
    const contacts = prepared?.contacts ?? await loadList(db, uid);
    const suppressed = prepared?.suppressed ?? await suppressedEmails(db, uid);
    const fresh = signupsForMeta(contacts, { since, suppressed }).slice(0, 1000);
    if (!fresh.length) { await setDoc(stateRef, { lastTiktokSyncAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const body = tiktokEventsBody({ pixelCode: env.TIKTOK_PIXEL_CODE, customers: fresh, eventTime: now });
    const r = await fetchImpl(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Access-Token': env.TIKTOK_EVENTS_TOKEN }, body: JSON.stringify(body) });
    const ok = !!r?.ok;
    if (ok) await setDoc(stateRef, { lastTiktokSyncAt: new Date(now).toISOString() }, { merge: true });
    return ok ? { sent: body.data.length } : { sent: 0, skipped: 'tiktok_refused' };
  } catch (e) {
    console.error('[tiktok-sync] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
