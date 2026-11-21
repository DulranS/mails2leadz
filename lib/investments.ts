// Investments: what the business has put into securities to grow its capital, what that is worth now,
// what it has earned so far, and what it could be worth later.
//
// Management accounting only. The owner records buys, sells and income by hand and updates each
// holding's price by hand; nothing connects to a broker, an exchange or a price feed, and nothing is
// filed with any authority. Pure functions, no I/O.
//
// How it ties into the books (see computeMonthlyPnL / computeBalanceSheet in lib/calculations.ts):
//   buy     cash out by amount + fees. The holding is carried at cost (weighted average).
//   sell    cash in by amount - fees. Realised gain = proceeds - average cost of the units sold.
//   income  cash in by amount - fees (dividend, interest, coupon, rent). Counted as profit.
// Realised gain and income are profit; they sit below operating profit and are taxed with it. A holding
// is shown on the Balance Sheet at market value (units x the last price entered), and the difference
// from cost is the unrealised gain, held in equity until it is realised. Cash + holdings at cost always
// equals the sum of those flows, so the Balance Sheet keeps balancing by construction.
import { computeFutureValue, computeFutureValueOfSeries } from "./calculations";
import type { InvestmentAssetClass, InvestmentTxn, Security } from "./types";

const EPS = 1e-9;
const STALE_PRICE_DAYS = 90;
const MIN_DAYS_TO_ANNUALISE = 90;

export const ASSET_CLASS_LABELS: Record<InvestmentAssetClass, string> = {
  shares: "Shares & IPOs",
  bonds: "Bonds, NCDs & government securities",
  funds: "Mutual funds & ETFs",
  deposits: "Fixed deposits",
  retirement: "Retirement & government schemes (PPF, EPF, NPS, NSC)",
  commodities: "Commodities (gold, silver, metals, crops)",
  property: "Property, land & REITs",
  alternative: "Alternative (AIFs, private equity, InvITs, structured)",
  cash: "Cash & liquid (savings, liquid & money market funds)",
  other: "Other (art, collectibles, crypto)",
};

// One month of investment cash and profit effects. This is the only thing the monthly P&L needs.
export interface InvestmentMonthly {
  month: string; // "YYYY-MM"
  purchases: number; // cash paid out for buys, fees included
  saleProceeds: number; // cash received from sells, net of fees
  income: number; // dividends / interest / coupons received, net of fees
  realizedGain: number; // gain (or loss) on units sold
}

export interface InvestmentPosition {
  securityId: string;
  name: string;
  symbol?: string;
  assetClass: InvestmentAssetClass;
  units: number;
  avgCost: number; // per unit, weighted average
  costBasis: number; // of the units still held
  currentPrice: number | null;
  priceDate?: string;
  priceMissing: boolean; // held, but never priced: carried at cost
  priceStale: boolean; // held, price older than 90 days
  marketValue: number;
  unrealizedGain: number;
  unrealizedPct: number | null;
  realizedGain: number;
  income: number;
  totalBought: number; // everything ever paid in, fees included
  totalReturn: number; // unrealised + realised + income
  totalReturnPct: number | null; // of everything ever paid in
  annualizedReturnPct: number | null; // money-weighted (XIRR), null until there is enough history
}

export interface InvestmentPortfolio {
  asOf: string;
  positions: InvestmentPosition[]; // includes fully sold positions, so history is kept
  costBasis: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedPct: number | null;
  realizedGain: number;
  income: number;
  totalBought: number;
  totalReturn: number;
  totalReturnPct: number | null;
  annualizedReturnPct: number | null;
  allocation: { assetClass: InvestmentAssetClass; marketValue: number; sharePct: number }[];
  monthly: InvestmentMonthly[]; // feeds computeMonthlyPnL; sorted by month
  priceAttentionCount: number; // holdings that are unpriced or stale
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const kindRank = (k: InvestmentTxn["kind"]) => (k === "buy" ? 0 : k === "income" ? 1 : 2);
function inOrder(a: InvestmentTxn, b: InvestmentTxn): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);
  return a.createdAt - b.createdAt;
}

