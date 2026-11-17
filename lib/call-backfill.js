// lib/call-backfill.js - links older dialled calls to the customer whose phone number it was. Pure.
// Older calls kept only the number dialled. A number links to a customer only when exactly one customer has it,
// matched on the last nine digits (so +94 and 0 prefixes both match). Ambiguous numbers are left unlinked.
export const MATCH_DIGITS = 9;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;
const digits = (v) => String(v ?? '').replace(/\D/g, '');
export const RETRY_GAP_MS = 7 * 24 * 60 * 60 * 1000; // a call that did not match is looked at again after a week

/** True when a call was checked for a customer recently and did not match. */
export function recentlyTried(c, now = Date.now()) {
  const t = Date.parse(c?.emailLinkTriedAt || '');
  return Number.isFinite(t) && now - t < RETRY_GAP_MS;
}

/** The last nine digits of a phone number, or '' when there are not enough. */
export function lastDigits(v) {
  const d = digits(v);
  return d.length >= MATCH_DIGITS ? d.slice(-MATCH_DIGITS) : '';
}

/** Number -> the one email that has it. A number held by more than one email is left out. */
export function phoneToEmail(sources = []) {
  const seen = new Map();
  for (const s of Array.isArray(sources) ? sources : []) {
    const email = String(s?.email || '').trim().toLowerCase();
    const key = lastDigits(s?.phone);
    if (!key || !EMAIL_RE.test(email)) continue;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(email);
  }
  const out = new Map();
  for (const [key, emails] of seen) if (emails.size === 1) out.set(key, [...emails][0]);
  return out;
}

/** Calls with no customer email whose number matches exactly one customer. Returns [{id, email}]. */
export function callsToLink(calls = [], sources = [], now = Date.now()) {
  const map = phoneToEmail(sources);
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => c && c.id && !c.email && !recentlyTried(c, now))
    .map((c) => ({ id: c.id, email: map.get(lastDigits(c.toPhone)) || '' }))
    .filter((x) => x.email);
}
