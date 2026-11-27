// lib/journey-replies.js - did the person reply in the thread of their latest journey email? Pure: the Gmail read is in lib/server/journey-replies.js.
// A reply is a message in that thread From the person's own address. Bounce notices and the owner's own messages do not count.

/** The bare address from a "Name <a@b.c>" or "a@b.c" header value, lower case. */
export function addressOf(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

/** True when one of the thread's From headers is the person's address. */
export function contactReplied(fromHeaders = [], email = '') {
  const who = String(email || '').trim().toLowerCase();
  if (!who) return false;
  return (Array.isArray(fromHeaders) ? fromHeaders : []).some((h) => addressOf(h) === who);
}
