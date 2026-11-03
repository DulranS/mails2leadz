// lib/server/queue-checks.js - "is this prepared draft still right to send?" One copy, used by the review window (GET /api/draft-queue)
// and by Autosend, so a draft is held to exactly the same rules whether a person or the server presses Send.
import { collection, getDocs, query, where } from '../server-firestore.js';
import { isBlockedContact, pickOriginal, hasExistingDeal } from './route-helpers.js';
import { QUEUE_KINDS, isDraftStale } from '../draft-queue.js';
import { MAX_FOLLOW_UPS } from './draft-core.js';
import { domainCanReceive } from './domain-mx.js';
import { mailboxVerdict } from './mailbox-verify.js';
import { claimRisk } from '../claim-risk.js';
import { switchState } from '../switches.js';
import { doc, getDoc } from '../server-firestore.js';

/** Has anything changed since the draft was written that makes sending it wrong? (stale, replied, opted out / Lost, already emailed, step already sent) */
export async function stillGood(db, uid, q) {
  if (isDraftStale(q.createdAt)) return false;
  if (await isBlockedContact(db, uid, q.email)) return false;
  // A domain that cannot receive mail would only bounce and hurt the sender's reputation: hold it (cached per domain).
  const domain = String(q.email || '').split('@')[1] || '';
  if (domain && !(await domainCanReceive(db, domain))) return false;
  // A mailbox the verifier says is invalid or disposable would bounce: hold it (only when a Hunter key is set).
  if ((await mailboxVerdict(db, uid, q.email)) === 'hold') return false;
  // Price, result, guarantee, urgency or superlative wording is held for the owner (switch: holdClaimRisk, on by default).
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  if (switchState('holdClaimRisk', biz).on && claimRisk(`${q.subject || ''} ${q.body || q.text || ''}`).flagged) return false;
  const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', q.email)));
  if (q.kind === QUEUE_KINDS.FIRST) return sent.empty && !(await hasExistingDeal(db, uid, q.email)); // already emailed, or already a deal (enquiry, customer, conversation): no cold first email
  if (sent.empty || sent.docs.some((d) => d.data().replied === true)) return false;
  return pickOriginal(sent.docs).count + 1 === q.number && q.number <= MAX_FOLLOW_UPS;
}
