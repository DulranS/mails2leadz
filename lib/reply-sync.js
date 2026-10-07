// lib/reply-sync.js
// One place for "this lead replied": stop chasing them. Used by both the manual
// "Mark as replied" button and automatic Gmail reply detection, so a reply
// always (a) marks every email we sent them and (b) cancels pending follow-up
// reminders — otherwise the app keeps telling you to chase someone who answered.
import { collection, query, where, getDocs, updateDoc } from './server-firestore.js';

export async function cancelPendingFollowUps(db, uid, email) {
  const lead = String(email || '').toLowerCase().trim();
  if (!db || !uid || !lead) return 0;
  let cancelled = 0;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'follow_up_tasks'),
        where('leadEmail', '==', lead),
        where('status', '==', 'pending')
      )
    );
    const now = new Date().toISOString();
    for (const d of snap.docs) {
      await updateDoc(d.ref, { status: 'completed', completedAt: now, completedReason: 'lead_replied' });
      cancelled += 1;
    }
  } catch (err) {
    // Never block the reply itself on housekeeping.
    console.warn('[reply-sync] could not cancel follow-ups:', err?.message);
  }
  return cancelled;
}
