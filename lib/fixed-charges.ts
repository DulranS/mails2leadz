// Rent expense over a set of months (pass 314), used as the lease expense in fixed-charge cover. Lines whose category names rent or
// lease count. Recurring lines are counted in each month they run, the same way the scorecard counts R&D.
import type { Expense } from "./types";
import { monthlyNormalizedAmount } from "./calculations";

const RENT = /\brent\b|\blease\b|leasing/i;

export function rentExpenseFor(expenses: Expense[], monthKeys: string[]): number {
  let total = 0;
  for (const mk of monthKeys) {
    const [y, m] = mk.split("-").map(Number);
    const monthStart = `${mk}-01`;
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    for (const e of expenses) {
      if (e.kind === "revenue" || !RENT.test(e.category || "")) continue;
      if (e.isRecurring) {
        const started = e.startDate < nextMonth;
        const notEnded = !e.endDate || e.endDate >= monthStart;
        if (started && notEnded) total += monthlyNormalizedAmount(e.amount, e.recurrence);
      } else if (e.startDate >= monthStart && e.startDate < nextMonth) {
        total += e.amount;
      }
    }
  }
  return total;
}
