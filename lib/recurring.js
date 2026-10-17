// lib/recurring.js - subscription business value from the owner's own deals: MRR / ARR, churn, lifetime value, renewals.
// Pure. Nothing is estimated: a deal counts only when the owner entered a monthly amount (deal.recurringMonthly), and the numbers
// that need history (churn, lifetime value) say "not enough data" instead of guessing. A one-off business has no such deals and sees nothing.
import { WON_STAGES, normalizeStage } from './deal-utils.js';

const DAY = 86400000;
const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const r0 = (n) => Math.round(n);
const r2 = (n) => Math.round(n * 100) / 100;
const MAX_LIFETIME_MONTHS = 60; // never promise more than 5 years of value from a churn rate measured on a few customers
const MIN_BASE_FOR_CHURN = 5; // fewer subscriptions than this at the start of the window: the rate is shown but flagged as a rough guide

function endOfMonthUtc(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;
}

/** @param {{ deals?: object[], now?: number }} args deals: the raw deal documents (one per email; the latest write wins). */
export function computeRecurring({ deals = [], now = Date.now() } = {}) {
  const byEmail = new Map();
  for (const d of deals) {
    if (!d?.email) continue;
    const k = String(d.email).toLowerCase();
    const prev = byEmail.get(k);
    if (!prev || (toMs(d.lastUpdate) || 0) >= (toMs(prev.lastUpdate) || 0)) byEmail.set(k, d);
  }
  const subs = [];
  for (const d of byEmail.values()) {
    const amount = Number(d.recurringMonthly);
    if (!(amount > 0) || !WON_STAGES.includes(normalizeStage(d.stage))) continue;
    const start = toMs(d.closedAt) || toMs(d.createdAt) || now;
    subs.push({ email: d.email, businessName: d.businessName || '', amount, start, churnedAt: toMs(d.churnedAt), renewalAt: toMs(d.renewalAt) });
  }
  if (!subs.length) return { any: false };

  const activeAt = (s, t) => s.start <= t && (!s.churnedAt || s.churnedAt > t);
  const active = subs.filter((s) => !s.churnedAt);
  const mrr = active.reduce((a, s) => a + s.amount, 0);

  const inLast = (t, days) => t !== null && t <= now && now - t <= days * DAY;
  const newMrr30 = subs.filter((s) => inLast(s.start, 30)).reduce((a, s) => a + s.amount, 0);
  const churnedMrr30 = subs.filter((s) => inLast(s.churnedAt, 30)).reduce((a, s) => a + s.amount, 0);

  // Churn over the last 90 days among the subscriptions that existed at the start of that window.
  const t0 = now - 90 * DAY;
  const base = subs.filter((s) => activeAt(s, t0));
  const lost = base.filter((s) => s.churnedAt && s.churnedAt <= now);
  const rate90 = base.length ? lost.length / base.length : null;
  const monthlyRate = rate90 === null ? null : 1 - Math.pow(1 - rate90, 1 / 3);
  const arpa = active.length ? mrr / active.length : 0;
  let ltv = null;
  if (monthlyRate !== null && monthlyRate > 0 && arpa > 0) {
    const months = 1 / monthlyRate;
    ltv = { value: r0(arpa * Math.min(MAX_LIFETIME_MONTHS, months)), months: Math.round(Math.min(MAX_LIFETIME_MONTHS, months) * 10) / 10, capped: months > MAX_LIFETIME_MONTHS };
  }

  // MRR at the end of each of the last 6 months, rebuilt from start / churn dates with today's amounts (a price change is not tracked).
  const mrrByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const end = Math.min(endOfMonthUtc(d.getTime()), now);
    mrrByMonth.push({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, mrr: r2(subs.filter((s) => activeAt(s, end)).reduce((a, s) => a + s.amount, 0)) });
  }

  // Renewals: who renews in the next 30 days, and whose renewal date has passed with no record of them leaving (confirm, or they quietly lapsed).
  const dueSoonList = active.filter((s) => s.renewalAt && s.renewalAt >= now && s.renewalAt - now <= 30 * DAY).sort((a, b) => a.renewalAt - b.renewalAt);
  const lapsedList = active.filter((s) => s.renewalAt && s.renewalAt < now).sort((a, b) => a.renewalAt - b.renewalAt);
  const row = (s) => ({ email: s.email, businessName: s.businessName, amount: r2(s.amount), renewalAt: new Date(s.renewalAt).toISOString(), days: Math.round((s.renewalAt - now) / DAY) });

  return {
    any: true,
    mrr: r2(mrr), arr: r2(mrr * 12), subscribers: active.length, arpa: r2(arpa),
    newMrr30: r2(newMrr30), churnedMrr30: r2(churnedMrr30), netNewMrr30: r2(newMrr30 - churnedMrr30),
    churned: { total: subs.length - active.length, last90: lost.length },
    churn: { base: base.length, lost: lost.length, rate90, monthlyRate, confidence: base.length >= MIN_BASE_FOR_CHURN ? 'ok' : 'rough' },
    ltv,
    mrrByMonth,
    renewals: {
      dueSoon: { count: dueSoonList.length, mrr: r2(dueSoonList.reduce((a, s) => a + s.amount, 0)), list: dueSoonList.map(row) },
      lapsed: { count: lapsedList.length, mrr: r2(lapsedList.reduce((a, s) => a + s.amount, 0)), list: lapsedList.map(row) },
    },
  };
}

const BILLING_PERIOD_DAYS = 28; // a subscriber whose last invoice is at least this old is due the next one

/**
 * Active subscribers who have been invoiced before but not in the last ~month: the next invoice is due. (A subscriber who was never
 * invoiced is already listed by "Won but not invoiced", so they are not repeated here.) Voided invoices do not count.
 * @param {{ deals?: object[], invoices?: object[], now?: number }} args raw deal and invoice documents
 */
export function computeSubscriptionsDue({ deals = [], invoices = [], now = Date.now() } = {}) {
  const last = new Map();
  for (const i of invoices) {
    if (!i?.email || i.status === 'void') continue;
    const at = toMs(i.issuedAt) || toMs(i.createdAt);
    if (!at) continue;
    const k = String(i.email).toLowerCase();
    if (!last.has(k) || at > last.get(k)) last.set(k, at);
  }
  const byEmail = new Map();
  for (const d of deals) {
    if (!d?.email) continue;
    const k = String(d.email).toLowerCase();
    const prev = byEmail.get(k);
    if (!prev || (toMs(d.lastUpdate) || 0) >= (toMs(prev.lastUpdate) || 0)) byEmail.set(k, d);
  }
  const list = [];
  for (const [k, d] of byEmail) {
    const amount = Number(d.recurringMonthly);
    if (!(amount > 0) || !WON_STAGES.includes(normalizeStage(d.stage)) || toMs(d.churnedAt) || !last.has(k)) continue;
    const days = Math.floor((now - last.get(k)) / DAY);
    if (days < BILLING_PERIOD_DAYS) continue;
    list.push({ email: d.email, businessName: d.businessName || '', amount: r2(amount), lastInvoicedAt: new Date(last.get(k)).toISOString(), daysSince: days });
  }
  list.sort((a, b) => b.daysSince - a.daysSince);
  return { count: list.length, amount: r2(list.reduce((a, r) => a + r.amount, 0)), list };
}
