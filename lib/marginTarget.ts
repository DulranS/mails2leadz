// A net profit margin target, compared with what each recent month actually made.
//
// Revenue is not profit: a business can grow sales and still earn less. The owner sets one number in Settings (say 15%)
// and the dashboard shows the last few months' net margin (net profit before tax over revenue, the same net profit the
// Profit & Loss shows) against it, and warns when it has stayed under it. Read-only: nothing is posted or changed.

export interface MarginMonth {
  month: string; // "YYYY-MM"
  totalRevenue: number;
  netProfitPreTax: number;
}

export interface MarginRow {
  month: string;
  partial: boolean; // the month still running
  revenue: number;
  net: number;
  marginPct: number | null; // null when the month had no revenue (a margin of nothing means nothing)
  gapPts: number | null; // margin minus target, in percentage points
  onTarget: boolean | null; // null when there is no margin to judge
}

export interface MarginVsTarget {
  targetPct: number;
  rows: MarginRow[]; // oldest first: the last complete months, then the running month
  monthsBelowInARow: number; // consecutive COMPLETE months (latest first) under target; months with no revenue are skipped
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// `showCompleteMonths`: how many finished months to show besides the running one.
export function marginVsTarget(months: MarginMonth[], targetPct: number | null | undefined, currentMonthKey: string, showCompleteMonths = 3): MarginVsTarget | null {
  if (typeof targetPct !== "number" || !Number.isFinite(targetPct) || targetPct <= 0 || targetPct > 100) return null;
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const sorted = [...months].filter((m) => /^\d{4}-\d{2}$/.test(m.month) && m.month <= currentMonthKey).sort((a, b) => a.month.localeCompare(b.month));
  const toRow = (m: MarginMonth): MarginRow => {
    const revenue = Number.isFinite(m.totalRevenue) ? m.totalRevenue : 0;
    const net = Number.isFinite(m.netProfitPreTax) ? m.netProfitPreTax : 0;
    const marginPct = revenue > 0 ? r1((net / revenue) * 100) : null;
    const gapPts = marginPct === null ? null : r1(marginPct - targetPct);
    return { month: m.month, partial: m.month === currentMonthKey, revenue, net, marginPct, gapPts, onTarget: gapPts === null ? null : gapPts >= 0 };
  };
  const complete = sorted.filter((m) => m.month < currentMonthKey).slice(-showCompleteMonths).map(toRow);
  const running = sorted.filter((m) => m.month === currentMonthKey).map(toRow);
  let below = 0;
  for (const r of [...complete].reverse()) {
    if (r.onTarget === null) continue; // no revenue that month: neither a miss nor a hit
    if (r.onTarget) break;
    below += 1;
  }
  return { targetPct, rows: [...complete, ...running], monthsBelowInARow: below };
}
