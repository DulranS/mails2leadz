// Routines: is the business running its rhythm? A short, fixed list of the habits that keep the books honest, each checked
// against the records themselves rather than ticked by hand. "Cash counted this week" is true only if a cash count exists
// dated this week; "overdue customers contacted" is true only if the collections diary has an entry for each of them.
//
// Why evidence and not a checklist: a tickbox can be ticked without the work being done, and the owner is not in the room.
// This is the books' side of the "can the business run without me" test. It reads existing records, writes nothing, and
// shows a check only when the business uses what it checks (no cash sales, no cash count routine; no bank lines, no
// reconciliation routine). It is deliberately not a task manager: the checks are fixed and each opens the page where the
// work is done.

export type RoutineStatus = "ok" | "attention" | "not_set_up";

export interface RoutineCheck {
  id: "cash_count" | "chase_customers" | "pay_bills" | "bank_reconciliation" | "stock_count" | "close_month";
  title: string;
  cadence: "Weekly" | "Monthly";
  status: RoutineStatus;
  detail: string;
  href: string;
}

export interface RoutineInputs {
  today: string; // ISO
  cashSalesLast30: number; // cash-method sales in the last 30 days
  cashCountDates: string[]; // dates of recorded cash counts
  overdueCustomerKeys: string[]; // lower-cased, trimmed names of customers with something past due (one entry per overdue line is fine)
  contactDatesByCustomer: Record<string, string>; // customer key -> date of the latest collections-diary entry for them
  outstandingPayables: { daysOverdue: number }[]; // every unpaid supplier bill and general bill
  bankLines: { date: string; status: string }[];
  stockItemsOnHand: number; // goods with stock on hand
  stockCountDates: string[]; // dates of count-correction adjustments
  booksClosedThrough?: string; // ISO, the period lock, if ever set
}

