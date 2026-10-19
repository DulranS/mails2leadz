// lib/server/queue-checks.js - "is this prepared draft still right to send?" One copy, used by the review window (GET /api/draft-queue)
// and by Autosend, so a draft is held to exactly the same rules whether a person or the server presses Send.
import { collection, getDocs, query, where } from '../server-firestore.js';
import { isBlockedContact, pickOriginal, hasExistingDeal } from './route-helpers.js';
import { QUEUE_KINDS, isDraftStale } from '../draft-queue.js';
import { MAX_FOLLOW_UPS } from './draft-core.js';

/** Has anything changed since the draft was written that makes sending it wrong? (stale, replied, opted out / Lost, already emailed, step already sent) */
export async function stillGood(db, uid, q) {
  if (isDraftStale(q.createdAt)) return false;
  if (await isBlockedContact(db, uid, q.email)) return false;
  const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', q.email)));
  if (q.kind === QUEUE_KINDS.FIRST) return sent.empty && !(await hasExistingDeal(db, uid, q.email)); // already emailed, or already a deal (enquiry, customer, conversation): no cold first email
  if (sent.empty || sent.docs.some((d) => d.data().replied === true)) return false;
  return pickOriginal(sent.docs).count + 1 === q.number && q.number <= MAX_FOLLOW_UPS;
}
