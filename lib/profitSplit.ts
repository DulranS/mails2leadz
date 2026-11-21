// Profit split (v252): where the revenue goes. Revenue, then gross profit, then net profit (after everything the business pays), then what is put back
// into the business (reinvestment) and what the owner takes home. Each step is measured against a target you set, as a share of revenue. Actuals come
// from the monthly profit and the capital entries: reinvestment is money put back in; take-home is the owner's withdrawals (an investor's pool money
// returned to them is not take-home, and is left out). Pure: no I/O.

export interface SplitMonth { month: string; revenue: number; grossProfit: number; netProfit: number }
export interface SplitCapital { kind: "investment" | "reinvestment" | "withdrawal"; amount: number; date: string; poolOwned: boolean }
export interface SplitTargets { reinvestPct?: number; takeHomePct?: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function validateTargets(t: SplitTargets): string | null {
  for (const v of [t.reinvestPct, t.takeHomePct]) {
    if (v !== undefined && !(v >= 0 && v <= 100)) return "Each target must be between 0% and 100% of revenue.";
  }
  if ((t.reinvestPct ?? 0) + (t.takeHomePct ?? 0) > 100) return "Reinvestment and take-home together cannot be more than 100% of revenue.";
  return null;
}

export function profitSplit(months: SplitMonth[], capital: SplitCapital[], targets: SplitTargets, period: { from: string; to: string }) {
  const inPeriod = months.filter((m) => m.month >= period.from && m.month <= period.to);
  const revenue = r2(inPeriod.reduce((t, m) => t + m.revenue, 0));
  const grossProfit = r2(inPeriod.reduce((t, m) => t + m.grossProfit, 0));
  const netProfit = r2(inPeriod.reduce((t, m) => t + m.netProfit, 0));
  const inDate = (d: string) => d.slice(0, 7) >= period.from && d.slice(0, 7) <= period.to;
  const reinvestActual = r2(capital.filter((c) => c.kind === "reinvestment" && inDate(c.date)).reduce((t, c) => t + c.amount, 0));
  const takeHomeActual = r2(capital.filter((c) => c.kind === "withdrawal" && !c.poolOwned && inDate(c.date)).reduce((t, c) => t + c.amount, 0));
  const set = targets.reinvestPct !== undefined || targets.takeHomePct !== undefined;
  const reinvestTarget = r2(revenue * ((targets.reinvestPct ?? 0) / 100));
  const takeHomeTarget = r2(revenue * ((targets.takeHomePct ?? 0) / 100));
  return {
    revenue,
    grossProfit,
    grossMarginPct: revenue > 0 ? r2((grossProfit / revenue) * 100) : null,
    netProfit,
    netMarginPct: revenue > 0 ? r2((netProfit / revenue) * 100) : null,
    reinvest: { target: reinvestTarget, actual: reinvestActual },
    takeHome: { target: takeHomeTarget, actual: takeHomeActual },
    leftAfterTargets: r2(netProfit - reinvestTarget - takeHomeTarget),
    status: !set ? "not_set" as const : netProfit <= 0 ? "loss" as const : netProfit - reinvestTarget - takeHomeTarget >= 0 ? "covered" as const : "short" as const,
  };
}
