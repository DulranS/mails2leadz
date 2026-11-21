// Group consolidation (v248). A group is the businesses one login owns or manages. Each business publishes a monthly summary (revenue, cost of
// sales, costs and tax, profit). The group adds the summaries together, and removes transfers between its own businesses: a transfer is revenue for
// the seller and a cost for the buyer, so it is taken out of both sides and the profit is unchanged. Pure: no I/O.

export interface MonthSummary { month: string; revenue: number; costOfSales: number; costsAndTax: number; netProfit: number }
export interface BusinessSummary { businessId: string; name: string; currency: string; months: MonthSummary[] }
export interface Transfer { id: string; month: string; amount: number; fromBusinessId: string; toBusinessId: string; note?: string }

export interface GroupMonth { month: string; revenue: number; costOfSales: number; costsAndTax: number; netProfit: number; eliminated: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ReportingOptions { reportingCurrency?: string; rates?: Record<string, number> } // rates: units of reporting currency per 1 unit of the business's currency

export function validateGroup(members: BusinessSummary[], transfers: Transfer[], opts?: ReportingOptions): string | null {
  if (members.length < 2) return "A group needs at least two businesses.";
  const currencies = new Set(members.map((m) => m.currency));
  if (opts?.reportingCurrency) {
    for (const c of currencies) {
      if (c === opts.reportingCurrency) continue;
      if (!((opts.rates?.[c] ?? 0) > 0)) return `Enter the rate from ${c} to ${opts.reportingCurrency}, so the group can add it up.`;
    }
  } else if (currencies.size > 1) {
    return `The businesses use different currencies (${[...currencies].join(", ")}). Choose a reporting currency and enter the rates.`;
  }
  const ids = new Set(members.map((m) => m.businessId));
  for (const t of transfers) {
    if (!(t.amount > 0)) return "A transfer must be more than zero.";
    if (!ids.has(t.fromBusinessId) || !ids.has(t.toBusinessId)) return "A transfer must be between two businesses in the group.";
    if (t.fromBusinessId === t.toBusinessId) return "A transfer must go from one business to a different one.";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(t.month)) return "A transfer must have a month.";
  }
  return null;
}

// Add the businesses' months together by month, then take out the transfers between them.
// Each business's figures are converted to the reporting currency first (transfers are already entered in it).
export function consolidate(members: BusinessSummary[], transfers: Transfer[], opts?: ReportingOptions): GroupMonth[] {
  const factor = (m: BusinessSummary) => (!opts?.reportingCurrency || m.currency === opts.reportingCurrency ? 1 : (opts.rates?.[m.currency] ?? 0));
  const byMonth = new Map<string, GroupMonth>();
  const row = (month: string) => {
    let r = byMonth.get(month);
    if (!r) { r = { month, revenue: 0, costOfSales: 0, costsAndTax: 0, netProfit: 0, eliminated: 0 }; byMonth.set(month, r); }
    return r;
  };
  for (const m of members) {
    const f = factor(m);
    for (const mo of m.months) {
      const r = row(mo.month);
      r.revenue += mo.revenue * f;
      r.costOfSales += mo.costOfSales * f;
      r.costsAndTax += mo.costsAndTax * f;
      r.netProfit += mo.netProfit * f;
    }
  }
  for (const t of transfers) {
    const r = row(t.month);
    r.revenue -= t.amount;       // the seller's revenue from the buyer
    r.costOfSales -= t.amount;   // the buyer's cost from the seller (taken as cost of sales, the same line as the goods it stands for)
    r.eliminated += t.amount;
  };
  return [...byMonth.values()].map((r) => ({ ...r, revenue: r2(r.revenue), costOfSales: r2(r.costOfSales), costsAndTax: r2(r.costsAndTax), netProfit: r2(r.netProfit), eliminated: r2(r.eliminated) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// The first month of the last twelve, for the screen.
export function lastTwelveMonths(today: string): string[] {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }).reverse();
}
