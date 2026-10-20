// lib/profit.js
// Revenue is not value. This turns the owner's own numbers into profit: what the wins brought in, what delivering them cost,
// what the business costs to run, and what is left. Pure functions, no invented figures: a number is withheld (null) until
// its inputs exist, and the result says how much of the data is missing instead of guessing.
//
// Window: the last 90 days, the same window ROI and cost-per-win use, so the figures can be read side by side.
import { normalizeStage, isWon } from './deal-utils.js';

const DAY = 86400000;
const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const r0 = (n) => Math.round(n);
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * @param {{ deals?: object[], settings?: object, aiCostUsd?: number, now?: number }} args
 *   deals: raw deal documents (value, valueIsEstimate, deliveryCost, closedAt, stage ...)
 *   settings: { avgDealValue, monthlyCost (tools), monthlyOverhead (everything else), usdRate }
 *   aiCostUsd: AI spend over the same 90 days, in USD
 */
export function computeProfit({ deals = [], settings = {}, aiCostUsd = 0, now = Date.now() } = {}) {
  const avg = num(settings.avgDealValue) > 0 ? num(settings.avgDealValue) : 1000;
  const usdRate = num(settings.usdRate) > 0 ? num(settings.usdRate) : 1;
  const tools = Math.max(0, num(settings.monthlyCost));
  const overhead = Math.max(0, num(settings.monthlyOverhead));

  // One deal per email, latest wins (same rule as the rest of Business Value).
  const byEmail = new Map();
  for (const d of deals) {
    if (!d || !d.email) continue;
    const k = String(d.email).toLowerCase();
    const prev = byEmail.get(k);
    if (!prev || (toMs(d.lastUpdate) || 0) >= (toMs(prev.lastUpdate) || 0)) byEmail.set(k, d);
  }
  const wins = [...byEmail.values()]
    .filter((d) => isWon(normalizeStage(d.stage)))
    .map((d) => {
      const real = num(d.value) > 0 && d.valueIsEstimate !== true;
      const hasCost = d.deliveryCost !== undefined && d.deliveryCost !== null && d.deliveryCost !== '' && Number.isFinite(Number(d.deliveryCost)) && Number(d.deliveryCost) >= 0;
      return {
        email: d.email,
        name: d.businessName || d.email,
        value: real ? num(d.value) : avg,
        estimated: !real,
        hasCost,
        cost: hasCost ? Number(d.deliveryCost) : 0,
        at: toMs(d.closedAt) || toMs(d.lastUpdate) || now,
      };
    })
    .filter((d) => now - d.at <= 90 * DAY);

  const revenue = wins.reduce((a, d) => a + d.value, 0);
  const costed = wins.filter((d) => d.hasCost);
  const deliveryCosts = wins.reduce((a, d) => a + d.cost, 0);
  const grossProfit = revenue - deliveryCosts;
  const aiCost = Math.max(0, num(aiCostUsd)) * usdRate;
  const operatingMonthly = tools + overhead;
  const operating90 = operatingMonthly * 3 + aiCost;

  const anyCostInfo = costed.length > 0 || operatingMonthly > 0;
  // Gross margin is only meaningful when every counted win carries a cost; otherwise it is overstated, so it is computed from
  // the costed wins alone and labelled as partial.
  const costedRevenue = costed.reduce((a, d) => a + d.value, 0);
  const marginPct = costed.length > 0 && costedRevenue > 0 ? Math.round(((costedRevenue - costed.reduce((a, d) => a + d.cost, 0)) / costedRevenue) * 100) : null;
  const coverage = wins.length > 0 ? Math.round((costed.length / wins.length) * 100) : null;
  const complete = wins.length > 0 && costed.length === wins.length;

  const net90 = grossProfit - operating90;
  // Revenue per month needed just to cover the running costs at the margin seen so far.
  const breakEvenMonthly = operatingMonthly > 0 && marginPct !== null && marginPct > 0 ? r0(operatingMonthly / (marginPct / 100)) : null;

  // Deals that cost more than they brought in: the plainest reason to reprice or stop selling something.
  const losers = costed
    .filter((d) => d.cost > d.value)
    .sort((a, b) => (a.value - a.cost) - (b.value - b.cost))
    .slice(0, 5)
    .map((d) => ({ email: d.email, name: d.name, value: r0(d.value), cost: r0(d.cost), loss: r0(d.cost - d.value) }));

  const notes = [];
  if (wins.length === 0) notes.push('No deal was won in the last 90 days, so there is no profit to measure yet.');
  if (wins.length > 0 && costed.length < wins.length) notes.push(`${wins.length - costed.length} of ${wins.length} recent wins have no delivery cost entered (Customers, open a customer). Until they do, profit is overstated.`);
  if (wins.some((d) => d.estimated)) notes.push('Some wins use your typical deal value because no real value was set, so revenue and profit are partly an estimate.');
  if (operatingMonthly === 0) notes.push('Add your other monthly costs in Account to see net profit and break-even.');
  notes.push('Your own time is not counted unless you put a wage in your monthly costs.');

  return {
    periodDays: 90,
    ready: wins.length > 0 && anyCostInfo,
    wins: wins.length,
    costedWins: costed.length,
    coverage,
    complete,
    revenue: r0(revenue),
    deliveryCosts: r0(deliveryCosts),
    grossProfit: r0(grossProfit),
    marginPct,
    operatingMonthly: r2(operatingMonthly),
    operating90: r0(operating90),
    aiCost90: r2(aiCost),
    netProfit90: r0(net90),
    netMonthly: r0(net90 / 3),
    breakEvenMonthly,
    losers,
    notes,
  };
}

/**
 * Profit expected over the next `days`, from revenue the forecast already expects.
 * Uses the margin seen so far (never invented): null until a margin exists. Running costs are scaled to the window.
 */
export function forecastProfit({ profit, expectedRevenue, days = 30 } = {}) {
  if (!profit || profit.marginPct === null || !Number.isFinite(Number(expectedRevenue))) return null;
  const gross = Number(expectedRevenue) * (profit.marginPct / 100);
  const running = profit.operatingMonthly * (days / 30);
  return { days, expectedRevenue: r0(Number(expectedRevenue)), gross: r0(gross), running: r0(running), net: r0(gross - running) };
}
