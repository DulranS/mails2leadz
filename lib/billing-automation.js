// lib/billing-automation.js - what the daily job does about money, as pure functions (no Firebase, no network, no AI cost): tested.
//
//  * Subscription invoices: a subscriber already invoiced before, whose last invoice is a month old, gets the next one raised.
//    The FIRST invoice to a customer is never automatic (it may include a setup fee: that is the owner's call).
//  * Payment reminders: a polite nudge for an overdue invoice, at most MAX_AUTO_REMINDERS per invoice, at most one every
//    MIN_DAYS_BETWEEN_REMINDERS days, never to someone who already settled it. Wording is the fixed, non-threatening template.
import { buildInvoiceWrite, canRemind, invoiceState, dunningLevel, dunningFallbackDraft, DEFAULT_PAYMENT_TERMS_DAYS } from './billing.js';
import { balanceOf, isForeignInvoice, foreignOwed } from './billing.js';
import { computeSubscriptionsDue } from './recurring.js';
import { makeMoney, approxList, chargeTerms } from './currency.js';

export const MAX_AUTO_REMINDERS = 3;
export const MIN_OVERDUE_DAYS_FOR_REMINDER = 2; // a day or two of grace before the first nudge
export const INVOICES_PER_RUN_MAX = 20;
export const REMINDERS_PER_RUN_MAX = 10;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Subscription invoices to raise now: [{ write, to, name }] (write = the invoices document, ready to save). */
export function planSubscriptionInvoices({ uid, deals = [], invoices = [], now = Date.now(), termsDays = DEFAULT_PAYMENT_TERMS_DAYS, max = INVOICES_PER_RUN_MAX, taxRate = 0, settings = {} }) {
  const due = computeSubscriptionsDue({ deals, invoices, now });
  const d = new Date(now);
  const note = `Subscription, ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const out = [];
  for (const s of due.list) {
    if (out.length >= max) break;
    // A deal whose charge currency is no longer offered is not invoiced (never silently in the wrong currency).
    const terms = chargeTerms(settings, s.chargeCurrency);
    if (terms.error) continue;
    const r = buildInvoiceWrite({ uid, email: s.email, businessName: s.businessName, amount: s.amount, note, termsDays, taxRate, now: new Date(now), chargeCurrency: terms.chargeCurrency, fxRate: terms.fxRate });
    if (r.ok) out.push({ write: r.write, to: r.write.email, name: s.businessName });
  }
  return out;
}

export const WON_LOOKBACK_DAYS = 14; // only recent wins: switching the feature on must never invoice old history

/**
 * One-off sales won recently that have no invoice yet: [{ write, to, name }]. Subscriptions are left to planSubscriptionInvoices.
 * Skips estimates, zero values, and any win already invoiced by hand (same customer, same amount, issued within two weeks of the win).
 */
export function planWonInvoices({ uid, deals = [], invoices = [], now = Date.now(), termsDays = DEFAULT_PAYMENT_TERMS_DAYS, max = INVOICES_PER_RUN_MAX, taxRate = 0, settings = {} }) {
  const DAYMS = 86400000;
  const out = [];
  const keys = new Set(invoices.map((i) => i && i.dealKey).filter(Boolean));
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (out.length >= max) break;
    if (!deal || deal.stage !== 'closed_won' || deal.valueIsEstimate === true) continue;
    if (deal.billingSchedule === true) continue; // invoiced by its payment milestones instead (see lib/server/milestones.js)
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
    const terms = chargeTerms(settings, deal.chargeCurrency);
    if (terms.error) continue; // not invoiced until the owner offers this currency again
    const r = buildInvoiceWrite({ uid, email, businessName: deal.businessName, amount, note: `Won ${day}`, termsDays, taxRate, now: new Date(now), chargeCurrency: terms.chargeCurrency, fxRate: terms.fxRate });
    if (!r.ok) continue;
    r.write.dealKey = dealKey;
    keys.add(dealKey);
    out.push({ write: r.write, to: r.write.email, name: deal.businessName });
  }
  return out;
}

/** The email that carries a new invoice. Plain, factual, with how to pay. */
export function invoiceEmailText({ name, amount, currency = 'USD', dueAt, note, senderName, paymentInfo, taxAmount = 0, total = 0, payLink = '', approx = '' }) {
  const money = makeMoney(currency, 2);
  const pay = paymentInfo ? `\n\nHow to pay:\n${String(paymentInfo).trim().slice(0, 400)}` : '\n\nReply to this email and I will send you the payment details.';
  return {
    subject: `Invoice: ${String(note || 'your account').slice(0, 80)}`,
    body: `Hi ${name ? String(name).slice(0, 80) : 'there'},\n\nHere is your invoice${note ? ` (${String(note).slice(0, 80)})` : ''}: ${taxAmount > 0 ? `${money(amount)} plus tax ${money(taxAmount)}, total ${money(total)}` : money(amount)}, due ${ymd(new Date(dueAt).getTime())}.${approx ? `\n\n${String(approx).slice(0, 300)}` : ''}${pay}${payLink ? `\n\nPay by card online: ${String(payLink).slice(0, 400)}` : ''}\n\nThank you,\n${String(senderName || 'The team').slice(0, 80)}`,
  };
}

export const ORDER_NUDGE_AFTER_HOURS = 24; // a storefront order unpaid for a day gets one friendly nudge, before it is overdue

/** Fixed, non-pushy wording for a storefront order that is not paid yet. Says nothing the app cannot back up. */
export function orderNudgeDraft({ number = '', name = '', amountText = '', payLink = '', senderName = '', business = '' } = {}) {
  const lines = [name ? `Hello ${name},` : 'Hello,', ''];
  lines.push(`You placed an order${business ? ` with ${business}` : ''} (invoice ${number}, ${amountText}). It is not paid yet.`, '');
  if (payLink) lines.push(`You can pay securely by card here: ${payLink}`, '');
  lines.push('If you have already paid, please ignore this message. Thank you.', '', senderName || business || '');
  return { subject: `Your order ${number} is not paid yet`.trim(), body: lines.join('\n').replace(/\s+$/, '') };
}

/**
 * Storefront orders (made on the public page) that are still unpaid a day after they were placed, and not yet overdue.
 * One nudge per invoice, one email per customer per run. Overdue invoices are left to the reminder routine.
 * @returns {{ invoice: object, draft: {subject: string, body: string} }[]}
 */
export function planOrderNudges({ invoices = [], now = Date.now(), max = REMINDERS_PER_RUN_MAX, currency = 'USD', senderName = '', business = '', payLinkOf = null, fx = [] } = {}) {
  const money = makeMoney(currency, 2);
  const seen = new Set();
  const out = [];
  for (const inv of invoices) {
    if (!inv || inv.source !== 'storefront' || !inv.email || inv.status === 'paid' || inv.status === 'void') continue;
    if (inv.orderNudgeAt || balanceOf(inv) <= 0) continue;
    const created = Date.parse(inv.createdAt || inv.issuedAt || '');
    if (!Number.isFinite(created) || now - created < ORDER_NUDGE_AFTER_HOURS * 3600000) continue;
    if (invoiceState(inv, now).state === 'overdue') continue; // the reminder routine takes over from here
    const e = String(inv.email).toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    const payLink = typeof payLinkOf === 'function' ? (payLinkOf(inv.id) || '') : '';
    const bal = balanceOf(inv);
    const list = approxList(bal, fx);
    const draft = orderNudgeDraft({ number: inv.number, name: inv.businessName, amountText: `${money(bal)}${list ? ` (about ${list}, indicative)` : ''}`, payLink, senderName, business });
    out.push({ invoice: inv, draft });
    if (out.length >= max) break;
  }
  return out;
}

export const RECEIPT_WINDOW_DAYS = 7; // receipts go to storefront orders paid in the last week; older paid orders are not mailed later

/** Fixed wording for the receipt of a paid storefront order: the invoice, the amount paid, and the lines bought. */
export function receiptDraft({ number = '', name = '', amountText = '', paidOn = '', lines = [], senderName = '', business = '' } = {}) {
  const out = [name ? `Hello ${name},` : 'Hello,', ''];
  out.push(`Thank you for your order${business ? ` with ${business}` : ''}. Invoice ${number} is paid: ${amountText} on ${paidOn}.`, '');
  if (lines.length) {
    out.push('What you bought:');
    for (const l of lines.slice(0, 20)) out.push(`- ${String(l.name || 'Item').slice(0, 80)}${l.quantity > 1 ? ` x${l.quantity}` : ''}: ${l.amountText || ''}`.replace(/:\s*$/, ''));
    out.push('');
  }
  out.push('If anything on this receipt looks wrong, reply to this email.', '', senderName || business || '');
  return { subject: `Receipt for invoice ${number}`.trim(), body: out.join('\n').replace(/\s+$/, '') };
}

/**
 * Receipts for storefront orders paid in the last RECEIPT_WINDOW_DAYS that have not had one. One per invoice.
 * @returns {{ invoice: object, draft: {subject: string, body: string} }[]}
 */
export function planReceipts({ invoices = [], now = Date.now(), max = REMINDERS_PER_RUN_MAX, currency = 'USD', senderName = '', business = '' } = {}) {
  const money = makeMoney(currency, 2);
  const out = [];
  for (const inv of invoices) {
    if (!inv || inv.source !== 'storefront' || inv.status !== 'paid' || !inv.email || inv.receiptAt) continue;
    const paid = Date.parse(inv.paidAt || '');
    if (!Number.isFinite(paid) || now - paid > RECEIPT_WINDOW_DAYS * 86400000) continue;
    const amount = Number(inv.total ?? inv.amount) || 0;
    const lines = (Array.isArray(inv.basketLines) ? inv.basketLines : []).map((l) => ({ ...l, amountText: money(Number(l.amount) || 0) }));
    const draft = receiptDraft({ number: inv.number, name: inv.businessName, amountText: money(amount), paidOn: ymd(paid), lines, senderName, business });
    out.push({ invoice: inv, draft });
    if (out.length >= max) break;
  }
  return out;
}

/** Fixed wording for "your order has shipped": carrier, tracking number and link, and the expected delivery when given. */
export function shippedDraft({ number = '', name = '', carrier = '', trackingNumber = '', trackingUrl = '', expected = '', senderName = '', business = '', parcelNumber = 1 } = {}) {
  const out = [name ? `Hello ${name},` : 'Hello,', ''];
  const part = Number(parcelNumber) > 1 ? ` (parcel ${parcelNumber})` : '';
  out.push(`Good news: order ${number}${business ? ` from ${business}` : ''} has shipped${part}.`, '');
  out.push(`Carrier: ${carrier || 'as stated by the sender'}`);
  out.push(`Tracking number: ${trackingNumber}`);
  if (trackingUrl) out.push(`Track it here: ${trackingUrl}`);
  if (expected) out.push(`Expected delivery: ${expected}`);
  out.push('', 'If anything about the delivery is not right, reply to this email.', '', senderName || business || '');
  return { subject: `Your order ${number}${part} has shipped`.trim(), body: out.join('\n').replace(/\s+$/, '') };
}

/** Overdue invoices to nudge now: [{ invoice, level, daysOverdue, draft }], most overdue first, one per customer. */
export function planReminders({ invoices = [], now = Date.now(), max = REMINDERS_PER_RUN_MAX, currency = 'USD', senderName = '', paymentInfo = '', fx = [] }) {
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
    const bal = balanceOf(inv);
    const foreign = isForeignInvoice(inv);
    const list = foreign ? '' : approxList(bal, fx);
    const amountText = foreign ? makeMoney(inv.chargeCurrency, 2)(foreignOwed(inv)) : `${money(bal)}${list ? ` (about ${list}, indicative)` : ''}`;
    const draft = dunningFallbackDraft({ level, name: inv.businessName, number: inv.number, amountText, dueText: ymd(new Date(inv.dueAt).getTime()), senderName, paymentInfo, daysOverdue });
    out.push({ invoice: inv, level, daysOverdue, draft });
    if (out.length >= max) break;
  }
  return out;
}
