// lib/server/inbound-stop.js - when a person contacts the business themselves (enquiry or booking), stop any scheduled
// cold follow-up to them. Someone who has just asked to talk must not get a sales nudge from the outbound sequence.
import { collection, getDocs, limit, query, updateDoc, where } from '../server-firestore.js';

const MAX_SENT_RECORDS = 50; // the most sent-email records one address can have that we will check in one go

/** @returns {Promise<number>} how many scheduled follow-ups were stopped */
export async function stopColdFollowUps(db, uid, email, reason, now = new Date()) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !uid) return 0;
  const snap = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', e), limit(MAX_SENT_RECORDS)));
  let stopped = 0;
  for (const d of snap.docs) {
    if (!d.data().followUpAt) continue;
    await updateDoc(d.ref, { followUpAt: null, followUpStoppedBy: String(reason || 'inbound').slice(0, 40), followUpStoppedAt: now.toISOString() });
    stopped++;
  }
  return stopped;
}
