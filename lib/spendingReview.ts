// Spending review: of the recurring costs the business pays, how much is essential, how much is merely useful, and how
// much is optional and could be paused if cash gets tight. Pure functions, no I/O. It only reads the optional
// `importance` tag the owner puts on a cost; nothing is paused, changed or reported anywhere by this.
//
// Counted: recurring expenses (not recurring revenue) that are running today, at their monthly equivalent. Not counted:
// payroll lines (they belong to a person on the Staff page, not to a subscription you can cancel) and one-off bills.
import { monthlyNormalizedAmount } from "./calculations";
import type { Expense, ExpenseImportance } from "./types";

export interface ReviewBucket { monthly: number; count: number }

export interface SpendingReview {
  essential: ReviewBucket;
  useful: ReviewBucket;
  optional: ReviewBucket;
  unreviewed: ReviewBucket;
  total: number; // monthly, all recurring costs counted
  pausableSharePct: number | null; // optional as a share of the total
  reviewedPct: number | null; // how much of the total (by money) has been given a tag
}

export function computeSpendingReview(expenses: Expense[], asOfISO: string): SpendingReview {
  const empty = (): ReviewBucket => ({ monthly: 0, count: 0 });
  const buckets: Record<ExpenseImportance | "unreviewed", ReviewBucket> = { essential: empty(), useful: empty(), optional: empty(), unreviewed: empty() };
  for (const e of expenses) {
    if (e.kind !== "expense" || !e.isRecurring || e.employeeId) continue;
    if (e.startDate > asOfISO || (e.endDate && e.endDate < asOfISO)) continue;
    const monthly = monthlyNormalizedAmount(e.amount, e.recurrence);
    if (!(monthly > 0) || !Number.isFinite(monthly)) continue;
    const key: ExpenseImportance | "unreviewed" = e.importance === "essential" || e.importance === "useful" || e.importance === "optional" ? e.importance : "unreviewed";
    buckets[key].monthly += monthly;
    buckets[key].count += 1;
  }
  const total = buckets.essential.monthly + buckets.useful.monthly + buckets.optional.monthly + buckets.unreviewed.monthly;
  return {
    ...buckets, total,
    pausableSharePct: total > 0 ? (buckets.optional.monthly / total) * 100 : null,
    reviewedPct: total > 0 ? ((total - buckets.unreviewed.monthly) / total) * 100 : null,
  };
}
