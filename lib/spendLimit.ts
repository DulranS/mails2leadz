// Monthly spending limit for managers (v286). The owner sets one amount in Settings. A manager's one-off expenses in a calendar month
// cannot go over it. The owner is not limited. Staff cannot record expenses, so the limit does not apply to them. Recurring costs
// (rent, subscriptions, payroll lines) are not counted: they are decided once, not spent by a person in the month.
// Pure: no I/O.

export interface SpendRow {
  amount: number;
  startDate?: string; // ISO date the expense is dated to
  createdByUid?: string; // the login that recorded it
  isRecurring?: boolean;
  kind?: string;
}

// What one login has spent on one-off expenses in a calendar month (YYYY-MM). Unpaid bills count: the cost is real in that month.
export function spentByPersonInMonth(rows: SpendRow[], uid: string, month: string): number {
  if (!uid || !/^\d{4}-\d{2}$/.test(month)) return 0;
  let total = 0;
  for (const r of rows) {
    if (r.createdByUid !== uid || r.isRecurring || r.kind === "revenue") continue;
    if (!r.startDate || !r.startDate.startsWith(month)) continue;
    if (Number.isFinite(r.amount)) total += r.amount;
  }
  return Math.round(total * 100) / 100;
}

// Why an expense cannot be recorded, or null when it can. Only managers are limited; zero or no limit means none.
export function spendLimitProblem(i: { role: string; amount: number; spentThisMonth: number; limit: number | undefined }): string | null {
  if (i.role !== "manager") return null;
  if (!(i.limit !== undefined && i.limit > 0)) return null;
  const after = Math.round((i.spentThisMonth + i.amount) * 100) / 100;
  if (after <= i.limit) return null;
  return `This would take your spending this month to ${after.toFixed(2)}, over the monthly limit of ${i.limit.toFixed(2)} the owner set. Ask the owner to record it or raise the limit.`;
}

// The owner's limit must be a sensible amount. Zero turns the limit off.
export function validSpendLimit(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return "The monthly limit must be from 0 to 100,000,000. 0 turns it off.";
  return null;
}
