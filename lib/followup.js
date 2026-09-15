const business = require('../business.config');

/**
 * Given a lead's current followup_count, returns the next followup time,
 * or null if the sequence is exhausted (caller should mark status 'lost'
 * or leave for manual review — never auto-deletes a lead).
 */
function computeNextFollowup(followupCount, fromDate = new Date()) {
  if (followupCount >= business.limits.maxFollowups) return null;
  const next = new Date(fromDate);
  next.setHours(next.getHours() + business.limits.minHoursBetweenFollowups);
  return next;
}

function statusForStep(step) {
  return step === 0 ? 'contacted' : `followup_${step}`;
}

module.exports = { computeNextFollowup, statusForStep };
