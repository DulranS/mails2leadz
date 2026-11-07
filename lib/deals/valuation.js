// lib/deals/valuation.js - valuation, investment and sale-readiness checks from the owner's own numbers. Pure. Not investment advice.
// Multiples and the cost of capital are assumptions the owner sets; every result says so.
const r2 = (n) => Math.round(n * 100) / 100;

/** A value range from profit, using the owner's low and high multiples (defaults are assumptions, not market data). */
export function valueRange({ profit, low = 2.5, high = 4 } = {}) {
  const p = Number(profit);
  if (!(p > 0)) return null;
  return { low: r2(p * low), high: r2(p * high), lowMultiple: low, highMultiple: high, basis: 'Profit multiple (your assumption)' };
}

/** Checks a price against the owner's benchmark multiples, and what the profits repay over time. */
export function dealCheck({ price, profit, revenue = null, benchmarkLow = 2.5, benchmarkHigh = 4, costOfCapital = 0.1, years = 5 } = {}) {
  const P = Number(price), E = Number(profit);
  if (!(P > 0) || !(E > 0)) return null;
  const multiple = P / E;
  const verdict = multiple < benchmarkLow ? 'below_benchmark' : multiple <= benchmarkHigh ? 'within_benchmark' : 'above_benchmark';
  let pv = 0;
  for (let t = 1; t <= years; t++) pv += E / Math.pow(1 + costOfCapital, t);
  return {
    impliedMultiple: r2(multiple),
    verdict,
    paybackYears: r2(P / E),
    presentValueOfProfits: r2(pv),
    netOfPrice: r2(pv - P),
    priceToRevenue: revenue && revenue > 0 ? r2(P / revenue) : null,
    note: 'Based on the profit you entered and your own benchmark and cost of capital. Not a valuation or investment advice; have the figures checked by a qualified adviser.',
  };
}

/** Sale readiness for the owner's own business: what a buyer checks first, and what to fix. */
export function readiness({ accountsUpToDate = false, topCustomerShare = null, recurringShare = null, ownerDependence = null, growthLastYear = null, unsatisfiedCharges = 0 } = {}) {
  const items = [
    { ok: accountsUpToDate === true, text: 'Annual accounts are up to date.' },
    { ok: topCustomerShare !== null && topCustomerShare <= 0.3, text: 'No single customer is more than 30% of revenue.' },
    { ok: recurringShare !== null && recurringShare >= 0.4, text: 'At least 40% of revenue is recurring or contracted.' },
    { ok: ownerDependence !== null && ownerDependence <= 0.5, text: 'The business does not depend on the owner for most sales.' },
    { ok: growthLastYear !== null && growthLastYear >= 0, text: 'Revenue did not fall last year.' },
    { ok: unsatisfiedCharges === 0, text: 'No charges over assets are unsatisfied.' },
  ];
  return { score: Math.round((items.filter((i) => i.ok).length / items.length) * 100), items, toFix: items.filter((i) => !i.ok).map((i) => i.text) };
}
