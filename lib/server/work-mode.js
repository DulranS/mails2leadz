// lib/server/work-mode.js - reads the owner's chosen work mode (sales or recruitment) from their business settings.
// Anything that cannot be read falls back to sales, so an account that has never chosen a mode behaves as before.
import { doc, getDoc } from '../server-firestore.js';
import { DEFAULT_WORK_MODE, normalizeWorkMode } from '../work-mode.js';

export async function workModeFor(db, uid) {
  try {
    const snap = await getDoc(doc(db, 'users', String(uid), 'settings', 'business'));
    return normalizeWorkMode(snap.exists() ? snap.data()?.workMode : null);
  } catch {
    return DEFAULT_WORK_MODE;
  }
}
