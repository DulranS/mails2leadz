// lib/reply-pick.js - which unreplied emails to check for replies THIS time (pure; no database, so it is easy to test).
// Re-exported from lib/reply-sync.js, where the rest of the "this lead replied" housekeeping lives.

// ---------------------------------------------------------------------------------------------------------------------
// Which unreplied emails to check for replies THIS time.
// A check call can only look at a limited number of emails (Gmail rate limits, serverless time). The old code took the
// first 50 of ALL unreplied emails in storage order, which is a fixed, arbitrary set: since most recipients never reply,
// the same 50 were re-checked forever and a reply to any other email was never seen. Now every call makes progress:
// emails never checked come first (newest first, they are the likeliest to get a reply), then the one checked longest ago.
// ---------------------------------------------------------------------------------------------------------------------
export const REPLY_CHECK_BATCH = 50;
export const REPLY_CHECK_WINDOW_DAYS = 60; // older than this is a dead lead; a very late reply is still in the owner's Gmail

const toMs = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000; // a Firestore timestamp that lost its methods
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * @param {Array<{sentAt?:any, replyCheckedAt?:any}>} items unreplied sent emails (any extra fields are kept)
 * @returns {{picked:Array, eligible:number, waiting:number}} `waiting` = eligible emails not covered by this call
 */
export function pickEmailsToCheck(items, now = Date.now(), { max = REPLY_CHECK_BATCH, windowDays = REPLY_CHECK_WINDOW_DAYS } = {}) {
  const cutoff = now - windowDays * 86400000;
  const eligible = (items || []).filter((it) => {
    const sent = toMs(it?.sentAt);
    return sent === null || sent >= cutoff; // an email with no readable date is still checked (but last)
  });
  const rank = (it) => {
    const checked = toMs(it.replyCheckedAt);
    return { never: checked === null, checked: checked ?? 0, sent: toMs(it.sentAt) ?? 0 };
  };
  const ordered = eligible.slice().sort((a, b) => {
    const x = rank(a), y = rank(b);
    if (x.never !== y.never) return x.never ? -1 : 1;           // never checked first
    if (!x.never && x.checked !== y.checked) return x.checked - y.checked; // then the longest-ago check
    return y.sent - x.sent;                                      // then newest sent first
  });
  const picked = ordered.slice(0, Math.max(1, max));
  return { picked, eligible: eligible.length, waiting: Math.max(0, eligible.length - picked.length) };
}