// Money-weighted annual return from dated cash flows (money in negative, money out / value now positive).
// Null when it cannot be meaningful: no money in, nothing back, or under ~3 months of history.
export function computeXirrPct(flows: { date: string; amount: number }[]): number | null {
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = sorted[0].date;
  const years = (d: string) => daysBetween(first, d) / 365;
  if (daysBetween(first, sorted[sorted.length - 1].date) < MIN_DAYS_TO_ANNUALISE) return null;
  const npv = (r: number) => sorted.reduce((s, f) => s + f.amount / Math.pow(1 + r, years(f.date)), 0);
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (fLo * fMid <= 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return ((lo + hi) / 2) * 100;
}

export function computeInvestmentPortfolio(
  securities: Security[],
  txns: InvestmentTxn[],
  asOfISO: string
): InvestmentPortfolio {
  const known = new Set(securities.map((s) => s.id));
  const bySecurity = new Map<string, InvestmentTxn[]>();
  for (const t of txns) {
    if (t.date > asOfISO || !known.has(t.securityId)) continue;
    const list = bySecurity.get(t.securityId);
    if (list) list.push(t);
    else bySecurity.set(t.securityId, [t]);
  }

  const monthly = new Map<string, InvestmentMonthly>();
  const bucket = (date: string): InvestmentMonthly => {
    const month = date.slice(0, 7);
    let m = monthly.get(month);
    if (!m) {
      m = { month, purchases: 0, saleProceeds: 0, income: 0, realizedGain: 0 };
      monthly.set(month, m);
    }
    return m;
  };

  const allFlows: { date: string; amount: number }[] = [];
  const positions: InvestmentPosition[] = [];

  for (const sec of securities) {
    const list = (bySecurity.get(sec.id) ?? []).sort(inOrder);
    let units = 0;
    let costBasis = 0;
    let realized = 0;
    let income = 0;
    let bought = 0;
    const flows: { date: string; amount: number }[] = [];

    for (const t of list) {
      const fee = t.fees ?? 0;
      if (t.kind === "buy") {
        const cost = t.amount + fee;
        units += t.units ?? 0;
        costBasis += cost;
        bought += cost;
        flows.push({ date: t.date, amount: -cost });
        bucket(t.date).purchases += cost;
      } else if (t.kind === "sell") {
        const wanted = t.units ?? 0;
        const sold = Math.min(wanted, units); // never sell more than is held
        if (sold <= EPS) continue;
        const proceeds = (t.amount - fee) * (sold / wanted);
        const avg = units > EPS ? costBasis / units : 0;
        const costOut = avg * sold;
        realized += proceeds - costOut;
        costBasis -= costOut;
        units -= sold;
        if (units <= EPS) {
          units = 0;
          costBasis = 0;
        }
        flows.push({ date: t.date, amount: proceeds });
        const m = bucket(t.date);
        m.saleProceeds += proceeds;
        m.realizedGain += proceeds - costOut;
      } else {
        const net = t.amount - fee;
        income += net;
        flows.push({ date: t.date, amount: net });
        bucket(t.date).income += net;
      }
    }

    const held = units > EPS;
    const priced = sec.currentPrice != null;
    const priceMissing = held && !priced;
    const marketValue = !held ? 0 : priced ? units * (sec.currentPrice as number) : costBasis;
    const unrealizedGain = marketValue - costBasis;
    const priceStale = held && priced && (!sec.priceDate || daysBetween(sec.priceDate, asOfISO) > STALE_PRICE_DAYS);
    const totalReturn = unrealizedGain + realized + income;

    const terminal = marketValue > 0 ? [{ date: asOfISO, amount: marketValue }] : [];
    positions.push({
      securityId: sec.id,
      name: sec.name,
      symbol: sec.symbol,
      assetClass: sec.assetClass,
      units,
      avgCost: held ? costBasis / units : 0,
      costBasis,
      currentPrice: priced ? (sec.currentPrice as number) : null,
      priceDate: sec.priceDate,
      priceMissing,
      priceStale,
      marketValue,
      unrealizedGain,
      unrealizedPct: held && costBasis > 0 ? (unrealizedGain / costBasis) * 100 : null,
      realizedGain: realized,
      income,
      totalBought: bought,
      totalReturn,
      totalReturnPct: bought > 0 ? (totalReturn / bought) * 100 : null,
      annualizedReturnPct: computeXirrPct([...flows, ...terminal]),
    });
    allFlows.push(...flows, ...terminal);
  }

  const sum = (f: (p: InvestmentPosition) => number) => positions.reduce((s, p) => s + f(p), 0);
  const costBasisTotal = sum((p) => p.costBasis);
  const marketValue = sum((p) => p.marketValue);
  const realizedGain = sum((p) => p.realizedGain);
  const income = sum((p) => p.income);
  const totalBought = sum((p) => p.totalBought);
  const unrealizedGain = marketValue - costBasisTotal;
  const totalReturn = unrealizedGain + realizedGain + income;

  const classes = new Map<InvestmentAssetClass, number>();
  for (const p of positions) if (p.marketValue > 0) classes.set(p.assetClass, (classes.get(p.assetClass) ?? 0) + p.marketValue);
  const allocation = Array.from(classes.entries())
    .map(([assetClass, value]) => ({ assetClass, marketValue: value, sharePct: marketValue > 0 ? (value / marketValue) * 100 : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue);

  return {
    asOf: asOfISO,
    positions,
    costBasis: costBasisTotal,
    marketValue,
    unrealizedGain,
    unrealizedPct: costBasisTotal > 0 ? (unrealizedGain / costBasisTotal) * 100 : null,
    realizedGain,
    income,
    totalBought,
    totalReturn,
    totalReturnPct: totalBought > 0 ? (totalReturn / totalBought) * 100 : null,
    annualizedReturnPct: computeXirrPct(allFlows),
    allocation,
    monthly: Array.from(monthly.values()).sort((a, b) => (a.month < b.month ? -1 : 1)),
    priceAttentionCount: positions.filter((p) => p.priceMissing || p.priceStale).length,
  };
}

// First security (by id) whose sells would exceed what it held at that moment, or null if the history is
// consistent. Used to refuse a sell of units not owned, and the deletion of a buy that later sells depend on.
export function findOversell(txns: InvestmentTxn[]): { securityId: string; date: string } | null {
  const bySecurity = new Map<string, InvestmentTxn[]>();
  for (const t of txns) {
    if (t.kind === "income") continue;
    const list = bySecurity.get(t.securityId);
    if (list) list.push(t);
    else bySecurity.set(t.securityId, [t]);
  }
  for (const [securityId, list] of bySecurity) {
    let units = 0;
    for (const t of list.sort(inOrder)) {
      if (t.kind === "buy") units += t.units ?? 0;
      else {
        units -= t.units ?? 0;
        if (units < -1e-6) return { securityId, date: t.date };
      }
    }
  }
  return null;
}

export interface ProjectionPoint {
  year: number; // 0 = today
  value: number;
  contributed: number; // starting value plus everything added so far
}

// What the portfolio could be worth in future, compounding monthly at an assumed annual return, with an
// optional fixed amount added each month. An assumption the owner chooses, never a forecast.
export function projectPortfolio(
  startValue: number,
  annualReturnPct: number,
  years: number,
  monthlyContribution = 0
): ProjectionPoint[] {
  const monthlyRatePct = (Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1) * 100;
  const points: ProjectionPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const n = y * 12;
    points.push({
      year: y,
      value: computeFutureValue(startValue, monthlyRatePct, n) + computeFutureValueOfSeries(monthlyContribution, monthlyRatePct, n),
      contributed: startValue + monthlyContribution * n,
    });
  }
  return points;
}

// Goal planning on the same assumptions as projectPortfolio: monthly compounding at an assumed annual
// return, with a fixed amount added each month.

// How many months until the portfolio reaches `target`, or null if it never does within `maxMonths`
// (for example 0% growth and nothing added). 0 when it is already there.
export function monthsToReachTarget(
  startValue: number,
  annualReturnPct: number,
  monthlyContribution: number,
  target: number,
  maxMonths = 1200
): number | null {
  if (startValue >= target) return 0;
  const rate = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  let value = startValue;
  for (let m = 1; m <= maxMonths; m++) {
    value = value * (1 + rate) + monthlyContribution;
    if (value >= target) return m;
  }
  return null;
}

// The fixed monthly amount that gets the portfolio from `startValue` to `target` in `years` at the assumed
// return. 0 when growth alone already gets there.
export function requiredMonthlyContribution(startValue: number, annualReturnPct: number, years: number, target: number): number {
  const n = Math.max(1, Math.round(years * 12));
  const rate = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const grown = computeFutureValue(startValue, rate * 100, n);
  if (grown >= target) return 0;
  const factor = rate === 0 ? n : (Math.pow(1 + rate, n) - 1) / rate;
  return (target - grown) / factor;
}
