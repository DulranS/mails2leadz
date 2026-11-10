// lib/events.js - events you host: capacity, RSVPs with marketing consent recorded, and a reminder the day before. Pure.
const DAY = 86400000;
export const MAX_CAPACITY = 500;

export function validEvent({ title, startsAt, place = '', capacity = null } = {}) {
  const t = String(title || '').trim();
  const s = Date.parse(startsAt || '');
  if (t.length < 3 || t.length > 120) return { ok: false, error: 'Give the event a name of three to 120 characters.' };
  if (!Number.isFinite(s)) return { ok: false, error: 'Choose a date and time.' };
  const cap = capacity === null || capacity === '' ? null : Math.floor(Number(capacity));
  if (cap !== null && !(cap >= 1 && cap <= MAX_CAPACITY)) return { ok: false, error: `Capacity must be between 1 and ${MAX_CAPACITY}, or left blank.` };
  return { ok: true, value: { title: t, startsAt: new Date(s).toISOString(), place: String(place || '').slice(0, 200), capacity: cap } };
}

/** Going count, spaces left, and whether it is full. Duplicate emails count once. */
export function rsvpStatus(event, rsvps = []) {
  const emails = new Set((Array.isArray(rsvps) ? rsvps : []).map((r) => String(r.email || '').toLowerCase()).filter(Boolean));
  const going = emails.size;
  const left = event.capacity === null || event.capacity === undefined ? null : Math.max(0, event.capacity - going);
  return { going, spotsLeft: left, full: left === 0 };
}

/** An event starting within a day, with no reminder sent yet. */
export function reminderDue(event, now = Date.now()) {
  const s = Date.parse(event.startsAt);
  return !event.reminded && s > now && s - now <= DAY;
}
