// lib/server/daily-count.js - "how many did this customer send today?" for the daily safety limits.
//
// Every sentAt / createdAt in this app is stored as an ISO string. Comparing that field with a Date or Firestore
// Timestamp matches nothing (and raises no error), which silently disabled the daily limits. So: compare ISO strings.
// The "day" is the server's calendar day, and the same helper is used by the send route and the quota display.
import { collection, query, where, getDocs } from '../server-firestore.js';

export const startOfTodayIso = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
export const startOfTomorrowIso = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

/** Epoch ms for any timestamp shape we may have stored (ISO string, number, Date, Firestore Timestamp). */
export function toMillis(v) {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Count one customer's docs in `coll` whose `field` is today. Fast path: one string-range query (needs the
 * userId + field composite index). If the index is missing, falls back to reading that customer's docs and
 * filtering in code, so the count is right either way.
 * @returns {Promise<number|null>} null when the count could not be read at all (caller decides how to fail).
 */
export async function countToday(db, coll, field, userId, now = new Date()) {
  const startIso = startOfTodayIso(now);
  const startMs = new Date(startIso).getTime();
  try {
    const snap = await getDocs(query(collection(db, coll), where('userId', '==', userId), where(field, '>=', startIso)));
    return snap.size;
  } catch (err) {
    if (err?.code !== 'failed-precondition' && err?.code !== 9) {
      console.warn(`[daily-count] ${coll} count failed:`, err?.message);
      return null;
    }
  }
  try {
    const snap = await getDocs(query(collection(db, coll), where('userId', '==', userId)));
    return snap.docs.filter((d) => (toMillis(d.data()[field]) ?? -1) >= startMs).length;
  } catch (err) {
    console.warn(`[daily-count] ${coll} fallback failed:`, err?.message);
    return null;
  }
}
