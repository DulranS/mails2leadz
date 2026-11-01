// lib/server/erase-contact.js - runs one contact's erasure against Firestore, using the rules in lib/erase-contact.js.
import { collection, doc, getDoc, getDocs, query, where, limit, deleteDoc, updateDoc, addDoc } from '../server-firestore.js';
import { dealDocId } from '../deal-utils.js';
import { cleanEmail, holdsEmail, emailHash, sentEmailScrub, SCAN_COLLECTIONS, SCAN_SUBCOLLECTIONS, RETAINED } from '../erase-contact.js';

const MAX_PER_COLLECTION = 5000; // a per-account bound: one contact's erasure must not run unbounded on a huge account

/** @returns {Promise<{ok:true, deleted:number, scrubbed:number, retained:object, message:string} | {error:string}>} */
export async function eraseContact(db, uid, rawEmail, { now = new Date() } = {}) {
  const email = cleanEmail(rawEmail);
  if (!email) return { error: 'Enter a valid email address.' };
  const deleted = {};
  const scrubbed = {};

  const act = async (ref, collectionName, data) => {
    if (collectionName === 'sent_emails') {
      await updateDoc(ref, sentEmailScrub(now));
      scrubbed[collectionName] = (scrubbed[collectionName] || 0) + 1;
    } else {
      await deleteDoc(ref);
      deleted[collectionName] = (deleted[collectionName] || 0) + 1;
    }
  };

  for (const name of SCAN_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, name), where('userId', '==', uid), limit(MAX_PER_COLLECTION)));
    for (const d of snap.docs) if (holdsEmail(d.data(), email)) await act(d.ref, name, d.data());
  }
  for (const sub of SCAN_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, sub));
    for (const d of snap.docs) if (holdsEmail(d.data(), email)) await act(d.ref, `users.${sub}`, d.data());
  }

  const retained = {};
  for (const name of ['invoices', 'credit_notes']) {
    const snap = await getDocs(query(collection(db, name), where('userId', '==', uid), limit(MAX_PER_COLLECTION)));
    const n = snap.docs.filter((d) => holdsEmail(d.data(), email)).length;
    if (n) retained[name] = { count: n, reason: RETAINED[name] };
  }
  const sup = await getDoc(doc(db, 'suppressions', dealDocId(uid, email)));
  if (sup.exists()) retained.suppressions = { count: 1, reason: RETAINED.suppressions };

  const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);
  const totalScrubbed = Object.values(scrubbed).reduce((a, b) => a + b, 0);
  // The audit entry records THAT an erasure happened, and when, without the address itself.
  await addDoc(collection(db, 'erasure_log'), { userId: uid, emailHash: emailHash(uid, email), at: now.toISOString(), deleted: totalDeleted, scrubbed: totalScrubbed, retained: Object.keys(retained) });

  const message = totalDeleted + totalScrubbed === 0
    ? 'No personal data was found for that address.'
    : `Erased ${totalDeleted} record${totalDeleted === 1 ? '' : 's'} and cleared ${totalScrubbed} sent email${totalScrubbed === 1 ? '' : 's'}.`;
  return { ok: true, deleted: totalDeleted, scrubbed: totalScrubbed, retained, message };
}
