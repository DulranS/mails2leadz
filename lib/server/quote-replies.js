// lib/server/quote-replies.js - finds customers who replied to a sent quote, by reading its Gmail thread (read-only).
// Used by the Quotes screen button and by the nightly routine, so both give the same answer.
import { collection, doc, getDocs, limit, query, updateDoc } from '../server-firestore.js';

export const MAX_THREADS = 25; // bounds the Gmail calls in one run
const address = (from) => { const m = String(from || '').match(/<([^>]+)>/); return (m ? m[1] : String(from || '')).trim().toLowerCase(); };

/**
 * @param {object} box  the mailbox from openMailbox (needs readThreadFrom)
 * @returns {Promise<{checked:number, replied:number, failed:number}>}
 */
export async function checkQuoteReplies(db, uid, box) {
  const quotes = (await getDocs(query(collection(db, 'users', uid, 'quotes'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const pending = quotes.filter((q) => q.sentThreadId && !q.customerRepliedAt && q.customerEmail && q.status !== 'withdrawn').slice(0, MAX_THREADS);
  let replied = 0;
  let failed = 0;
  for (const q of pending) {
    try {
      const from = (await box.readThreadFrom(q.sentThreadId)).map(address);
      if (from.includes(String(q.customerEmail).toLowerCase())) {
        await updateDoc(doc(db, 'users', uid, 'quotes', q.id), { customerRepliedAt: new Date().toISOString() });
        replied++;
      }
    } catch (e) {
      console.error('[quote-replies] thread check failed:', q.id, String(e?.message || '').slice(0, 120));
      failed++;
    }
  }
  return { checked: pending.length, replied, failed };
}
