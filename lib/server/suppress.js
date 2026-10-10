// lib/server/suppress.js - the one way an address gets onto a customer's do-not-contact list (opt-out link or bounce).
// Needs the Firebase Admin SDK (the `suppressions` collection is server-written only; see firestore.rules).
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc } from '../server-firestore.js';
import { dealDocId, buildDealWrite, OPEN_STAGES, normalizeStage } from '../deal-utils.js';

/**
 * @param {'unsubscribed'|'bounced'} reason  stored on the deal as lostReason (neither counts as a lost sale in the metrics)
 * @param {'unsubscribe_link'|'bounce'} source
 */
export async function suppressContact(db, { uid, email, reason, source }) {
  const addr = String(email || '').trim().toLowerCase();
  const id = dealDocId(uid, addr);
  const nowIso = new Date().toISOString();

  // 1) The suppression list: every send and AI-draft route checks this before contacting anyone.
  await setDoc(doc(db, 'suppressions', id), { userId: uid, email: addr, source, createdAt: nowIso }, { merge: true });

  // 2) An open deal becomes Lost (with the reason) so the pipeline, follow-up queue and win rate stay truthful.
  //    A customer who already bought keeps their stage: they only stop receiving outreach.
  try {
    const dealRef = doc(db, 'deals', id);
    const snap = await getDoc(dealRef);
    if (snap.exists() && OPEN_STAGES.includes(normalizeStage(snap.data().stage))) {
      const write = buildDealWrite({ uid, email: addr, stage: 'closed_lost', existing: snap.data() });
      await updateDoc(dealRef, { ...write, lostReason: reason, ...(reason === 'unsubscribed' ? { unsubscribedAt: nowIso } : {}) });
    }
  } catch (e) {
    console.error('[suppress] deal update failed (suppression is saved):', e.message);
  }

  // 3) Cancel pending follow-up reminders for this person.
  try {
    const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', addr)));
    for (const d of sent.docs) await updateDoc(d.ref, { followUpAt: null });
  } catch (e) {
    console.error('[suppress] could not clear follow-ups:', e.message);
  }
}
