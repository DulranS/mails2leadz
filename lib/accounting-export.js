// lib/accounting-export.js - CSV files an accountant or bookkeeping tool can import (pure: no database).
//  - Xero: a sales-invoice import file (one line per invoice, Xero's column names).
//  - Ledger: one row per invoice and per credit note, with signed amounts, for QuickBooks, Sage, or a spreadsheet.
// Cells that start with = + - @ or a tab are prefixed with an apostrophe, so a customer name cannot run as a formula in Excel.
import { invoiceBase, paidSoFar, isForeignInvoice } from './billing.js';
import { originalTotal, originalNet, originalTax } from './credit-apply.js';

export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  // Numbers (including negatives such as credit notes) are written as they are, so spreadsheets still add them up.
  // Text that starts like a formula is neutralised; a numeric-looking string is also left alone.
  const numeric = typeof value === 'number' || /^[+-]?\d+(\.\d+)?$/.test(s);
  if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
export const csvLine = (cells) => cells.map(csvCell).join(',');

const parts = (v) => { const d = new Date(Date.parse(v || '')); return Number.isFinite(d.getTime()) ? d : null; };
export const isoDay = (v) => { const d = parts(v); return d ? d.toISOString().slice(0, 10) : ''; };
/** Xero reads dates as day/month/year in most regions; check the import preview in Xero if your region differs. */
export const dmyDay = (v) => { const d = parts(v); if (!d) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

const inRange = (iso, from, to) => { const d = isoDay(iso); return (!from || d >= from) && (!to || d <= to); };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Xero sales-invoice import. Column names follow Xero's import template; the account code and tax type must match your Xero chart. */
export function xeroInvoicesCsv(invoices = [], { from = '', to = '', accountCode = '200', taxType = '', currency = '' } = {}) {
  const header = ['*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'Total', 'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'TaxAmount', 'Currency'];
  const rows = invoices
    .filter((i) => i.status !== 'void' && inRange(i.issuedAt, from, to))
    .map((i) => {
      const tax = originalTax(i);
      return [i.businessName || i.email || '', i.email || '', i.number || '', '', dmyDay(i.issuedAt), dmyDay(i.dueAt), r2(originalTotal(i)), '', i.note || 'Services', 1, r2(originalNet(i)), accountCode, tax > 0 ? taxType : '', r2(tax), currency];
    });
  return [csvLine(header), ...rows.map(csvLine)].join('\r\n') + '\r\n';
}

/** One row per invoice and per credit note. Credit notes are negative, so the column sums to the true receivable. */
export function ledgerCsv(invoices = [], credits = [], { from = '', to = '' } = {}) {
  const header = ['Date', 'Type', 'Number', 'Customer', 'Email', 'Description', 'Net', 'Tax', 'Total', 'Status', 'Paid', 'Paid date', 'Charged currency', 'Charged total'];
  const rows = [];
  for (const i of invoices.filter((x) => x.status !== 'void' && inRange(x.issuedAt, from, to))) {
    rows.push([isoDay(i.issuedAt), 'Invoice', i.number || '', i.businessName || '', i.email || '', i.note || '', r2(originalNet(i)), r2(originalTax(i)), r2(originalTotal(i)), i.status || 'open', r2(paidSoFar(i)), isoDay(i.paidAt), ...(isForeignInvoice(i) ? [i.chargeCurrency, r2(i.chargeTotal)] : [])]);
  }
  // Refunds reduce revenue when they are paid: card refunds (Stripe) and refunds the owner paid by hand. Each is split into net and
  // tax in the same proportion as the invoice, so the Net and Tax columns still add up to the Total.
  for (const i of invoices.filter((x) => x.status !== 'void')) {
    const total = Number(originalTotal(i)) || 0;
    const ratio = total > 0 ? originalNet(i) / total : 1;
    const refunds = [
      ...(Array.isArray(i.cardRefunds) ? i.cardRefunds.map((r) => ({ ...r, how: 'card' })) : []),
      ...(Array.isArray(i.manualRefunds) ? i.manualRefunds.map((r) => ({ ...r, how: 'hand' })) : []),
    ];
    for (const rf of refunds) {
      if (!inRange(rf.at, from, to)) continue;
      const amt = r2(Number(rf.amount) || 0);
      if (!(amt > 0)) continue;
      const net = r2(amt * ratio);
      const desc = rf.how === 'card'
        ? `Refund to card${rf.refundId ? ` (Stripe ${rf.refundId})` : ''}`
        : `Refund paid by hand${rf.method ? ` (${rf.method})` : ''}${rf.note ? `: ${rf.note}` : ''}`;
      rows.push([isoDay(rf.at), 'Refund', i.number || '', i.businessName || '', i.email || '', desc, -net, -r2(amt - net), -amt, 'refunded', 0, isoDay(rf.at)]);
    }
  }
  // Gift credit is left out: the gift sale is already on its invoice as a sale, and redeeming it is not a second sale.
  for (const c of credits.filter((x) => x.source !== 'gift' && inRange(x.issuedAt, from, to))) {
    const amt = r2(-(Number(c.amount) || 0));
    rows.push([isoDay(c.issuedAt), 'Credit note', c.number || '', '', c.customerEmail || '', c.reason || '', amt, 0, amt, c.status || 'open', 0, '']);
  }
  const width = header.length;
  for (const r of rows) while (r.length < width) r.push('');
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return [csvLine(header), ...rows.map(csvLine)].join('\r\n') + '\r\n';
}
