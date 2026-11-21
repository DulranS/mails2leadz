// The monthly summary a business publishes for a group (v248): the last 24 months, in the business's own currency, from the same monthly profit the
// business itself shows. Pure. The group view adds these together (lib/consolidation.ts).
import type { MonthSummary } from "./consolidation";

export const SNAPSHOT_MONTHS = 24;

export function buildSnapshot(
  monthly: { month: string; totalRevenue: number; grossProfit: number; netProfitAfterTax: number }[],
  input: { businessName: string; currency: string; today: string },
) {
  const months: MonthSummary[] = [...monthly]
    .filter((m) => m.month <= input.today.slice(0, 7))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, SNAPSHOT_MONTHS)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      revenue: round2(m.totalRevenue),
      costOfSales: round2(m.totalRevenue - m.grossProfit),
      costsAndTax: round2(m.grossProfit - m.netProfitAfterTax),
      netProfit: round2(m.netProfitAfterTax),
    }));
  return { businessName: input.businessName || "Business", currency: input.currency, months };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
