// lib/server/journey-replies.js - marks a journey enrolment as replied when the person answers the latest journey email.
// Reads Gmail threads only (read-only). Bounded per run. Never throws to the caller.
import { collection, doc, getDocs, limit, query, setDoc } from '../server-firestore.js';
import { contactReplied } from '../journey-replies.js';

export const MAX_JOURNEY_THREADS = 25; // bounds the Gmail calls in one run

/**
 * @param {object} opts.openBox  async () => mailbox from openMailbox (needs readThreadFrom); opened only when there is something to check
 * @returns {Promise<{checked:number, replied:number, failed:number}>}
 */
export async function checkJourneyReplies(db, uid, { openBox } = {}) {
  const none = { checked: 0, replied: 0, failed: 0 };
  try {
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const pending = enrol.filter((e) => e.lastThreadId && e.replied !== true && e.done !== true && e.email).slice(0, MAX_JOURNEY_THREADS);
    if (!pending.length || typeof openBox !== 'function') return none;
    const box = await openBox();
    if (!box?.ok || typeof box.readThreadFrom !== 'function') return none;
    let replied = 0; let failed = 0;
    for (const e of pending) {
      try {
        const from = await box.readThreadFrom(e.lastThreadId);
        if (contactReplied(from, e.email)) {
          await setDoc(doc(db, 'users', uid, 'journey_enrolments', e.id), { replied: true, repliedAt: new Date().toISOString() }, { merge: true });
          replied++;
        }
      } catch (err) {
        console.error('[journey-replies] thread check failed:', e.id, String(err?.message || '').slice(0, 120));
        failed++;
      }
    }
    return { checked: pending.length, replied, failed };
  } catch (e) {
    console.error('[journey-replies] failed:', uid, String(e?.message || '').slice(0, 120));
    return none;
  }
}
