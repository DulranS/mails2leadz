// lib/billing-automation.js - what the daily job does about money, as pure functions (no Firebase, no network, no AI cost): tested.
//
//  * Subscription invoices: a subscriber already invoiced before, whose last invoice is a month old, gets the next one raised.
//    The FIRST invoice to a customer is never automatic (it may include a setup fee: that is the owner's call).
//  * Payment reminders: a polite nudge for an overdue invoice, at most MAX_AUTO_REMINDERS per invoice, at most one every
//    MIN_DAYS_BETWEEN_REMINDERS days, never to someone who already settled it. Wording is the fixed, non-threatening template.
import { buildInvoiceWrite, canRemind, invoiceState, dunningLevel, dunningFallbackDraft, DEFAULT_PAYMENT_TERMS_DAYS } from './billing.js';
import { computeSubscriptionsDue } from './recurring.js';
import { makeMoney } from './currency.js';

export const MAX_AUTO_REMINDERS = 3;
export const MIN_OVERDUE_DAYS_FOR_REMINDER = 2; // a day or two of grace before the first nudge
export const INVOICES_PER_RUN_MAX = 20;
export const REMINDERS_PER_RUN_MAX = 10;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Subscription invoices to raise now: [{ write, to, name }] (write = the invoices document, ready to save). */
export function planSubscriptionInvoices({ uid, deals = [], invoices = [], now = Date.now(), termsDays = DEFAULT_PAYMENT_TERMS_DAYS, max = INVOICES_PER_RUN_MAX }) {
  const due = computeSubscriptionsDue({ deals, invoices, now });
  const d = new Date(now);
  const note = `Subscription, ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const out = [];
  for (const s of due.list) {
    if (out.length >= max) break;
    const r = buildInvoiceWrite({ uid, email: s.email, businessName: s.businessName, amount: s.amount, note, termsDays, now: new Date(now) });
    if (r.ok) out.push({ write: r.write, to: r.write.email, name: s.businessName });
  }
  return out;
}

export const WON_LOOKBACK_DAYS = 14; // only recent wins: switching the feature on must never invoice old history

/**
 * One-off sales won recently that have no invoice yet: [{ write, to, name }]. Subscriptions are left to planSubscriptionInvoices.
 * Skips estimates, zero values, and any win already invoiced by hand (same customer, same amount, issued within two weeks of the win).
 */
export function planWonInvoices({ uid, deals = [], invoices = [], now = Date.now(), termsDays = DEFAULT_PAYMENT_TERMS_DAYS, max = INVOICES_PER_RUN_MAX }) {
  const DAYMS = 86400000;
  const out = [];
  const keys = new Set(invoices.map((i) => i && i.dealKey).filter(Boolean));
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (out.length >= max) break;
    if (!deal || deal.stage !== 'closed_won' || deal.valueIsEstimate === true) continue;
    if (Number(deal.recurringMonthly) > 0) continue;
    const amount = Number(deal.value);
    const email = String(deal.email || '').toLowerCase();
    const closed = Date.parse(deal.closedAt || '');
    if (!email || !(amount > 0) || !Number.isFinite(closed)) continue;
    if (now - closed > WON_LOOKBACK_DAYS * DAYMS || closed > now + DAYMS) continue;
    const day = new Date(closed).toISOString().slice(0, 10);
    const dealKey = `won:${email}:${day}`;
    if (keys.has(dealKey)) continue;
    const manual = invoices.some((i) => i && String(i.email || '').toLowerCase() === email && Number(i.amount) === amount && Math.abs(Date.parse(i.issuedAt || '') - closed) <= 14 * DAYMS);
    if (manual) continue;
    const r = buildInvoiceWrite({ uid, email, businessName: deal.businessName, amount, note: `Won ${day}`, termsDays, now: new Date(now) });
    if (!r.ok) continue;
    r.write.dealKey = dealKey;
    keys.add(dealKey);
    out.push({ write: r.write, to: r.write.email, name: deal.businessName });
  }
  return out;
}

/** The email that carries a new invoice. Plain, factual, with how to pay. */
export function invoiceEmailText({ name, amount, currency = 'USD', dueAt, note, senderName, paymentInfo }) {
  const money = makeMoney(currency, 2);
  const pay = paymentInfo ? `\n\nHow to pay:\n${String(paymentInfo).trim().slice(0, 400)}` : '\n\nReply to this email and I will send you the payment details.';
  return {
    subject: `Invoice: ${String(note || 'your account').slice(0, 80)}`,
    body: `Hi ${name ? String(name).slice(0, 80) : 'there'},\n\nHere is your invoice${note ? ` (${String(note).slice(0, 80)})` : ''}: ${money(amount)}, due ${ymd(new Date(dueAt).getTime())}.${pay}\n\nThank you,\n${String(senderName || 'The team').slice(0, 80)}`,
  };
}

/** Overdue invoices to nudge now: [{ invoice, level, daysOverdue, draft }], most overdue first, one per customer. */
export function planReminders({ invoices = [], now = Date.now(), max = REMINDERS_PER_RUN_MAX, currency = 'USD', senderName = '', paymentInfo = '' }) {
  const money = makeMoney(currency, 2);
  const seen = new Set();
  const cands = [];
  for (const inv of invoices) {
    if (!inv || !inv.email || inv.status === 'paid' || inv.status === 'void') continue;
    const st = invoiceState(inv, now);
    if (st.state !== 'overdue' || st.daysOverdue < MIN_OVERDUE_DAYS_FOR_REMINDER) continue;
    if ((Number(inv.reminders) || 0) >= MAX_AUTO_REMINDERS) continue;
    if (!canRemind(inv, now).ok) continue;
    cands.push({ inv, daysOverdue: st.daysOverdue });
  }
  cands.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const out = [];
  for (const { inv, daysOverdue } of cands) {
    const e = String(inv.email).toLowerCase();
    if (seen.has(e)) continue; // one email per customer per run, even with several late invoices
    seen.add(e);
    const { level } = dunningLevel(daysOverdue);
    const draft = dunningFallbackDraft({ level, name: inv.businessName, number: inv.number, amountText: money(inv.amount), dueText: ymd(new Date(inv.dueAt).getTime()), senderName, paymentInfo, daysOverdue });
    out.push({ invoice: inv, level, daysOverdue, draft });
    if (out.length >= max) break;
  }
  return out;
}
