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
 *   payrollMonthly: regular monthly cost of the team incl. employer EPF/ETF (lib/payroll.js monthlyEmployerCost); loanInterestMonthly: interest part of loan payments (lib/balance.js)
 *   stockSales: items sold from stock, [{ name, value, cost, at }] (lib/stock.js stockSalesSince); counted as costed sales, so a business that buys to resell sees real profit
 */
export function computeProfit({ deals = [], settings = {}, aiCostUsd = 0, stockSales = [], payrollMonthly = 0, loanInterestMonthly = 0, partnerPayouts90 = 0, now = Date.now() } = {}) {
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
        hours: d.hoursSpent !== undefined && d.hoursSpent !== null && d.hoursSpent !== '' && Number.isFinite(Number(d.hoursSpent)) && Number(d.hoursSpent) >= 0 ? Number(d.hoursSpent) : null,
        cost: hasCost ? Number(d.deliveryCost) : 0,
        at: toMs(d.closedAt) || toMs(d.lastUpdate) || now,
      };
    })
    .filter((d) => now - d.at <= 90 * DAY)
    .concat((Array.isArray(stockSales) ? stockSales : [])
      .filter((x) => x && Number.isFinite(Number(x.value)) && Number.isFinite(Number(x.cost)) && now - Number(x.at || now) <= 90 * DAY)
      .map((x) => ({ email: '', name: x.name || 'Stock item', value: Number(x.value), estimated: false, hasCost: true, cost: Number(x.cost), at: Number(x.at || now) })));

  const revenue = wins.reduce((a, d) => a + d.value, 0);
  const costed = wins.filter((d) => d.hasCost);
  const deliveryCosts = wins.reduce((a, d) => a + d.cost, 0);
  const grossProfit = revenue - deliveryCosts;
  const aiCost = Math.max(0, num(aiCostUsd)) * usdRate;
  const payroll = Math.max(0, num(payrollMonthly)), interest = Math.max(0, num(loanInterestMonthly));
  const operatingMonthly = tools + overhead + payroll + interest;
  const partnerPay = Math.max(0, num(partnerPayouts90)); // commission actually paid to partners: a real cost of winning customers
  const operating90 = operatingMonthly * 3 + aiCost + partnerPay;

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

  // Your own time: what each hour you put in actually earns. A business pays you for more than your hours; a job pays you for exactly them.
  const hourly = Math.max(0, num(settings.hourlyRate));
  const timed = wins.filter((d) => d.hours !== null && d.hours !== undefined && d.hasCost);
  const hoursTotal = timed.reduce((a, d) => a + d.hours, 0);
  const profitOfTimed = timed.reduce((a, d) => a + d.value - d.cost, 0);
  const perHour = hoursTotal > 0 ? r0(profitOfTimed / hoursTotal) : null;
  const timeEnough = timed.length >= 3 && hoursTotal > 0;
  const time = {
    winsWithHours: timed.length, hours: r2(hoursTotal), perHour, hourlyRate: hourly > 0 ? hourly : null, enough: timeEnough,
    belowOwnRate: timeEnough && hourly > 0 && perHour !== null ? perHour < hourly : null,
    verdict: timed.length === 0 ? null
      : !timeEnough ? `${timed.length} of 3 customers have your hours entered: add the rest to see what an hour of your time earns.`
      : hourly > 0 && perHour < hourly ? `Each hour you put in earns about ${perHour}, less than the ${hourly} you say your time is worth. This is still a job. Raise the price, standardise the work (SOPs), or hand it over.`
      : hourly > 0 ? `Each hour you put in earns about ${perHour}, more than the ${hourly} you set. The work pays more than your time.`
      : `Each hour you put in earns about ${perHour} (set what your hour is worth in Account to compare).`,
  };
  const notes = [];
  if (wins.length === 0) notes.push('No deal was won in the last 90 days, so there is no profit to measure yet.');
  if (wins.length > 0 && costed.length < wins.length) notes.push(`${wins.length - costed.length} of ${wins.length} recent wins have no delivery cost entered (Customers, open a customer). Until they do, profit is overstated.`);
  if (wins.some((d) => d.estimated)) notes.push('Some wins use your typical deal value because no real value was set, so revenue and profit are partly an estimate.');
  if (operatingMonthly === 0) notes.push('Add your other monthly costs in Account to see net profit and break-even.');
  if (!time.winsWithHours) notes.push('Your own time is not counted unless you enter your hours per customer (Customers, Details) or a wage in your monthly costs.');

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
    operatingMonthly: r2(operatingMonthly), payrollMonthly: r2(payroll), loanInterestMonthly: r2(interest), partnerPayouts90: r2(partnerPay),
    operating90: r0(operating90),
    aiCost90: r2(aiCost),
    netProfit90: r0(net90),
    netMonthly: r0(net90 / 3),
    breakEvenMonthly,
    losers,
    time,
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
