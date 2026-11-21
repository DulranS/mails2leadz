// Stress test: what would a bad stretch do to this business? "What if sales fall 20% and costs rise 10%?" answered from the
// business's own recent months: profit, margin, break-even revenue, margin of safety and how long the cash would last.
//
// Why: a model that works only while every assumption holds is the risk (a currency move, a power-tariff rise, a lost customer).
// This shows how much room there is. It reads the Profit & Loss; it changes nothing.
//
// The model, kept deliberately simple and stated on screen:
//   - Sales volume changes by s%: revenue and the costs that follow volume (cost of goods and variable costs) move with it.
//   - Costs rise by c%: cost of goods, variable costs and operating expenses (rent, payroll, utilities) all cost c% more; the
//     selling price does not change. Interest, depreciation and the like are held where they are.
//   - Baseline = the average of the last (up to) 3 COMPLETE months, so the month still running never distorts it.
//   - Cash: the change in monthly profit is carried straight into monthly cash flow, then divided into the cash on hand
//     (the same "months of cash" idea as the runway figure on this page).

export interface StressMonth {
  month: string; // "YYYY-MM"
  totalRevenue: number;
  cogs: number;
  variableCosts: number;
  operatingExpenses: number;
  netProfitPreTax: number;
  netCashFlow: number;
}

export interface StressBaseline {
  months: number; // how many complete months the averages rest on
  revenue: number;
  variableCosts: number; // cost of goods + variable costs: the costs that follow volume
  operatingExpenses: number;
  otherCosts: number; // everything else between revenue and profit (interest, depreciation, losses...): held constant
  netProfit: number;
  netCashFlow: number;
}

export interface StressScenario {
  salesChangePct: number; // -90 .. +100
  costChangePct: number; // -50 .. +100
}

export interface StressOutcome {
  revenue: number;
  netProfit: number;
  marginPct: number | null;
  breakEvenRevenue: number | null; // null = never breaks even at these margins
  marginOfSafetyPct: number | null;
  monthlyCashFlow: number;
  runwayMonths: number | null; // null = cash is not falling
}

export const MAX_STRESS_MONTHS = 3;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0);

export function stressBaseline(months: StressMonth[], currentMonthKey: string): StressBaseline | null {
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const done = months.filter((m) => /^\d{4}-\d{2}$/.test(m.month) && m.month < currentMonthKey).sort((a, b) => a.month.localeCompare(b.month)).slice(-MAX_STRESS_MONTHS);
  if (done.length === 0) return null;
  const avg = (f: (m: StressMonth) => number) => done.reduce((s, m) => s + (Number.isFinite(f(m)) ? f(m) : 0), 0) / done.length;
  const revenue = avg((m) => m.totalRevenue);
  if (!(revenue > 0)) return null;
  const variableCosts = avg((m) => m.cogs + m.variableCosts);
  const operatingExpenses = avg((m) => m.operatingExpenses);
  const netProfit = avg((m) => m.netProfitPreTax);
  return {
    months: done.length,
    revenue: r2(revenue),
    variableCosts: r2(variableCosts),
    operatingExpenses: r2(operatingExpenses),
    otherCosts: r2(revenue - variableCosts - operatingExpenses - netProfit), // makes the baseline add up to the real profit exactly
    netProfit: r2(netProfit),
    netCashFlow: r2(avg((m) => m.netCashFlow)),
  };
}

export function runStress(b: StressBaseline, cash: number, scenario: StressScenario): StressOutcome {
  const s = clamp(scenario.salesChangePct, -90, 100) / 100;
  const c = clamp(scenario.costChangePct, -50, 100) / 100;
  const revenue = b.revenue * (1 + s);
  const variable = b.variableCosts * (1 + s) * (1 + c);
  const opex = b.operatingExpenses * (1 + c);
  const netProfit = revenue - variable - opex - b.otherCosts;
  const cm = revenue > 0 ? (revenue - variable) / revenue : 0;
  const fixed = opex + b.otherCosts;
  const breakEven = fixed <= 0 ? 0 : cm > 0 ? fixed / cm : null;
  const monthlyCashFlow = b.netCashFlow + (netProfit - b.netProfit);
  const safeCash = Number.isFinite(cash) ? Math.max(cash, 0) : 0;
  return {
    revenue: r2(revenue),
    netProfit: r2(netProfit),
    marginPct: revenue > 0 ? r1((netProfit / revenue) * 100) : null,
    breakEvenRevenue: breakEven === null ? null : r2(breakEven),
    marginOfSafetyPct: breakEven === null || !(revenue > 0) ? null : r1(((revenue - breakEven) / revenue) * 100),
    monthlyCashFlow: r2(monthlyCashFlow),
    runwayMonths: monthlyCashFlow < 0 ? r1(safeCash / Math.abs(monthlyCashFlow)) : null,
  };
}
