// lib/server/reviews.js - the owner's logged reviews in users/{uid}/reviews (pass 341). One document per review; reads are capped.
import { collection, doc, addDoc, getDocs, query, orderBy, limit, updateDoc } from '../server-firestore.js';
import { validReviewId } from '../reviews.js';

export const REVIEW_LIST_MAX = 300;

export async function listReviews(db, uid) {
  const snap = await getDocs(query(collection(db, 'users', String(uid), 'reviews'), orderBy('createdAt', 'desc'), limit(REVIEW_LIST_MAX)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** @returns {Promise<string>} the new review's id */
export async function addReview(db, uid, review, { createdBy = '', now = Date.now() } = {}) {
  const ref = await addDoc(collection(db, 'users', String(uid), 'reviews'), {
    ...review,
    createdAt: new Date(now).toISOString(),
    createdBy: String(createdBy).slice(0, 128),
  });
  return ref.id;
}

/** @returns {Promise<{ok:boolean, error?:string}>} */
export async function markReviewAnswered(db, uid, id, { now = Date.now() } = {}) {
  if (!validReviewId(id)) return { ok: false, error: 'That review was not found.' };
  await updateDoc(doc(db, 'users', String(uid), 'reviews', id), { answeredAt: new Date(now).toISOString() });
  return { ok: true };
}
