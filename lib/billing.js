// lib/billing.js - invoices and collections.
//
// These are RECORDS the owner keeps so nothing gets forgotten: who owes what, since when, who was chased and when.
// The app does not take payments and does not produce tax invoices (the owner issues those from their own tool).
// Pure functions: real invoices in, real numbers out. Nothing invented.

import { WON_STAGES, normalizeStage } from './deal-utils.js';

const DAY = 86400000;
export const DEFAULT_PAYMENT_TERMS_DAYS = 14;
export const MIN_DAYS_BETWEEN_REMINDERS = 3;

const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const money2 = (n) => Math.round(n * 100) / 100;
const oneLine = (v, max) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function monthKeyUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Validate + shape a new invoice. Returns { ok: true, write } or { ok: false, error }. */
export function buildInvoiceWrite({ uid, email, businessName, amount, termsDays = DEFAULT_PAYMENT_TERMS_DAYS, number, note, issuedAt, now = new Date() }) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Enter a valid customer email.' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  if (amt > 1e10) return { ok: false, error: 'That amount looks too large.' };
  const terms = Math.min(180, Math.max(0, Math.round(Number(termsDays))));
  const termsOk = Number.isFinite(terms) ? terms : DEFAULT_PAYMENT_TERMS_DAYS;
  const issued = toMs(issuedAt) || now.getTime();
  if (issued > now.getTime() + DAY) return { ok: false, error: 'The invoice date cannot be in the future.' };
  return {
    ok: true,
    write: {
      userId: uid,
      email: e,
      businessName: oneLine(businessName, 120),
      amount: money2(amt),
      number: oneLine(number, 40),
      note: oneLine(note, 200),
      issuedAt: new Date(issued).toISOString(),
      dueAt: new Date(issued + termsOk * DAY).toISOString(),
      status: 'open',
      paidAt: null,
      reminders: 0,
      lastReminderAt: null,
      createdAt: now.toISOString(),
    },
  };
}

/** 'paid' | 'void' | 'overdue' | 'open', plus whole days overdue (0 when not overdue). */
export function invoiceState(inv, now = Date.now()) {
  if (inv?.status === 'paid') return { state: 'paid', daysOverdue: 0 };
  if (inv?.status === 'void') return { state: 'void', daysOverdue: 0 };
  const due = toMs(inv?.dueAt);
  if (due && now > due) return { state: 'overdue', daysOverdue: Math.max(1, Math.floor((now - due) / DAY)) };
  return { state: 'open', daysOverdue: 0 };
}

/** How firm the reminder should be. Always polite: 1 = friendly nudge, 2 = firm follow-up, 3 = final reminder. */
export function dunningLevel(daysOverdue) {
  if (daysOverdue >= 21) return { level: 3, label: 'Final reminder' };
  if (daysOverdue >= 7) return { level: 2, label: 'Firm follow-up' };
  return { level: 1, label: 'Friendly reminder' };
}

/** One reminder every few days at most, so a customer is never chased daily. */
export function canRemind(inv, now = Date.now()) {
  const { state } = invoiceState(inv, now);
  if (state !== 'overdue' && state !== 'open') return { ok: false, reason: 'This invoice is already settled.' };
  const last = toMs(inv?.lastReminderAt);
  if (last && now - last < MIN_DAYS_BETWEEN_REMINDERS * DAY) {
    const left = Math.ceil((MIN_DAYS_BETWEEN_REMINDERS * DAY - (now - last)) / DAY);
    return { ok: false, reason: `Reminded recently. Wait ${left} more day${left === 1 ? '' : 's'} so they are not chased too often.` };
  }
  return { ok: true, reason: '' };
}

