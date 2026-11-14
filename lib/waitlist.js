// lib/waitlist.js - people waiting for a sold-out item or a full event. Only what they asked for is kept; nobody is added without their own request. Pure.
const MAX = 500;

/** Adds one person to the waiting list for one item or event. The same person is never added twice for the same item. */
export function joinWaitlist(list = [], { subject, name = '', email = '', at = new Date().toISOString() } = {}) {
  const s = String(subject || '').trim().slice(0, 120);
  const e = String(email || '').trim().toLowerCase();
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { list, added: false };
  const rows = Array.isArray(list) ? list : [];
  if (rows.some((w) => w.subject === s && w.email === e)) return { list: rows, added: false };
  return { list: [...rows, { subject: s, name: String(name || '').slice(0, 120), email: e, at }].slice(0, MAX), added: true };
}

/** Who to tell first when places open: the first people who asked, as many as there are places. */
export function toNotify(list = [], subject, placesOpen) {
  const n = Math.max(0, Math.floor(Number(placesOpen) || 0));
  return (Array.isArray(list) ? list : []).filter((w) => w.subject === subject).slice(0, n);
}
