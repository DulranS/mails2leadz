// Accruals (v209): an estimated cost for something used in a month but not billed until a later one (for example a delivery received
// on 30 October whose invoice arrives in November). The accrual puts the cost in the month it was incurred, and reverses automatically on
// the first day of the next month, so when the real bill is recorded the cost is not counted twice. Accruals are not cash: they never
// reach the cash runway or the cash paid for expenses, only the monthly profit and accrued liabilities on the balance sheet. Pure.
import { EXPENSE_CATEGORIES, type Accrual, type Expense } from "./types";
import { periodEnd } from "./monthClose";
import { isPeriodClosed } from "./periodLock";
import { makeEntry, type JEntry } from "./journal";

// The account an accrual is held in until the bill arrives (v319). A liability.
export const ACCRUED_COSTS_ACCOUNT = "Accrued costs";

// The entries the balance check uses (v319): an accrual or reversal dated after today is not yet in the balance sheet (it counts only once its
// accrual day has come), so it is left out of the check. Every other entry is kept as before.
export function forReconcile(entries: JEntry[], today: string): JEntry[] {
  return entries.filter((e) => !(e.id.startsWith("accrual:") || e.id.startsWith("accrual-reversal:")) || e.date <= today);
}

// The accruals as journal entries (v319): the cost on the accrual day (debit the expense, credit accrued costs), and the reversal on the first day
// of the next month (the reverse). Each entry is checked as it is made; a bad one is returned as an error, not dropped. Pure.
export function accrualJournalEntries(accruals: Accrual[]): { entries: JEntry[]; errors: string[] } {
  const entries: JEntry[] = [];
  const errors: string[] = [];
  for (const a of accruals) {
    const expense = `Expense: ${a.category}`;
    const accrue = makeEntry(`accrual:${a.id}`, a.accrualDate, `Accrued: ${a.name}`, [{ account: expense, debit: a.amount, credit: 0 }, { account: ACCRUED_COSTS_ACCOUNT, debit: 0, credit: a.amount }]);
    const reverse = makeEntry(`accrual-reversal:${a.id}`, a.reversalDate, `Reversal: ${a.name}`, [{ account: ACCRUED_COSTS_ACCOUNT, debit: a.amount, credit: 0 }, { account: expense, debit: 0, credit: a.amount }]);
    for (const e of [accrue, reverse]) {
      if ("error" in e) errors.push(e.error);
      else entries.push(e);
    }
  }
  return { entries, errors };
}

export const MAX_ACCRUAL = 1_000_000_000;

// The first day of the month after `period` (YYYY-MM), as ISO.
export function firstOfNextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function validateAccrual(
  i: { name: string; amount: number; category: string; periodMonth: string },
  closedThrough: string | undefined,
): string | null {
  if (!i.name || i.name.trim().length < 2) return "Say what the cost is for.";
  if (!Number.isFinite(i.amount) || i.amount <= 0 || i.amount > MAX_ACCRUAL) return "The estimated amount must be more than zero.";
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(i.category)) return "Choose the category of expense.";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.periodMonth)) return "Choose the month the cost was incurred.";
  if (isPeriodClosed(periodEnd(i.periodMonth), closedThrough)) return "That month is closed, so no accrual can be added to it.";
  // The reversal lands in the next month; if that month is closed, the cost would move a closed month’s profit.
  if (isPeriodClosed(firstOfNextMonth(i.periodMonth), closedThrough)) return "The month after is closed, so this accrual would change a closed month.";
  // The reversal lands in the next month; if that month is closed, the cost would move a closed month’s profit.
  if (isPeriodClosed(firstOfNextMonth(i.periodMonth), closedThrough)) return "The month after is closed, so this accrual would change a closed month.";
  return null;
}

// The accruals as the monthly profit sees them: the cost on the accrual day, and a reversal (the same cost, negative) on the first day of
// the next month. Only the profit reads these; the cash records never see them.
export function accrualAsExpenses(accruals: Accrual[]): Expense[] {
  const out: Expense[] = [];
  for (const a of accruals) {
    const base = { kind: "expense", isRecurring: false, recurrence: "none", category: a.category } as const;
    out.push({ ...base, id: `${a.id}:accrue`, name: `Accrued: ${a.name}`, amount: a.amount, startDate: a.accrualDate } as unknown as Expense);
    out.push({ ...base, id: `${a.id}:reverse`, name: `Reversal: ${a.name}`, amount: -a.amount, startDate: a.reversalDate } as unknown as Expense);
  }
  return out;
}

// What is owed for accruals on a given day: those incurred on or before it and not yet reversed.
export function accruedLiabilityAsOf(accruals: Accrual[], asOf: string): number {
  return Math.round(accruals.filter((a) => a.accrualDate <= asOf && a.reversalDate > asOf).reduce((t, a) => t + a.amount, 0) * 100) / 100;
}
