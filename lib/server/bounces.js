// lib/server/bounces.js - spot "this address does not exist" bounce notices (pure, testable).
//
// Mailing addresses that do not exist is the fastest way to damage a customer's own Gmail sending reputation, so a
// confirmed hard bounce stops all further contact with that address. Only clear "address not found" wording counts:
// a full mailbox, a spam rejection or a temporary error must NOT suppress anyone.
const HARD = /(address (was )?not found|couldn['’]t be found|could not be found|doesn['’]t exist|does not exist|no such (user|recipient|mailbox)|user unknown|unknown user|unable to receive mail|\b5\.1\.1\b|dns error)/i;

/** Which of `candidates` (addresses we emailed) does this bounce notice say do not exist? */
export function hardBounceRecipients(noticeText, candidates = []) {
  const text = String(noticeText || '').toLowerCase();
  if (!text || !HARD.test(text)) return [];
  const out = [];
  for (const c of candidates) {
    const e = String(c || '').trim().toLowerCase();
    if (e && text.includes(e) && !out.includes(e)) out.push(e);
  }
  return out;
}
