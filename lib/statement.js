// lib/statement.js - a customer's statement of account: everything billed, paid and credited, with the running balance and
// how long each open amount has been overdue. Pure: no database. Built on the same rules as billing (lib/billing.js), so a
// statement and the invoice list always agree.
//
// Assumptions, stated so they can be checked: voided invoices are left out (they never happened); every credit note reduces
// what the customer owes, whether it is held, applied or refunded in cash (a refund moves cash, not the receivable);
// a payment is dated by the invoice's paid date, or its issue date when no paid date was recorded (part payments).
import { invoiceBase, paidSoFar, balanceOf, invoiceState, isForeignInvoice } from './billing.js';
import { originalTotal } from './credit-apply.js';

export const AGING_BUCKETS = ['current', 'days1to30', 'days31to60', 'days61to90', 'over90'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ms = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };
const day = (v) => (ms(v) ? new Date(ms(v)).toISOString().slice(0, 10) : '');

/** How much of the open balance is not yet due, and how much is 1-30, 31-60, 61-90 and over 90 days past due. */
export function agingOf(invoices = [], now = Date.now()) {
  const out = Object.fromEntries(AGING_BUCKETS.map((k) => [k, 0]));
  for (const inv of invoices) {
    const bal = balanceOf(inv);
    if (bal <= 0) continue;
    const { state, daysOverdue } = invoiceState(inv, now);
    if (state !== 'overdue') { out.current = r2(out.current + bal); continue; }
    const key = daysOverdue <= 30 ? 'days1to30' : daysOverdue <= 60 ? 'days31to60' : daysOverdue <= 90 ? 'days61to90' : 'over90';
    out[key] = r2(out[key] + bal);
  }
  return out;
}

/**
 * @param {object} args
 * @param {Array}  args.invoices  the account's invoices (any customer; filtered here by email)
 * @param {Array}  args.credits   the account's credit notes (filtered here by email)
 * @returns {{customerEmail, customerName, lines, totals:{billed,paid,credited,outstanding}, aging, lastPaidAt}}
 */
export function buildStatement({ invoices = [], credits = [], customerEmail = '', customerName = '', now = Date.now() } = {}) {
  const email = String(customerEmail || '').trim().toLowerCase();
  const mine = invoices.filter((i) => String(i.email || '').trim().toLowerCase() === email && i.status !== 'void');
  const notes = credits.filter((c) => String(c.customerEmail || '').trim().toLowerCase() === email);

  const entries = [];
  for (const inv of mine) {
    entries.push({ at: ms(inv.issuedAt), date: day(inv.issuedAt), type: 'Invoice', ref: inv.number || '', description: `${inv.note || 'Invoice'}${isForeignInvoice(inv) ? ` (charged ${inv.chargeCurrency} ${Number(inv.chargeTotal).toFixed(2)} at a rate fixed on issue)` : ''}`, debit: r2(originalTotal(inv)), credit: 0 });
    const paid = paidSoFar(inv);
    if (paid > 0) {
      const dated = ms(inv.paidAt) ? inv.paidAt : inv.issuedAt;
      entries.push({ at: ms(dated), date: day(dated), type: 'Payment', ref: inv.number || '', description: inv.paidAt ? 'Payment received' : 'Part payment (paid date not recorded)', debit: 0, credit: r2(paid) });
    }
    // Card refunds given back to the customer (Pass 120): they raise what the customer is owed back to the business's side.
    for (const rf of Array.isArray(inv.cardRefunds) ? inv.cardRefunds : []) {
      const amt = Number(rf.amount) || 0;
      if (amt > 0) entries.push({ at: ms(rf.at), date: day(rf.at), type: 'Refund', ref: inv.number || '', description: 'Refund to card', debit: r2(amt), credit: 0 });
    }
    // Refunds the owner paid back by their own means (bank transfer, cash), recorded on the order.
    for (const rf of Array.isArray(inv.manualRefunds) ? inv.manualRefunds : []) {
      const amt = Number(rf.amount) || 0;
      if (amt > 0) entries.push({ at: ms(rf.at), date: day(rf.at), type: 'Refund', ref: inv.number || '', description: `Refund paid by hand${rf.method ? ` (${String(rf.method).slice(0, 40)})` : ''}`, debit: r2(amt), credit: 0 });
    }
  }
  for (const c of notes) {
    entries.push({ at: ms(c.issuedAt), date: day(c.issuedAt), type: 'Credit note', ref: c.number || '', description: c.reason || 'Credit', debit: 0, credit: r2(c.amount) });
  }
  entries.sort((a, b) => a.at - b.at);

  let balance = 0;
  const lines = entries.map((e) => {
    balance = r2(balance + e.debit - e.credit);
    const { at, ...rest } = e;
    return { ...rest, balance };
  });

  const billed = r2(lines.reduce((s, l) => s + (l.type === 'Invoice' ? l.debit : 0), 0));
  const paid = r2(mine.reduce((s, i) => s + paidSoFar(i), 0));
  const credited = r2(notes.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const refunded = r2(mine.reduce((s, i) => s + [...(Array.isArray(i.cardRefunds) ? i.cardRefunds : []), ...(Array.isArray(i.manualRefunds) ? i.manualRefunds : [])].reduce((t, rf) => t + (Number(rf.amount) || 0), 0), 0));
  const outstanding = r2(billed - paid - credited + refunded);
  const open = mine.filter((i) => balanceOf(i) > 0);
  const lastPaid = mine.map((i) => i.paidAt).filter(Boolean).sort().pop() || null;

  return {
    customerEmail: email,
    customerName: String(customerName || '').trim(),
    lines,
    totals: { billed, paid, credited, refunded, outstanding },
    creditBalance: outstanding < 0 ? r2(-outstanding) : 0, // more paid or credited than billed: the business owes the customer
    aging: agingOf(open, now),
    openInvoices: open.map((i) => ({ id: i.id, number: i.number || '', balance: balanceOf(i), dueAt: i.dueAt || null, state: invoiceState(i, now).state })),
    lastPaidAt: lastPaid,
  };
}
