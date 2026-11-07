// lib/server/google-customer-match.js - sends each owner's newly confirmed sign-ups to a Google Ads Customer Match list.
// Off unless the owner turns on googleSync, the server has the Google Ads keys, and the owner ticked the data-sharing box.
// Never throws. Creates the list once, then adds each run's new sign-ups in a job and runs it.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { loadList, suppressedEmails } from './signup.js';
import { signupsForMeta } from '../meta-capi.js';
import { switchState } from '../switches.js';
import { GOOGLE_ADS_API, GOOGLE_OAUTH_URL, customerMatchBatches, userListBody, customerMatchJobBody, adsHeaders } from '../google-customer-match.js';
import { secretsFor } from './integration-secrets.js';

async function accessToken(env, fetchImpl) {
  const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
  const r = await fetchImpl(GOOGLE_OAUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r?.ok) throw new Error('token refresh refused');
  return (await r.json()).access_token;
}

export async function syncConfirmedToGoogle(db, uid, { now = Date.now(), env = process.env, fetchImpl = fetch, prepared = null } = {}) {
  env = { ...env, ...(await secretsFor(db, uid, ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'], { env }).catch(() => ({}))) }; // the owner's own keys first, the server's only as a fallback
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (switchState('googleSync', biz, env).status !== 'on') return { sent: 0, skipped: 'off' };
    if (biz.dataSharingConfirmed !== true) return { sent: 0, skipped: 'not_confirmed' };
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    const state = (await getDoc(stateRef).catch(() => null))?.data?.() || {};
    const since = Date.parse(state.lastGoogleSyncAt || '') || now - 26 * 3600000;
    const contacts = prepared?.contacts ?? await loadList(db, uid);
    const suppressed = prepared?.suppressed ?? await suppressedEmails(db, uid);
    const fresh = signupsForMeta(contacts, { since, suppressed });
    if (!fresh.length) { await setDoc(stateRef, { lastGoogleSyncAt: new Date(now).toISOString() }, { merge: true }); return { sent: 0 }; }
    const cid = String(env.GOOGLE_ADS_CUSTOMER_ID).replace(/-/g, '');
    const token = await accessToken(env, fetchImpl);
    const headers = adsHeaders(env, token);
    let listRes = state.googleUserListResource;
    if (!listRes) {
      const r = await fetchImpl(`${GOOGLE_ADS_API}/customers/${cid}/userLists:mutate`, { method: 'POST', headers, body: JSON.stringify(userListBody()) });
      if (!r?.ok) return { sent: 0, skipped: 'google_refused' };
      listRes = (await r.json()).results?.[0]?.resourceName;
      if (!listRes) return { sent: 0, skipped: 'google_refused' };
      await setDoc(stateRef, { googleUserListResource: listRes }, { merge: true });
    }
    const jr = await fetchImpl(`${GOOGLE_ADS_API}/customers/${cid}/offlineUserDataJobs:create`, { method: 'POST', headers, body: JSON.stringify(customerMatchJobBody(listRes)) });
    if (!jr?.ok) return { sent: 0, skipped: 'google_refused' };
    const job = (await jr.json()).resourceName;
    let added = 0;
    for (const batch of customerMatchBatches(fresh)) {
      const ar = await fetchImpl(`${GOOGLE_ADS_API}/${job}:addOperations`, { method: 'POST', headers, body: JSON.stringify({ enablePartialFailure: true, operations: batch }) });
      if (!ar?.ok) return { sent: added, skipped: 'google_refused' };
      added += batch.length;
    }
    const rr = await fetchImpl(`${GOOGLE_ADS_API}/${job}:run`, { method: 'POST', headers, body: JSON.stringify({}) });
    if (!rr?.ok) return { sent: added, skipped: 'google_refused' };
    await setDoc(stateRef, { lastGoogleSyncAt: new Date(now).toISOString() }, { merge: true });
    return { sent: added };
  } catch (e) {
    console.error('[google-match] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
