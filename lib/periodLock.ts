// "Close the books" — a period lock.
//
// Once a month has been reviewed (and, say, its statements printed for a
// bank or an accountant), the owner can close the books through that
// month's last day. From then on, nobody — Staff, Manager, or the owner
// themselves — can add, edit or delete a dated transaction that falls on or
// before that date. The owner can reopen (or move the date) from Settings;
// every change of the date is written to the audit log.
//
// Why this exists: Statements can be printed and handed to a bank, but until
// now a Manager could still back-date a sale or edit last quarter's expense
// and silently change a figure that was already shared. A lock is the
// standard fix and needs no external system — it is one date in Settings.
//
// What it covers (see lib/periodGuards.ts for the exact list): one-off dated
// records — sales, purchases, one-off expenses, customer/supplier/bill
// payments, write-offs, returns, discounts, stock adjustments, capital
// entries, tax payments. What it deliberately does NOT freeze: recurring
// schedules (rent, subscriptions), employees/payroll, loans and fixed assets.
// Those are schedules that project across many months; freezing them would
// stop an owner from ever giving a raise or ending a lease. To change one
// without touching closed months, end the old schedule and start a new one.
//
// Where it is enforced: in the app layer (DataContext for everything a
// signed-in person does, and lib/aiAutoConfirm.ts for the AI Assistant's
// server-side writes). It is NOT enforced in firestore.rules — see the
// CHANGELOG entry for why (rules cost a document read per written document,
// which would cap bulk imports and multi-line invoices at ~10 rows).
//
// Pure functions only (no Firebase, no React) so scripts/verify-period-lock.ts
// can exercise them directly.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A real calendar date in strict YYYY-MM-DD form. "2026-02-30" and
// "2026-13-01" are rejected — a string that merely looks like a date must
// never be trusted, least of all when it came from a language model.
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Last calendar day of the month containing `iso`.
export function endOfMonthIso(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

export function isMonthEnd(iso: string): boolean {
  return isValidIsoDate(iso) && endOfMonthIso(iso) === iso;
}

// The last day of the most recently COMPLETED month, relative to `todayIso`.
// This is the latest date the books may be closed through: closing a month
// that is still in progress would lock out today's own entries.
export function endOfPreviousMonthIso(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  return `${prevYear}-${pad(prevMonth)}-${pad(daysInMonth(prevYear, prevMonth))}`;
}

// "31 Aug 2026". Locale-independent on purpose: it appears inside error
// messages that are also asserted on by tests.
export function formatIsoLong(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The day after the lock — the earliest date a new entry may carry.
export function firstOpenDateIso(closedThrough: string): string {
  const [y, m, d] = closedThrough.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// A lock value that is unset, empty, or not a real date means "not closed".
// Failing open here is deliberate: a corrupted field must not brick every
// write for a business. (The owner sees the state on the Settings card.)
export function normalizeClosedThrough(value: unknown): string | undefined {
  return isValidIsoDate(value) ? value : undefined;
}

// True when `date` falls on or before the lock. A missing or malformed date
// is never "closed" — other validation owns that problem.
export function isPeriodClosed(date: unknown, closedThrough: unknown): boolean {
  const lock = normalizeClosedThrough(closedThrough);
  if (!lock || !isValidIsoDate(date)) return false;
  return date <= lock;
}

export class PeriodClosedError extends Error {
  readonly closedThrough: string;
  readonly date: string;
  constructor(closedThrough: string, date: string) {
    super(periodClosedMessage(closedThrough, date));
    this.name = "PeriodClosedError";
    this.closedThrough = closedThrough;
    this.date = date;
  }
}

export function periodClosedMessage(closedThrough: string, date?: string): string {
  const through = formatIsoLong(closedThrough);
  const what = date ? `a record dated ${formatIsoLong(date)}` : "a record in that period";
  return (
    `The books are closed through ${through}, so ${what} can't be added, changed or deleted. ` +
    `Use a date of ${formatIsoLong(firstOpenDateIso(closedThrough))} or later, or ask the owner to reopen the period ` +
    `(Settings → Operations → Close the books).`
  );
}

// Throws PeriodClosedError for the first date that lands in a closed period.
// `undefined` entries (a field the caller didn't supply) are skipped.
export function assertPeriodOpen(closedThrough: unknown, dates: readonly (string | undefined | null)[]): void {
  const lock = normalizeClosedThrough(closedThrough);
  if (!lock) return;
  for (const date of dates) {
    if (isPeriodClosed(date, lock)) throw new PeriodClosedError(lock, date as string);
  }
}

// Validation for the owner's own action of setting the lock. Returns a
// plain-language error, or null when the value is acceptable. `null`
// (reopen everything) is always acceptable.
export function validateBooksClosedThrough(candidate: string | null, todayIso: string): string | null {
  if (candidate === null) return null;
  if (!isValidIsoDate(candidate)) return "Enter a real date.";
  if (!isMonthEnd(candidate)) {
    return "Books close at the end of a month — pick the last day of the month (for example 31 Aug).";
  }
  const latest = endOfPreviousMonthIso(todayIso);
  if (candidate > latest) {
    return `You can only close months that have finished. The latest you can close through is ${formatIsoLong(latest)}.`;
  }
  return null;
}
