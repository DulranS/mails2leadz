// lib/server/owner-clock.js - the owner's current offset from UTC, read from their saved autopilot settings.
import { doc, getDoc } from '../server-firestore.js';
import { effectiveOffsetMin } from '../timezone-rules.js';

/** @returns {Promise<number>} minutes east of UTC for this owner right now */
export async function ownerOffsetMin(db, uid, now = Date.now()) {
  const raw = await getDoc(doc(db, 'users', String(uid), 'settings', 'autopilot')).catch(() => null);
  const cfg = raw?.exists?.() ? raw.data() : {};
  return effectiveOffsetMin(cfg, now);
}
