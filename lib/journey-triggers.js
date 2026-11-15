// lib/journey-triggers.js - who should join a journey because something just happened (spec 7.2). Pure: nothing is written here.
// A journey with a "trigger:" line enrols each person once, after the journey was saved (never a backlog of old customers).
import { JOURNEY_TRIGGERS } from './journey.js';

export const TRIGGER_LOOKBACK_DAYS = 3;
const DAY = 86400000;
const norm = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An event time that is in the past and within the lookback window. */
function recent(at, now, days) {
  const t = Date.parse(at || '');
  return Number.isFinite(t) && t <= now && now - t <= days * DAY ? t : null;
}

/**
 * The people to enrol now: [{ journeyId, email, trigger }]. A person already in a journey is never enrolled twice.
 * An event counts only when it happened after the journey was saved, so turning a trigger on never reaches back in time.
 */
export function triggeredEnrolments({ journeys = [], deals = [], invoices = [], tickets = [], enrolments = [], now = Date.now(), days = TRIGGER_LOOKBACK_DAYS, max = 50 } = {}) {
  const have = new Set((Array.isArray(enrolments) ? enrolments : []).map((e) => `${e.journeyId}|${norm(e.email)}`));
  const events = {
    deal_won: (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won').map((d) => ({ email: d.email, at: d.stageTimes?.closed_won || d.closedAt || d.lastUpdate })),
    invoice_paid: (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.status === 'paid').map((i) => ({ email: i.email, at: i.paidAt })),
    ticket_resolved: (Array.isArray(tickets) ? tickets : []).map((k) => ({ email: k && k.customerEmail, at: k && k.resolvedAt })),
  };
  const out = [];
  const picked = new Set();
  for (const j of Array.isArray(journeys) ? journeys : []) {
    if (!j || !JOURNEY_TRIGGERS.includes(j.trigger)) continue;
    const savedAt = Date.parse(j.createdAt || '');
    if (!Number.isFinite(savedAt)) continue; // a journey with no save time is never triggered: no backlog
    for (const ev of events[j.trigger] || []) {
      const at = recent(ev.at, now, days);
      if (at === null || at < savedAt) continue;
      const email = norm(ev.email);
      if (!EMAIL_RE.test(email)) continue;
      const key = `${j.id}|${email}`;
      if (have.has(key) || picked.has(key)) continue;
      picked.add(key);
      out.push({ journeyId: String(j.id), email, trigger: j.trigger });
      if (out.length >= max) return out;
    }
  }
  return out;
}
