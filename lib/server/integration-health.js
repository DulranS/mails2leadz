// lib/server/integration-health.js - checks each connected service once a day and stores the result (spec 10.11). Never throws.
// Before this, a check ran only when the owner pressed Test, so a dead key stayed hidden until something stopped working.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { CHECK_KEYS, runConnectionCheck } from './connection-test.js';
import { secretsFor } from './integration-secrets.js';
import { connectedServices, servicesDue, healthRecord, failingServices } from '../integration-health.js';

export async function checkIntegrations(db, uid, { now = Date.now(), fetchImpl } = {}) {
  try {
    const ref = doc(db, 'users', String(uid), 'settings', 'integration_health');
    const health = await getDoc(ref).then((s) => s.data?.() || {}).catch(() => ({}));
    const names = [...new Set(Object.values(CHECK_KEYS).flat())];
    const values = await secretsFor(db, String(uid), names).catch(() => ({}));
    const due = servicesDue(connectedServices(CHECK_KEYS, values), health, now);
    const fresh = {};
    for (const svc of due) {
      const mine = Object.fromEntries(CHECK_KEYS[svc].map((k) => [k, values[k]]));
      const result = await runConnectionCheck(svc, mine, fetchImpl ? { fetchImpl } : {}).catch(() => ({ ok: false, message: 'The check could not run.' }));
      fresh[svc] = healthRecord(result, now);
    }
    if (Object.keys(fresh).length) await setDoc(ref, fresh, { merge: true });
    return { checked: Object.keys(fresh).length, failing: failingServices({ ...health, ...fresh }) };
  } catch (e) {
    console.error('[integration-health] failed:', String(uid), String(e?.message || '').slice(0, 120));
    return { checked: 0, failing: [] };
  }
}
