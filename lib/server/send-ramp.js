// lib/server/send-ramp.js - the account's ramp, read from its own record. Records the first send once; accounts that were already sending keep their full cap.
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from '../server-firestore.js';
import { rampCap } from '../send-ramp.js';

export async function sendRampCap(db, uid, { now = Date.now(), record = false } = {}) {
  const ref = doc(db, 'users', uid, 'settings', 'send_ramp');
  let start = null;
  try {
    const s = await getDoc(ref);
    start = s.exists() ? Date.parse(s.data().firstSendAt || '') : null;
    if (!Number.isFinite(start) && record) {
      // An account that was sending before this rule existed is not throttled: its ramp is already complete.
      const prior = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), limit(1)));
      start = prior.empty ? now : Date.parse('2000-01-01T00:00:00Z');
      await setDoc(ref, { firstSendAt: new Date(start).toISOString() }, { merge: true });
    }
  } catch (e) {
    console.error('send ramp unavailable:', e?.message);
    return rampCap(null, now); // fail safe: the stricter cap
  }
  return rampCap(Number.isFinite(start) ? start : null, now);
}
