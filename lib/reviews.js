// lib/reviews.js - the reviews the owner logs by hand (pass 341). A review of 2 stars or fewer is an alert until it is marked answered.
// Pure: no database, no network. The store is lib/server/reviews.js (users/{uid}/reviews).

export const REVIEW_TEXT_MAX = 1000;
export const BAD_REVIEW_MAX_RATING = 2;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();

/** A real calendar day as YYYY-MM-DD, or null. */
export function validDay(s) {
  const v = String(s ?? '').trim();
  if (!DAY_RE.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

export const validReviewId = (id) => ID_RE.test(String(id || ''));

/**
 * One logged review, checked. Rating is a whole number from 1 to 5. Text may be blank but is never cut short: a longer text is refused.
 * The customer email is optional; a bad one is refused rather than dropped. The date defaults to today.
 * @returns {{ok:true, review:object}|{ok:false, error:string}}
 */
export function sanitizeReview(input = {}, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const rating = Number(input?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'Rating must be a whole number from 1 to 5.' };
  const raw = String(input?.text ?? '');
  if (raw.length > REVIEW_TEXT_MAX) return { ok: false, error: `The review text is longer than ${REVIEW_TEXT_MAX} characters.` };
  const text = clean(raw);
  const email = clean(input?.customerEmail).toLowerCase();
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return { ok: false, error: 'The customer email does not look right. Leave it blank or fix it.' };
  let date = today;
  if (input?.date !== undefined && input?.date !== null && input?.date !== '') {
    date = validDay(input.date);
    if (!date) return { ok: false, error: 'The review date must be a real day (YYYY-MM-DD).' };
  }
  return { ok: true, review: { rating, text, customerEmail: email, date, answeredAt: null } };
}

/** A review is an alert when it is 2 stars or fewer and nobody has marked it answered. */
export function isBadReview(review) {
  return Number(review?.rating) <= BAD_REVIEW_MAX_RATING;
}

export function isOpenAlert(review) {
  return isBadReview(review) && !review?.answeredAt;
}

/** Open alerts only, newest review first. */
export function reviewAlerts(list = []) {
  return (Array.isArray(list) ? list : [])
    .filter(isOpenAlert)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export const openAlertCount = (list = []) => reviewAlerts(list).length;
