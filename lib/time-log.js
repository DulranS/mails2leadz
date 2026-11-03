// lib/time-log.js - a time entry is hours logged against one customer's work on a given day. Pure.
// Stored under users/{uid}/time_entries. Validation keeps the log honest: hours in a sensible range, a real day, a real address.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function sanitizeTimeEntry(raw, { now = Date.now() } = {}) {
  const email = String(raw?.dealEmail || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return { error: "Enter the customer's email address." };
  const hours = Number(raw?.hours);
  if (!Number.isFinite(hours) || hours < 0.05 || hours > 24) return { error: 'Hours must be between 0.05 and 24 for one day.' };
  const date = String(raw?.date || new Date(now).toISOString().slice(0, 10));
  if (!DAY_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'Pick a valid day.' };
  if (Date.parse(`${date}T00:00:00Z`) > now + 86400000) return { error: 'A time entry cannot be in the future.' };
  const note = String(raw?.note || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return { entry: { dealEmail: email, hours: Math.round(hours * 100) / 100, date, note } };
}

/** Hours logged against one customer, across all their entries. */
export function loggedHoursFor(entries = [], email = '') {
  const e = String(email || '').trim().toLowerCase();
  return Math.round(entries.filter((x) => x && x.dealEmail === e).reduce((a, x) => a + (Number(x.hours) || 0), 0) * 100) / 100;
}

/** Logged hours per customer, as a map keyed by address (for the profit view). */
export function loggedByEmail(entries = []) {
  const out = {};
  for (const x of Array.isArray(entries) ? entries : []) {
    const k = String(x?.dealEmail || '').trim().toLowerCase();
    if (k) out[k] = Math.round(((out[k] || 0) + (Number(x.hours) || 0)) * 100) / 100;
  }
  return out;
}
