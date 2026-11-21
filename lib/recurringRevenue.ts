// Recurring-revenue health: ARR, what was added and lost in the last month, and how much of the
// business's income is predictable. Pure arithmetic over records the owner already keeps (recurring
// revenue items entered on the Expenses page); nothing is stored, sent or connected to anything.
//
// Works for any business with repeat income: a software plan, a retainer, rent received, a
// membership. It reads the owner's own recurring items, so it is only as complete as those entries.
//
// Identity (pinned by scripts/verify-recurring-revenue.ts):  mrrNow = mrrBefore + added - lost.
// An item counts at a date by the same rule computeMRR uses: started on or before it, and with no
// end date or an end date on or after it.
import { addMonthsIso, computeMRR, monthlyNormalizedAmount } from "./calculations";
import type { Expense } from "./types";
import type { MonthlyPnL } from "./calculations";

export interface RecurringRevenueHealth {
  mrr: number; // recurring revenue per month, right now
  arr: number; // mrr x 12: the yearly run-rate if nothing changes
  mrrBefore: number; // the same figure one month ago
  added: number; // monthly value of recurring revenue that started in the last month and is still running
  lost: number; // monthly value of recurring revenue that was running a month ago and has ended since
  netNew: number; // added - lost
  growthPct: number | null; // (mrr - mrrBefore) / mrrBefore; null when there was none a month ago
  churnPct: number | null; // lost / mrrBefore; null when there was none a month ago
  predictableSharePct: number | null; // recurring share of total revenue over the last 3 full months; null with no revenue
  monthlyRecurringCosts: number; // recurring costs per month, right now (rent, payroll, subscriptions)
  coverage: number | null; // mrr / monthlyRecurringCosts; 1 = predictable income just covers predictable costs; null with no recurring costs
}

function activeOn(e: Expense, iso: string): boolean {
  return e.startDate <= iso && (!e.endDate || e.endDate >= iso);
}

export function computeRecurringRevenueHealth(
  expenses: Expense[],
  monthlyPnL: MonthlyPnL[],
  asOfISO: string
): RecurringRevenueHealth {
  const windowStart = addMonthsIso(asOfISO, -1);
  const now = computeMRR(expenses, asOfISO);
  const before = computeMRR(expenses, windowStart);

  let added = 0;
  let lost = 0;
  for (const e of expenses) {
    if (!e.isRecurring || e.kind !== "revenue") continue;
    const wasActive = activeOn(e, windowStart);
    const isActive = activeOn(e, asOfISO);
    const monthly = monthlyNormalizedAmount(e.amount, e.recurrence);
    if (isActive && !wasActive) added += monthly;
    else if (wasActive && !isActive) lost += monthly;
  }

  // The last three FULL months before asOf's month: the current month is still filling up.
  const thisMonth = asOfISO.slice(0, 7);
  const recent = monthlyPnL
    .filter((m) => m.month < thisMonth)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .slice(-3);
  const totalRev = recent.reduce((s, m) => s + m.totalRevenue, 0);
  const recurRev = recent.reduce((s, m) => s + m.recurringRevenue, 0);

  return {
    mrr: now.mrrRevenue,
    arr: now.mrrRevenue * 12,
    mrrBefore: before.mrrRevenue,
    added,
    lost,
    netNew: added - lost,
    growthPct: before.mrrRevenue > 0 ? ((now.mrrRevenue - before.mrrRevenue) / before.mrrRevenue) * 100 : null,
    churnPct: before.mrrRevenue > 0 ? (lost / before.mrrRevenue) * 100 : null,
    predictableSharePct: totalRev > 0 ? Math.min(100, (recurRev / totalRev) * 100) : null,
    monthlyRecurringCosts: now.mrrExpense,
    coverage: now.mrrExpense > 0 ? now.mrrRevenue / now.mrrExpense : null,
  };
}
