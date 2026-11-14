// lib/customer-links.js - private links for customers: a ticket's status and rating, and a deal room. Each link needs a secret key. Pure.
import crypto from 'node:crypto';

export const newKey = () => crypto.randomBytes(16).toString('hex');

/** True only when the key matches exactly. Compared in constant time. */
export function checkKey(stored, given) {
  if (!stored || !given) return false;
  const a = Buffer.from(String(stored)), b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Customer-facing paths for a ticket. */
export function ticketPaths(uid, ticketId, key) {
  const q = `?k=${encodeURIComponent(key)}`;
  return { status: `/support/${uid}/${ticketId}${q}`, rate: `/rate/${uid}/${ticketId}${q}` };
}

/** Average rating and response rate over the last ninety days. Null when nothing has been asked. */
export function csatSummary(tickets = [], now = Date.now()) {
  const DAY = 86400000;
  const recent = (Array.isArray(tickets) ? tickets : []).filter((t) => t && t.status === 'resolved' && Date.parse(t.resolvedAt || '') >= now - 90 * DAY);
  const rated = recent.filter((t) => Number.isFinite(Number(t.csatScore)));
  const avg = rated.length ? Math.round((rated.reduce((a, t) => a + Number(t.csatScore), 0) / rated.length) * 10) / 10 : null;
  return { avg, responses: rated.length, asked: recent.length, responseRate: recent.length ? Math.round((rated.length / recent.length) * 100) : null };
}

/** Share of support questions in the last thirty days that the automatic answers handled without a person. */
export function deflectionRate(tickets = [], now = Date.now()) {
  const DAY = 86400000;
  const recent = (Array.isArray(tickets) ? tickets : []).filter((t) => t && Date.parse(t.createdAt || t.at || '') >= now - 30 * DAY);
  if (!recent.length) return null;
  const auto = recent.filter((t) => String(t.stageKey || '').startsWith('auto:')).length;
  return Math.round((auto / recent.length) * 100);
}

/** "step | done" lines for a deal room. Bad lines are skipped. */
export function parseSteps(text = '') {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [label = '', done = ''] = line.split('|').map((x) => x.trim());
    if (!label) continue;
    out.push({ label: label.slice(0, 160), done: /^y(es)?$/i.test(done) });
    if (out.length >= 30) break;
  }
  return out;
}
