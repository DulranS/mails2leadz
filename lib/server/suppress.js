// lib/server/suppress.js - the one way an address gets onto a customer's do-not-contact list (opt-out link or bounce).
// Needs the Firebase Admin SDK (the `suppressions` collection is server-written only; see firestore.rules).
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc } from '../server-firestore.js';
import { dealDocId, buildDealWrite, OPEN_STAGES, normalizeStage, reopenStageFor } from '../deal-utils.js';
import { resubscribeDecision, TOPIC_SOURCE } from '../contact-rules.js';

// v318: how strong a stop is. A bounce beats a stop-all, which beats a sales stop, which beats a topic stop.
const RANK = { unsubscribe_topic: 1, unsubscribe_link: 2, all_mail: 3, bounce: 4 };
const rankOf = (s) => RANK[s] ?? 2;

/**
 * @param {'unsubscribed'|'bounced'} reason  stored on the deal as lostReason (neither counts as a lost sale in the metrics)
 * @param {'unsubscribe_link'|'bounce'} source
 */
export async function suppressContact(db, { uid, email, reason, source, topics = [] }) {
  const addr = String(email || '').trim().toLowerCase();
  const id = dealDocId(uid, addr);
  const nowIso = new Date().toISOString();

  // 1) The suppression list: every send and AI-draft route checks this before contacting anyone.
  const before = await getDoc(doc(db, 'suppressions', id)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const keptSource = before && rankOf(before.source) > rankOf(source) ? before.source : source; // a stronger stop is never weakened
  const keptTopics = [...new Set([...(Array.isArray(before?.topics) ? before.topics : []), ...(source === TOPIC_SOURCE ? topics : [])])];
  const stopsFollowUps = source !== TOPIC_SOURCE || topics.includes('follow_ups');
  await setDoc(doc(db, 'suppressions', id), { userId: uid, email: addr, source: keptSource, topics: keptTopics, ...(keptSource === before?.source ? {} : { createdAt: nowIso }) }, { merge: true });

  // 2) An open deal becomes Lost (with the reason) so the pipeline, follow-up queue and win rate stay truthful.
  //    A customer who already bought keeps their stage: they only stop receiving outreach.
  try {
    const dealRef = doc(db, 'deals', id);
    const snap = await getDoc(dealRef);
    if (source !== TOPIC_SOURCE && snap.exists() && OPEN_STAGES.includes(normalizeStage(snap.data().stage))) {
      const write = buildDealWrite({ uid, email: addr, stage: 'closed_lost', existing: snap.data() });
      await updateDoc(dealRef, { ...write, lostReason: reason, ...(reason === 'unsubscribed' ? { unsubscribedAt: nowIso } : {}) });
    }
  } catch (e) {
    console.error('[suppress] deal update failed (suppression is saved):', e.message);
  }

  // 3) Cancel pending follow-up reminders for this person.
  try {
    const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', addr)));
    if (stopsFollowUps) for (const d of sent.docs) await updateDoc(d.ref, { followUpAt: null });
  } catch (e) {
    console.error('[suppress] could not clear follow-ups:', e.message);
  }
}

/**
 * Switch emails back on for an address that opted out through its own link. Bounces are never switched back on here.
 * The lost deal goes back to the open stage it was in before the opt-out (an opt-out made it Lost).
 * Returns { ok, changed }: ok false means the address is blocked for a reason this link cannot undo.
 */
export async function resubscribeContact(db, { uid, email }) {
  const addr = String(email || '').trim().toLowerCase();
  const ref = doc(db, 'suppressions', dealDocId(uid, addr));
  const snap = await getDoc(ref);
  const decision = resubscribeDecision(snap.exists() ? snap.data().source : null);
  if (!decision.ok) return { ok: false, changed: false };
  if (decision.changed) {
    await deleteDoc(ref);
    // The opt-out marked the deal Lost. Put it back in the open stage it was in before.
    try {
      const dealRef = doc(db, 'deals', dealDocId(uid, addr));
      const d = await getDoc(dealRef);
      if (d.exists() && d.data().lostReason === 'unsubscribed') {
        await updateDoc(dealRef, { stage: reopenStageFor(d.data()), lostReason: null, unsubscribedAt: null, closedAt: null, lastUpdate: new Date().toISOString() });
      }
    } catch (e) {
      console.error('[suppress] could not reopen the deal (switch-on is saved):', e.message);
    }
  }
  return { ok: true, changed: decision.changed };
}
