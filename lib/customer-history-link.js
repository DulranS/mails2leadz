// lib/customer-history-link.js - the link from a customer row to that customer's history page, with the email filled in. Pure.
// A value that is not an email address gives the plain history page, so nothing odd ends up in the URL.
// Plain address characters only (no &, =, /, ?, spaces), so the value is safe in a link even before encoding.
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function historyHref(email) {
  const addr = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) return '/history';
  return `/history?email=${encodeURIComponent(addr)}`;
}
