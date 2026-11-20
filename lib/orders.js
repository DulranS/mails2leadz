// lib/orders.js - the sales order: a record of what the customer committed to, created when they accept a quote.
// It LINKS to the quote (by id), the deal (by e-mail) and the invoices (by quoteId). It does not copy invoice or payment data,
// so the invoice remains the record of money. Pure (no database).
import { quoteDisplay } from './currency.js';

export const ORDER_STATUSES = ['confirmed', 'invoiced', 'paid'];

/** The order record written when a quote is accepted. Null when there is no quote id to link to. */
export function orderForAcceptedQuote({ uid, quote, now = Date.now() } = {}) {
  if (!quote?.id) return null;
  return {
    id: String(quote.id),
    userId: String(uid),
    quoteId: String(quote.id),
    customerEmail: String(quote.customerEmail || '').trim().toLowerCase(),
    customerName: String(quote.customerName || '').slice(0, 120),
    title: String(quote.title || '').slice(0, 160),
    total: Math.round((Number(quote.total) || 0) * 100) / 100,
    currency: String(quoteDisplay(quote).cur || ''),
    signedName: String(quote.signedName || '').slice(0, 120),
    confirmedAt: new Date(now).toISOString(),
    status: 'confirmed',
  };
}

/**
 * The order's status from the invoices made for its quote (quoteId). Derived when read; never stored as the truth.
 *  - paid: invoices for the quote add up to at least the order total
 *  - invoiced: at least one invoice exists for it
 *  - confirmed: none yet
 * @param {{quoteId: string, total: number}} order
 * @param {object[]} invoices  the owner's invoices (quoteId, status, amountPaid, total)
 */
export function orderStatusFromInvoices(order, invoices = []) {
  const mine = (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.quoteId === order?.quoteId && i.status !== 'void');
  if (!mine.length) return 'confirmed';
  const paid = mine.reduce((a, i) => a + (i.status === 'paid' ? (Number(i.amountPaid) || Number(i.total) || 0) : (Number(i.amountPaid) || 0)), 0);
  return paid + 0.005 >= (Number(order?.total) || 0) && (Number(order?.total) || 0) > 0 ? 'paid' : 'invoiced';
}

/**
 * The orders screen's rows (pass 338): newest first, each with the status worked out from its invoices, plus counts by status
 * and the value not yet paid. Pure: the page passes in the owner's orders and invoices.
 */
export function orderRows(orders = [], invoices = []) {
  const list = (Array.isArray(orders) ? orders : []).filter((o) => o && o.id);
  const rows = list.map((o) => ({
    id: String(o.id),
    quoteId: String(o.quoteId || o.id),
    customerName: String(o.customerName || o.customerEmail || 'Customer'),
    customerEmail: String(o.customerEmail || ''),
    title: String(o.title || ''),
    total: Math.round((Number(o.total) || 0) * 100) / 100,
    currency: String(o.currency || ''),
    confirmedAt: String(o.confirmedAt || ''),
    status: orderStatusFromInvoices(o, invoices),
  }));
  rows.sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  const counts = { confirmed: 0, invoiced: 0, paid: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const openValue = rows.filter((r) => r.status !== 'paid').reduce((a, r) => a + r.total, 0);
  return { rows, counts, openValue: Math.round(openValue * 100) / 100 };
}
