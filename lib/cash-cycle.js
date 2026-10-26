// lib/cash-cycle.js - how many days your cash is tied up before it comes back (the cash conversion cycle).
//   cycle = days to get paid (invoice issued -> paid)
//         + days stock sits before it sells (stock businesses only)
//         - days you take to pay suppliers (bill issued -> paid, from bills you record with both dates)
// Each part is shown only when it can be measured. Nothing is guessed: no paid invoice means no cycle at all.
const DAY = 86400000;
export const MIN_SUPPLIER_BILLS = 3; // fewer paid bills than this and the average says little
const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Average days from bill date to payment, over paid bills with both dates in the last 90 days. */
export function supplierDays(bills = [], now = Date.now()) {
  const from = now - 90 * DAY;
  const days = (Array.isArray(bills) ? bills : [])
    .filter((b) => b && b.status === 'paid' && b.issuedAt && b.paidAt)
    .map((b) => ({ issued: Date.parse(b.issuedAt), paid: Date.parse(b.paidAt) }))
    .filter((x) => Number.isFinite(x.issued) && Number.isFinite(x.paid) && x.paid >= from && x.paid >= x.issued)
    .map((x) => (x.paid - x.issued) / DAY);
  const count = days.length;
  const avg = count >= MIN_SUPPLIER_BILLS ? Math.round(days.reduce((a, d) => a + d, 0) / count) : null;
  return { count, avg };
}

export function computeCashCycle({ avgDaysToPay = null, avgDaysToSell = null, avgDaysToPaySuppliers = null } = {}) {
  const dso = num(avgDaysToPay);
  const dio = num(avgDaysToSell);
  const dpo = num(avgDaysToPaySuppliers);
  if (dso === null) return { days: null, dso: null, dio: dio === null ? null : Math.round(dio), dpo: dpo === null ? null : Math.round(dpo), stock: dio !== null, supplierCredit: dpo !== null, note: 'Needs at least one paid invoice.' };
  const stock = dio !== null;
  const supplierCredit = dpo !== null;
  const days = Math.round(dso + (dio ?? 0) - (dpo ?? 0));
  const parts = ['Days to get paid'];
  if (stock) parts.push('plus days stock sits before it sells');
  if (supplierCredit) parts.push('minus days you take to pay suppliers');
  const note = supplierCredit ? `${parts.join(', ')}.` : `${parts.join(', ')}, before supplier credit (record bill dates and paid dates to include it).`;
  return { days, dso: Math.round(dso), dio: stock ? Math.round(dio) : null, dpo: supplierCredit ? Math.round(dpo) : null, stock, supplierCredit, note };
}
