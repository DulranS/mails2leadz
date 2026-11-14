// lib/revenue-kpis.js - payback, pipeline coverage, net revenue retention, and discount approval. Pure. A missing input gives null, never a guess.
const DAY = 86400000;

/** Months to earn back what it cost to win a customer, from their monthly revenue and your gross margin. */
export function paybackMonths(cac, monthlyRevenue, grossMarginPct) {
  const m = Number(grossMarginPct);
  if (!(cac > 0) || !(monthlyRevenue > 0) || !(m > 0)) return null;
  return Math.round((cac / (monthlyRevenue * (m / 100))) * 10) / 10;
}

/** Open pipeline against what is still needed to reach target. Null with no target. */
export function pipelineCoverage(openPipeline, remainingTarget) {
  if (!(remainingTarget > 0)) return null;
  return Math.round((openPipeline / remainingTarget) * 10) / 10;
}

/** Of the customers who paid in the year before last, how much they paid in the last year, as a percentage. Null with no earlier customers. */
export function netRevenueRetention(invoices = [], now = Date.now()) {
  const paidIn = (from, to) => (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.status === 'paid' && i.email)
    .filter((i) => { const t = Date.parse(i.paidAt || ''); return t >= from && t < to; })
    .reduce((m, i) => { const e = String(i.email).toLowerCase(); m.set(e, (m.get(e) || 0) + (Number(i.amountPaid || i.total || i.amount) || 0)); return m; }, new Map());
  const earlier = paidIn(now - 24 * 30 * DAY, now - 12 * 30 * DAY);
  const recent = paidIn(now - 12 * 30 * DAY, now);
  let base = 0, kept = 0;
  for (const [e, amount] of earlier) { base += amount; kept += recent.get(e) || 0; }
  return base > 0 ? Math.round((kept / base) * 1000) / 10 : null;
}

/** True when a discount is more than you allow without approval. */
export function approvalNeeded(discountPct, limitPct) {
  if (limitPct === null || limitPct === undefined || limitPct === '') return false;
  const d = Number(discountPct), l = Number(limitPct);
  if (!(l >= 0) || !(d >= 0)) return false;
  return d > l;
}
