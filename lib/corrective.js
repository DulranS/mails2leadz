// lib/corrective.js - the performance loop's last step: when a target is clearly missed, the weekly list says what to do about it. Pure.
export const CORRECTIVE_BELOW_PCT = 80;

/** Revenue a month and new customers a month are read from paid invoices over the last year; a target below 80% gets one action. */
export function correctiveActions({ targets = {}, revenueMonthly = null, newCustomersMonthly = null } = {}) {
  const out = [];
  if (Number(targets.monthlyRevenue) > 0 && revenueMonthly !== null) {
    const pct = Math.round((revenueMonthly / Number(targets.monthlyRevenue)) * 100);
    if (pct < CORRECTIVE_BELOW_PCT) out.push(`Revenue is at ${pct}% of your monthly target (average of the last twelve months). Work the three largest open deals and clear the follow-up queue this week.`);
  }
  if (Number(targets.newCustomersPerMonth) > 0 && newCustomersMonthly !== null) {
    const pct = Math.round((newCustomersMonthly / Number(targets.newCustomersPerMonth)) * 100);
    if (pct < CORRECTIVE_BELOW_PCT) out.push(`New customers are at ${pct}% of your monthly target. Check which source brought the last ten, and move a little spend toward the best one.`);
  }
  return out;
}

/** The figures from paid invoices over the last year: average revenue a month, and distinct new customers a month. */
export function paidFigures(invoices = [], now = Date.now()) {
  const year = now - 365 * 86400000;
  const paid = (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.status === 'paid' && (Number(i.amountPaid) || Number(i.total)) > 0 && (Date.parse(i.paidAt || '') || 0) >= year);
  const revenue = paid.reduce((a, i) => a + (Number(i.amountPaid) || Number(i.total) || 0), 0);
  const customers = new Set(paid.map((i) => String(i.email || '').toLowerCase()).filter(Boolean)).size;
  return { revenueMonthly: Math.round((revenue / 12) * 100) / 100, newCustomersMonthly: Math.round((customers / 12) * 10) / 10 };
}