export function computeBilling({ invoices = [], now = Date.now() } = {}) {
  const rows = invoices
    .filter((i) => i && i.email)
    .map((i) => {
      const { state, daysOverdue } = invoiceState(i, now);
      return {
        id: i._id || i.id || '',
        email: String(i.email).toLowerCase(),
        businessName: i.businessName || '',
        amount: Number(i.amount) || 0,
        number: i.number || '',
        note: i.note || '',
        issuedAt: toMs(i.issuedAt) || toMs(i.createdAt),
        dueAt: toMs(i.dueAt),
        paidAt: toMs(i.paidAt),
        state,
        daysOverdue,
        reminders: Number(i.reminders) || 0,
        lastReminderAt: toMs(i.lastReminderAt),
      };
    });

  const live = rows.filter((r) => r.state === 'open' || r.state === 'overdue');
  const overdue = live.filter((r) => r.state === 'overdue');
  const current = live.filter((r) => r.state === 'open');
  const paid = rows.filter((r) => r.state === 'paid');
  const dueSoon = current.filter((r) => r.dueAt && r.dueAt - now <= 7 * DAY);

  const aging = [
    { id: 'current', label: 'Not due yet', amount: sum(current, (r) => r.amount), count: current.length },
    { id: 'd1_30', label: '1 to 30 days late', ...pick(overdue, (r) => r.daysOverdue <= 30) },
    { id: 'd31_60', label: '31 to 60 days late', ...pick(overdue, (r) => r.daysOverdue > 30 && r.daysOverdue <= 60) },
    { id: 'd61', label: '61+ days late', ...pick(overdue, (r) => r.daysOverdue > 60) },
  ].map((b) => ({ ...b, amount: money2(b.amount) }));

  const paidIn = (days) => paid.filter((r) => r.paidAt && now - r.paidAt <= days * DAY);
  const invoicedIn = (days) => rows.filter((r) => r.state !== 'void' && r.issuedAt && now - r.issuedAt <= days * DAY);

  const toPay = paid.filter((r) => r.paidAt && r.issuedAt && r.paidAt >= r.issuedAt);
  const avgDaysToPay = toPay.length ? Math.round(sum(toPay, (r) => (r.paidAt - r.issuedAt) / DAY) / toPay.length) : null;
  const withDue = paid.filter((r) => r.paidAt && r.dueAt);
  // paid by the end of the due day counts as on time
  const onTimeRate = withDue.length ? withDue.filter((r) => r.paidAt <= r.dueAt + DAY).length / withDue.length : null;

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(monthKeyUtc(d.getTime()));
  }
  const byMonth = Object.fromEntries(months.map((m) => [m, { month: m, collected: 0, invoiced: 0 }]));
  for (const r of paid) if (r.paidAt && byMonth[monthKeyUtc(r.paidAt)]) byMonth[monthKeyUtc(r.paidAt)].collected += r.amount;
  for (const r of rows) if (r.state !== 'void' && r.issuedAt && byMonth[monthKeyUtc(r.issuedAt)]) byMonth[monthKeyUtc(r.issuedAt)].invoiced += r.amount;
  const cashByMonth = months.map((m) => ({ ...byMonth[m], collected: money2(byMonth[m].collected), invoiced: money2(byMonth[m].invoiced) }));

  const dueNext30 = live.filter((r) => r.dueAt && r.dueAt - now <= 30 * DAY);

  const order = { overdue: 0, open: 1, paid: 2, void: 3 };
  const sorted = [...rows].sort((a, b) => order[a.state] - order[b.state] || (b.daysOverdue - a.daysOverdue) || ((a.dueAt || 0) - (b.dueAt || 0)) || ((b.paidAt || 0) - (a.paidAt || 0)));

  return {
    outstanding: money2(sum(live, (r) => r.amount)),
    outstandingCount: live.length,
    overdue: { count: overdue.length, amount: money2(sum(overdue, (r) => r.amount)), oldestDays: overdue.reduce((m, r) => Math.max(m, r.daysOverdue), 0) },
    dueSoon: { count: dueSoon.length, amount: money2(sum(dueSoon, (r) => r.amount)) },
    dueNext30: money2(sum(dueNext30, (r) => r.amount)), // everything due within 30 days, late invoices included
    aging,
    collected: { last30: money2(sum(paidIn(30), (r) => r.amount)), last90: money2(sum(paidIn(90), (r) => r.amount)), allTime: money2(sum(paid, (r) => r.amount)), paidCount: paid.length },
    invoiced: { last30: money2(sum(invoicedIn(30), (r) => r.amount)), last90: money2(sum(invoicedIn(90), (r) => r.amount)) },
    avgDaysToPay,
    onTimeRate,
    cashByMonth,
    rows: sorted,
  };
}

function pick(list, f) {
  const l = list.filter(f);
  return { amount: sum(l, (r) => r.amount), count: l.length };
}

/**
 * Won deals that have no invoice at all: money earned but never billed. `deals` are the normalised deals from computeBusinessMetrics
 * (they carry the real or estimated value). A deal with an estimated value is listed but flagged, since nobody typed that amount.
 */
export function computeUnbilled({ deals = [], invoices = [] } = {}) {
  const billed = new Set(invoices.filter((i) => i && i.status !== 'void' && i.email).map((i) => String(i.email).toLowerCase()));
  const list = deals
    .filter((d) => WON_STAGES.includes(normalizeStage(d.stage)) && !billed.has(String(d.email).toLowerCase()))
    .map((d) => ({ email: d.email, businessName: d.businessName || '', value: d.value, estimated: !!d.estimated, closedAt: d.closedAt || d.lastUpdate || null }))
    .sort((a, b) => b.value - a.value);
  return { count: list.length, amount: money2(sum(list, (d) => d.value)), estimatedCount: list.filter((d) => d.estimated).length, list };
}

/** Deterministic reminder wording. Used when AI is unavailable, and as the safety net if the AI draft drops the amount. */
export function dunningFallbackDraft({ level = 1, name, number, amountText, dueText, senderName, paymentInfo, daysOverdue = 0 }) {
  const greet = name ? `Hi ${oneLine(name, 80)},` : 'Hi there,';
  const ref = number ? `invoice ${oneLine(number, 40)}` : 'your invoice';
  const pay = paymentInfo ? `\n\nHow to pay:\n${String(paymentInfo).trim().slice(0, 400)}` : '';
  const sign = `\n\nThank you,\n${oneLine(senderName, 80) || 'The team'}`;
  if (level >= 3) {
    return {
      subject: `Final reminder: ${ref}`,
      body: `${greet}\n\nThis is a final reminder that ${ref} for ${amountText}, due ${dueText}, is still unpaid (${daysOverdue} days overdue).\n\nIf there is a problem with it, please reply and tell me so we can sort it out together. Otherwise, please arrange payment this week.${pay}${sign}`,
    };
  }
  if (level === 2) {
    return {
      subject: `Following up: ${ref} is overdue`,
      body: `${greet}\n\nI am following up on ${ref} for ${amountText}, which was due ${dueText} and is now ${daysOverdue} days overdue.\n\nCould you let me know when payment will be made? If anything is holding it up, just reply and I will help.${pay}${sign}`,
    };
  }
  return {
    subject: `Friendly reminder: ${ref}`,
    body: `${greet}\n\nA quick reminder that ${ref} for ${amountText} was due ${dueText}. If it has already been paid, thank you and please ignore this note.${pay}${sign}`,
  };
}
