// lib/deal-activity.js - a call, meeting or note the owner logs by hand against one customer. Pure.
// It shows in that customer's history next to emails, quotes, invoices and support questions.
export const ACTIVITY_TYPES = ['call', 'meeting', 'note'];
export const ACTIVITY_LABEL = { call: 'Call logged', meeting: 'Meeting logged', note: 'Note added' };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;
const DAY = 24 * 60 * 60 * 1000;
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Checks a logged entry from the owner. Returns {ok, value} or {error}.
 * A time may be given for something that happened earlier; it may not be in the future. Default: now.
 */
export function cleanActivity(body = {}, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  const email = clip(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter the customer email exactly as it appears on their records.' };
  if (!ACTIVITY_TYPES.includes(b.type)) return { error: 'Pick call, meeting or note.' };
  const summary = clip(b.summary, 500);
  if (summary.length < 3) return { error: 'Write a short summary of what happened.' };
  let at = now;
  if (b.at) {
    const t = Date.parse(String(b.at));
    if (!Number.isFinite(t)) return { error: 'That date and time is not valid.' };
    if (t > now + DAY) return { error: 'That time is in the future. Log it when it has happened.' };
    at = t;
  }
  return { ok: true, value: { email, type: b.type, summary, nextStep: clip(b.nextStep, 200), at: new Date(at).toISOString() } };
}

/** Checks an edit to a logged entry: its summary and next step. Returns {ok, value} or {error}. */
export function cleanEdit(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const summary = clip(b.summary, 500);
  if (summary.length < 3) return { error: 'Write a short summary of what happened.' };
  return { ok: true, value: { summary, nextStep: clip(b.nextStep, 200) } };
}
