// Pure date/scheduling math for recurring expense templates. Deliberately
// mirrors lib/recurringInvoices.ts's shape exactly — same due/catch-up
// logic, same reasoning — since a RecurringExpenseTemplate's schedule
// behaves identically to a RecurringInvoice's; only what gets generated at
// the end differs (a pending, editable occurrence here, vs. posting
// straight to a Sale there).
import { calculateNextDueDate } from "./recurringTransactions";
import type { RecurringExpenseTemplate } from "./types";

export { calculateNextDueDate };

/**
 * Which active templates have a due occurrence on or before `asOfDate`.
 *
 * Deliberately returns AT MOST ONE occurrence per template per call, even
 * if a template has been paused/inactive for months: see
 * dueRecurringInvoices in lib/recurringInvoices.ts for the full reasoning,
 * which applies identically here.
 */
export function dueRecurringExpenseTemplates(
  templates: RecurringExpenseTemplate[],
  asOfDate: string
): RecurringExpenseTemplate[] {
  return templates.filter((t) => {
    if (!t.active) return false;
    if (t.endDate && t.endDate < t.nextDueDate) return false;
    return t.nextDueDate <= asOfDate;
  });
}

/**
 * Advances a template's nextDueDate forward from a missed date to the next
 * occurrence that isn't itself already in the past relative to asOfDate,
 * without generating an occurrence for anything in between. See
 * catchUpNextDueDate in lib/recurringInvoices.ts for the full reasoning.
 */
export function catchUpNextDueDate(
  recurrence: RecurringExpenseTemplate["recurrence"],
  fromDate: string,
  asOfDate: string,
  anchorDay?: number
): string {
  let next = calculateNextDueDate(recurrence, fromDate, anchorDay);
  let guard = 0;
  while (next <= asOfDate && guard < 1000) {
    next = calculateNextDueDate(recurrence, next, anchorDay);
    guard++;
  }
  return next;
}