export const CASH_COUNT_EVERY_DAYS = 7;
export const CONTACT_WITHIN_DAYS = 7;
export const BANK_LINE_WAIT_DAYS = 7;
export const STOCK_COUNT_EVERY_DAYS = 35;
export const CLOSE_MONTH_AFTER_DAY = 7; // a month is "late to close" from the 8th of the next

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parse = (iso: string) => Date.parse(iso + "T00:00:00Z");
const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ago = (days: number) => (days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function latest(dates: string[], today: string): string | null {
  let best: string | null = null;
  for (const d of dates) if (ISO.test(d) && d <= today && (best === null || d > best)) best = d;
  return best;
}

export function computeRoutines(i: RoutineInputs): RoutineCheck[] {
  if (!ISO.test(i.today)) return [];
  const out: RoutineCheck[] = [];

  // 1. Cash counted this week. Only for a business that takes cash (or already counts it).
  if (i.cashSalesLast30 > 0 || i.cashCountDates.length > 0) {
    const last = latest(i.cashCountDates, i.today);
    const age = last === null ? null : daysBetween(last, i.today);
    const ok = age !== null && age <= CASH_COUNT_EVERY_DAYS;
    out.push({
      id: "cash_count", title: "Count the cash", cadence: "Weekly", status: ok ? "ok" : "attention", href: "/cash-count",
      detail: age === null ? "No cash count has been recorded yet." : ok ? `Last counted ${ago(age)}.` : `Last counted ${ago(age)}; once a week keeps a shortage small.`,
    });
  }

  // 2. Overdue customers contacted this week. Only when someone is overdue.
  const overdue = Array.from(new Set(i.overdueCustomerKeys.filter((k) => k !== "")));
  if (overdue.length > 0) {
    const silent = overdue.filter((k) => {
      const d = i.contactDatesByCustomer[k];
      return !d || !ISO.test(d) || daysBetween(d, i.today) > CONTACT_WITHIN_DAYS;
    });
    out.push({
      id: "chase_customers", title: "Chase what is overdue", cadence: "Weekly", status: silent.length === 0 ? "ok" : "attention", href: "/collections",
      detail: silent.length === 0
        ? `All ${plural(overdue.length, "overdue customer was", "overdue customers were")} contacted in the last ${CONTACT_WITHIN_DAYS} days.`
        : `${plural(silent.length, "overdue customer has", "overdue customers have")} not been contacted in the last ${CONTACT_WITHIN_DAYS} days.`,
    });
  }

  // 3. Nothing owed to suppliers is past due. Only when something is owed.
  if (i.outstandingPayables.length > 0) {
    const late = i.outstandingPayables.filter((p) => p.daysOverdue > 0).length;
    out.push({
      id: "pay_bills", title: "Pay bills on time", cadence: "Weekly", status: late === 0 ? "ok" : "attention", href: "/receivables-payables",
      detail: late === 0 ? "Nothing owed to suppliers or on bills is past due." : `${plural(late, "bill is", "bills are")} past due.`,
    });
  }

  // 4. No bank line left unmatched for over a week. Only for a business that imports or types statement lines.
  if (i.bankLines.length > 0) {
    const stale = i.bankLines.filter((l) => l.status === "unmatched" && ISO.test(l.date) && daysBetween(l.date, i.today) > BANK_LINE_WAIT_DAYS).length;
    out.push({
      id: "bank_reconciliation", title: "Reconcile the bank", cadence: "Weekly", status: stale === 0 ? "ok" : "attention", href: "/reconciliation",
      detail: stale === 0 ? `No bank line has waited more than ${BANK_LINE_WAIT_DAYS} days.` : `${plural(stale, "bank line has", "bank lines have")} been unmatched for over ${BANK_LINE_WAIT_DAYS} days.`,
    });
  }

  // 5. Stock counted in the last 35 days. Only with stock on hand.
  if (i.stockItemsOnHand > 0) {
    const last = latest(i.stockCountDates, i.today);
    const age = last === null ? null : daysBetween(last, i.today);
    const ok = age !== null && age <= STOCK_COUNT_EVERY_DAYS;
    out.push({
      id: "stock_count", title: "Count the stock", cadence: "Monthly", status: ok ? "ok" : "attention", href: "/products",
      detail: age === null ? "No stock count has been recorded yet (Products, Count stock)." : ok ? `Last counted ${ago(age)}.` : `Last counted ${ago(age)}; count at least monthly so the books match the shelf.`,
    });
  }

  // 6. Last month closed once reviewed. Always shown; "not set up" (never nagging) until the owner has used the lock.
  {
    const [y, m, d] = i.today.split("-").map(Number);
    const prevEnd = new Date(Date.UTC(y, m - 1, 0)); // last day of the previous month
    const prevEndIso = prevEnd.toISOString().slice(0, 10);
    const label = `${MONTHS[prevEnd.getUTCMonth()]}`;
    const closed = i.booksClosedThrough && ISO.test(i.booksClosedThrough) ? i.booksClosedThrough : null;
    if (closed === null) {
      out.push({ id: "close_month", title: "Close the month", cadence: "Monthly", status: "not_set_up", href: "/settings", detail: "Not set up yet. After you review a month, close it in Settings so nobody can change its figures." });
    } else if (closed >= prevEndIso) {
      out.push({ id: "close_month", title: "Close the month", cadence: "Monthly", status: "ok", href: "/settings", detail: `Books are closed through ${closed}.` });
    } else if (d > CLOSE_MONTH_AFTER_DAY) {
      out.push({ id: "close_month", title: "Close the month", cadence: "Monthly", status: "attention", href: "/settings", detail: `${label} is still open (books are closed through ${closed}). Review it and close it.` });
    } else {
      out.push({ id: "close_month", title: "Close the month", cadence: "Monthly", status: "ok", href: "/settings", detail: `Books are closed through ${closed}. ${label} can be closed once you have reviewed it.` });
    }
  }
  return out;
}

export function routinesSummary(checks: RoutineCheck[]): { attention: number; ok: number; notSetUp: number } {
  return {
    attention: checks.filter((c) => c.status === "attention").length,
    ok: checks.filter((c) => c.status === "ok").length,
    notSetUp: checks.filter((c) => c.status === "not_set_up").length,
  };
}
