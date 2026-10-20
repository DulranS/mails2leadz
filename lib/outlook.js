// lib/outlook.js - the forward-looking numbers, completed.
// Pure functions, no I/O, no invented figures. Two things were missing from "future value":
//
//  1. The forecast only looked at the open PIPELINE. A subscription / retainer business (a managed service, or the software itself)
//     already has revenue under contract: with a full book of subscribers and an empty pipeline the page promised "0". computeOutlook()
//     adds what is already committed (monthly recurring revenue still running) to the pipeline forecast, keeps the two visible
//     separately, and never counts a subscriber whose renewal date has passed with no word from them (that money is uncertain).
//  2. Cost per win and lifetime value were both shown, but never set against each other. computeUnitEconomics() gives the two
//     numbers an owner decides on: lifetime value per cost of winning a customer, and how many months a customer takes to pay
//     their win cost back. Each is withheld (null) until the inputs are real.
//
// Inputs are the results of computeBusinessMetrics, computeRecurring and computeBilling.

const DAY = 86400000;
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * @param {{ metrics: object, recurring?: object, billing?: object }} args
 * @returns {{ any: boolean, committedMonthly: number, uncertainMonthly: number, horizons: object[], owed: object }}
 *   horizons[i] = { days, committed, committedLow, pipeline, pipelineLow, pipelineHigh, total, low, high }
 */
export function computeOutlook({ metrics, recurring = null, billing = null } = {}) {
  const pipelineHorizons = metrics?.future?.horizons || [];
  const rec = recurring && recurring.any ? recurring : null;

  // MRR still running, minus subscribers whose renewal date passed with no record of them leaving (not promised, not lost: uncertain).
  const lapsedMrr = rec ? num(rec.renewals?.lapsed?.mrr) : 0;
  const committedMonthly = rec ? Math.max(0, num(rec.mrr) - lapsedMrr) : 0;

  // A subscriber due to renew inside the window could leave: that is the only downside we can see in the data.
  const renewing = rec ? rec.renewals?.dueSoon?.list || [] : [];

  const horizons = pipelineHorizons.map((h) => {
    const days = num(h.days);
    const committed = committedMonthly * (days / 30);
    const atRisk = renewing.reduce((a, s) => a + num(s.amount) * (Math.max(0, days - Math.max(0, num(s.days))) / 30), 0);
    const committedLow = Math.max(0, committed - atRisk);
    const pipeline = num(h.expected);
    const pipelineLow = num(h.low);
    const pipelineHigh = num(h.high);
    return {
      days,
      committed: r0(committed),
      committedLow: r0(committedLow),
      pipeline: r0(pipeline),
      pipelineLow: r0(pipelineLow),
      pipelineHigh: r0(pipelineHigh),
      total: r0(committed + pipeline),
      low: r0(committedLow + pipelineLow),
      high: r0(committed + pipelineHigh),
    };
  });

  // Cash already invoiced and waiting. Kept apart on purpose: it is mostly revenue already counted, so adding it would count it twice.
  const owed = billing
    ? { amount: num(billing.outstanding), overdue: num(billing.overdue?.amount), dueNext30: num(billing.dueNext30), count: num(billing.outstandingCount) }
    : { amount: 0, overdue: 0, dueNext30: 0, count: 0 };

  return { any: !!rec, committedMonthly: r0(committedMonthly), uncertainMonthly: r0(lapsedMrr), horizons, owed };
}

/**
 * Lifetime value against what it costs to win a customer.
 * cost per win = this tool + AI spend over the last 90 days / wins in that window (your time and any commission are NOT in it).
 * Each figure is null until its inputs exist: no churn yet means no lifetime value, no win in 90 days means no cost per win.
 * @param {{ roi?: object, recurring?: object }} args
 */
export function computeUnitEconomics({ roi = null, recurring = null } = {}) {
  const rec = recurring && recurring.any ? recurring : null;
  const costPerWin = roi && num(roi.costPerWin) > 0 ? num(roi.costPerWin) : null;
  const ltv = rec && rec.ltv && num(rec.ltv.value) > 0 ? num(rec.ltv.value) : null;
  const arpa = rec && num(rec.arpa) > 0 ? num(rec.arpa) : null;

  const ltvToCost = ltv !== null && costPerWin !== null ? r1(ltv / costPerWin) : null;
  const paybackMonths = costPerWin !== null && arpa !== null ? r1(costPerWin / arpa) : null;

  let verdict = null;
  if (ltvToCost !== null) verdict = ltvToCost >= 3 ? 'healthy' : ltvToCost >= 1 ? 'thin' : 'losing';
  else if (paybackMonths !== null) verdict = paybackMonths <= 12 ? 'healthy' : 'slow';

  return { costPerWin, ltv, arpa, ltvToCost, paybackMonths, ltvCapped: !!(rec && rec.ltv && rec.ltv.capped), verdict };
}
