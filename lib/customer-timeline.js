// lib/customer-timeline.js - one customer's history in one list: emails, quotes, invoices, bookings, support tickets, logged calls and meetings, and summarised calls (spec 2.3). Pure.
// Each event is short and read-only. Only the owner's own records are used, and the list is capped.
export const TIMELINE_MAX = 200;

const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (e) => clip(e, 200).toLowerCase();
const ms = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
import { ACTIVITY_LABEL } from './deal-activity.js';
import { stageLabel } from './work-mode.js';

/** Adds one event if it has a usable time. */
function add(out, at, kind, label, detail = '') {
  const t = ms(at);
  if (t === null) return;
  out.push({ at: new Date(t).toISOString(), kind, label: clip(label, 160), detail: clip(detail, 200) });
}

/**
 * Builds the history for one email address from the owner's records.
 * @param {{email:string, sentEmails?:object[], quotes?:object[], invoices?:object[], bookings?:object[], tickets?:object[]}} src
 */
export function customerTimeline({ email, sentEmails = [], quotes = [], invoices = [], bookings = [], tickets = [], activities = [], callNotes = [], calls = [], deals = [], mode = 'sales' } = {}) {
  const who = norm(email);
  if (!who) return [];
  const mine = (e) => norm(e) === who;
  const out = [];

  for (const m of sentEmails) {
    if (!m || !mine(m.to)) continue;
    add(out, m.sentAt, 'email.sent', `Email sent: ${clip(m.subject, 120) || 'no subject'}`);
  }
  for (const q of quotes) {
    if (!q || !mine(q.customerEmail)) continue;
    add(out, q.sentAt, 'quote.sent', `Quote sent: ${clip(q.title, 120) || 'quote'}`, q.total ? `${q.total} ${q.currency || ''}`.trim() : '');
    add(out, q.acceptedAt, 'quote.accepted', `Quote accepted: ${clip(q.title, 120) || 'quote'}`);
  }
  for (const i of invoices) {
    if (!i || !mine(i.email)) continue;
    const ref = clip(i.number || i.invoiceNumber || '', 40);
    add(out, i.emailedAt, 'invoice.sent', `Invoice emailed${ref ? `: ${ref}` : ''}`, i.total ? String(i.total) : '');
    add(out, i.paidAt, 'invoice.paid', `Invoice paid${ref ? `: ${ref}` : ''}`, i.total ? String(i.total) : '');
  }
  for (const b of bookings) {
    if (!b || !mine(b.email)) continue;
    add(out, b.startIso, 'booking', `Booking: ${clip(b.serviceName, 120) || 'appointment'}`, clip(b.status, 40));
  }
  for (const k of tickets) {
    if (!k || !mine(k.customerEmail)) continue;
    add(out, k.openedAt, 'ticket.opened', `Support question opened${k.kind ? ` (${clip(k.kind, 30)})` : ''}`, clip(k.summary, 200));
    add(out, k.resolvedAt, 'ticket.resolved', 'Support question resolved');
  }

  for (const a of activities) {
    if (!a || !mine(a.email)) continue;
    const before = out.length;
    add(out, a.at, `${clip(a.type, 20)}.logged`, ACTIVITY_LABEL[a.type] || 'Logged', clip(a.summary, 200));
    if (out.length > before) Object.assign(out[out.length - 1], { ref: a.id ? String(a.id).slice(0, 128) : '', summary: clip(a.summary, 500), nextStep: clip(a.nextStep, 200) });
  }
  for (const c of callNotes) {
    if (!c || !mine(c.email)) continue;
    add(out, c.createdAt, 'call.summarised', 'Call summarised', clip(c.summary, 200));
  }

  for (const c of calls) {
    if (!c || !mine(c.email)) continue;
    const secs = Number(c.duration) > 0 ? ` · ${Math.round(Number(c.duration))}s` : '';
    add(out, c.createdAt, 'call.placed', 'Call placed', `${clip(c.status, 40) || 'placed'}${secs}`);
  }
  for (const d of deals) {
    if (!d || !mine(d.email)) continue;
    const times = d.stageTimes && typeof d.stageTimes === 'object' ? d.stageTimes : {};
    for (const [stage, at] of Object.entries(times)) add(out, at, 'deal.stage', `Moved to ${clip(stageLabel(stage, mode), 40)}`);
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, TIMELINE_MAX);
}
