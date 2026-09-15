/**
 * Given a lead's followup_count so far and the account's own limits
 * (account.max_followups, account.min_hours_between_followups — see
 * businessProfileFrom() in lib/account.js), returns the next followup time,
 * or null if the sequence is exhausted. Never auto-deletes or gives up on
 * a lead — an exhausted sequence just stops, for a human to review.
 */
function computeNextFollowup(followupCount, limits, fromDate = new Date()) {
  if (followupCount >= limits.maxFollowups) return null;
  const next = new Date(fromDate);
  next.setHours(next.getHours() + limits.minHoursBetweenFollowups);
  return next;
}

// Status after step N has actually been SENT (set by the approve route,
// never by the draft routes — a draft only ever sets status='drafted').
function statusForStep(step) {
  return step === 0 ? 'contacted' : `followup_${step}`;
}

module.exports = { computeNextFollowup, statusForStep };
