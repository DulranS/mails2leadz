// lib/server/send-breaker.js - reads one account's recent sends and stops, and applies the rule in lib/send-breaker.js.
// Fails open: if the counts cannot be read, sending continues (the same choice the daily limits make). Cached 10 minutes per account.
import { collection, query, where, getDocs } from '../server-firestore.js';
import { breakerState, BREAKER } from '../send-breaker.js';

const DAY = 24 * 60 * 60 * 1000;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // uid -> { at, value }

async function countSince(db, coll, field, userId, sinceIso) {
  try {
    const snap = await getDocs(query(collection(db, coll), where('userId', '==', userId), where(field, '>=', sinceIso)));
    return snap.size;
  } catch (err) {
    console.warn(`[send-breaker] ${coll} count failed; sending continues`, err?.message);
    return null;
  }
}

export async function sendBreakerFor(db, uid, { now = Date.now() } = {}) {
  const hit = cache.get(uid);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const since = new Date(now - BREAKER.windowDays * DAY).toISOString();
  const [sent, stops] = await Promise.all([
    countSince(db, 'sent_emails', 'sentAt', uid, since),
    countSince(db, 'suppressions', 'createdAt', uid, since),
  ]);
  const value = sent === null || stops === null ? { ...breakerState({}), unavailable: true } : breakerState({ sent, stops });
  cache.set(uid, { at: now, value });
  return value;
}
