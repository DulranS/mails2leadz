// Pure date/scheduling math for recurring invoices — kept free of Firestore
// so it can be unit-tested and reused from both the client (DataContext)
// and, if this ever grows a server-side scheduler, from there too. Mirrors
// the shape of lib/recurringTransactions.ts's calculateNextDueDate, reused
// directly below rather than re-implemented.
import { calculateNextDueDate } from "./recurringTransactions";
import type { RecurringInvoice } from "./types";

export { calculateNextDueDate };

/**
 * Which active schedules have a due occurrence on or before `asOfDate`.
 *
 * Deliberately returns AT MOST ONE occurrence per schedule per call, even if
 * a schedule has been paused/inactive for months and is now many cycles
 * behind: a retainer client that missed three months of the app being
 * unopened should get billed for the current cycle when the owner comes
 * back, not handed three backdated invoices at once. Advancing past missed
 * cycles without generating them is handled by the caller re-deriving
 * nextDueDate forward until it's no longer in the past — see
 * `catchUpNextDueDate` below — while still only ever creating one invoice.
 */
export function dueRecurringInvoices(
  schedules: RecurringInvoice[],
  asOfDate: string
): RecurringInvoice[] {
  return schedules.filter((r) => {
    if (!r.active) return false;
    if (r.endDate && r.endDate < r.nextDueDate) return false;
    return r.nextDueDate <= asOfDate;
  });
}

/**
 * Advances a schedule's nextDueDate forward from a missed date to the next
 * occurrence that isn't itself already in the past relative to asOfDate,
 * without generating an invoice for anything in between. Used so a
 * long-paused schedule that's resumed doesn't try to bill every missed
 * cycle — only the one that's due "now" (handled by dueRecurringInvoices),
 * with the schedule itself catching up silently to the current period after.
 */
export function catchUpNextDueDate(
  recurrence: RecurringInvoice["recurrence"],
  fromDate: string,
  asOfDate: string,
  anchorDay?: number
): string {
  let next = calculateNextDueDate(recurrence, fromDate, anchorDay);
  // Safety cap so a bad/ancient startDate can't spin this forever.
  let guard = 0;
  while (next <= asOfDate && guard < 1000) {
    next = calculateNextDueDate(recurrence, next, anchorDay);
    guard++;
  }
  return next;
}
