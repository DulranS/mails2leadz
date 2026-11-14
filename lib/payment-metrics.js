// lib/payment-metrics.js - how long customers take to pay (days sales outstanding), and won deals not yet invoiced. Pure.
const DAY = 86400000;

/** Average days from issue to payment for invoices paid in the last year. Null when there are none. */
export function daysSalesOutstanding(invoices = [], now = Date.now()) {
  const days = [];
  for (const i of Array.isArray(invoices) ? invoices : []) {
    if (!i || i.status !== 'paid') continue;
    const issued = Date.parse(i.issuedAt || i.createdAt || '') || 0;
    const paid = Date.parse(i.paidAt || '') || 0;
    if (!issued || !paid || paid < issued || now - paid > 365 * DAY) continue;
    days.push((paid - issued) / DAY);
  }
  if (!days.length) return null;
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
}

/** Won deals in the last sixty days with no invoice to that customer since they were won. Matched by e-mail. */
export function wonNotInvoiced(deals = [], invoices = [], now = Date.now()) {
  const invoiced = new Map();
  for (const i of Array.isArray(invoices) ? invoices : []) {
    const e = String(i?.email || '').toLowerCase();
    const t = Date.parse(i?.issuedAt || i?.createdAt || '') || 0;
    if (e && t > (invoiced.get(e) || 0)) invoiced.set(e, t);
  }
  return (Array.isArray(deals) ? deals : []).filter((d) => {
    if (!d || d.stage !== 'closed_won' || !d.email) return false;
    const won = Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0;
    if (!won || now - won > 60 * DAY) return false;
    return (invoiced.get(String(d.email).toLowerCase()) || 0) < won;
  });
}
