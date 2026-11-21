// Routines (lib/routines.ts): each check is decided from the records. Hand-worked dates.
// Run: npx tsx scripts/verify-routines.ts
import fs from "node:fs";
import { computeRoutines, routinesSummary, type RoutineInputs } from "../lib/routines";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const TODAY = "2026-10-20";
const base: RoutineInputs = { today: TODAY, cashSalesLast30: 0, cashCountDates: [], overdueCustomerKeys: [], contactDatesByCustomer: {}, outstandingPayables: [], bankLines: [], stockItemsOnHand: 0, stockCountDates: [] };
const get = (i: Partial<RoutineInputs>, id: string) => computeRoutines({ ...base, ...i }).find((c) => c.id === id);

// A business that uses none of it sees only the (not set up) month close.
const empty = computeRoutines(base);
ok(empty.length === 1 && empty[0].id === "close_month" && empty[0].status === "not_set_up", "nothing to check: only the not-set-up month close appears, and it never counts as a problem");
ok(routinesSummary(empty).attention === 0, "an unused routine is not an attention item");

// 1. Cash: shown only with cash sales or counts; ok within 7 days, not at 8.
ok(get({}, "cash_count") === undefined, "no cash sales, no counts: no cash routine");
ok(get({ cashSalesLast30: 3 }, "cash_count")!.status === "attention" && /No cash count has been recorded/.test(get({ cashSalesLast30: 3 }, "cash_count")!.detail), "cash sales but never counted: attention");
ok(get({ cashCountDates: ["2026-10-13"] }, "cash_count")!.status === "ok", "counted 7 days ago: on track");
ok(get({ cashCountDates: ["2026-10-12"] }, "cash_count")!.status === "attention", "counted 8 days ago: attention");
ok(/today/.test(get({ cashCountDates: ["2026-10-20"] }, "cash_count")!.detail) && /yesterday/.test(get({ cashCountDates: ["2026-10-19"] }, "cash_count")!.detail), "the detail says today / yesterday");
ok(get({ cashCountDates: ["2026-10-01", "2026-10-18"] }, "cash_count")!.status === "ok", "the latest count is what counts");
ok(get({ cashCountDates: ["2026-12-01"] }, "cash_count")!.status === "attention", "a count dated in the future is ignored");

// 2. Chasing: only with overdue customers; each must have a diary entry within 7 days.
ok(get({}, "chase_customers") === undefined, "nobody overdue: no chase routine");
const two = { overdueCustomerKeys: ["ada", "bo", "ada"], contactDatesByCustomer: { ada: "2026-10-18" } };
ok(get(two, "chase_customers")!.status === "attention" && /1 overdue customer has not/.test(get(two, "chase_customers")!.detail), "Ada contacted, Bo not: 1 customer silent (a repeated name counts once)");
ok(get({ ...two, contactDatesByCustomer: { ada: "2026-10-18", bo: "2026-10-13" } }, "chase_customers")!.status === "ok", "both contacted, Bo exactly 7 days ago: on track");
ok(get({ ...two, contactDatesByCustomer: { ada: "2026-10-18", bo: "2026-10-12" } }, "chase_customers")!.status === "attention", "Bo contacted 8 days ago: attention");
ok(get({ overdueCustomerKeys: ["", ""] }, "chase_customers") === undefined, "blank names are ignored");

// 3. Bills: only when something is owed; ok unless any is past due.
ok(get({}, "pay_bills") === undefined, "nothing owed: no bills routine");
ok(get({ outstandingPayables: [{ daysOverdue: -5 }, { daysOverdue: 0 }] }, "pay_bills")!.status === "ok", "owed but not past due (0 days is due today, not late): on track");
ok(get({ outstandingPayables: [{ daysOverdue: 1 }, { daysOverdue: -3 }] }, "pay_bills")!.status === "attention" && /1 bill is past due/.test(get({ outstandingPayables: [{ daysOverdue: 1 }] }, "pay_bills")!.detail), "one day late: attention");

// 4. Bank: only with bank lines; an unmatched line older than 7 days is a problem; matched or ignored ones are not.
ok(get({}, "bank_reconciliation") === undefined, "no bank lines: no reconciliation routine");
ok(get({ bankLines: [{ date: "2026-10-13", status: "unmatched" }] }, "bank_reconciliation")!.status === "ok", "unmatched for exactly 7 days: on track");
ok(get({ bankLines: [{ date: "2026-10-12", status: "unmatched" }] }, "bank_reconciliation")!.status === "attention", "unmatched for 8 days: attention");
ok(get({ bankLines: [{ date: "2026-08-01", status: "matched" }, { date: "2026-08-01", status: "ignored" }] }, "bank_reconciliation")!.status === "ok", "old lines that are matched or ignored are fine");

// 5. Stock: only with stock on hand; counted within 35 days.
ok(get({}, "stock_count") === undefined, "no stock: no stock routine");
ok(get({ stockItemsOnHand: 4 }, "stock_count")!.status === "attention", "stock on hand, never counted: attention");
ok(get({ stockItemsOnHand: 4, stockCountDates: ["2026-09-15"] }, "stock_count")!.status === "ok", "counted 35 days ago: on track");
ok(get({ stockItemsOnHand: 4, stockCountDates: ["2026-09-14"] }, "stock_count")!.status === "attention", "counted 36 days ago: attention");

// 6. Month close: not set up until used; then last month must be closed by the 8th.
ok(get({}, "close_month")!.status === "not_set_up", "never closed: not set up, not a problem");
ok(get({ booksClosedThrough: "2026-09-30" }, "close_month")!.status === "ok" && /closed through 2026-09-30/.test(get({ booksClosedThrough: "2026-09-30" }, "close_month")!.detail), "September closed on Oct 20: on track");
ok(get({ booksClosedThrough: "2026-08-31" }, "close_month")!.status === "attention" && /September is still open/.test(get({ booksClosedThrough: "2026-08-31" }, "close_month")!.detail), "only August closed on Oct 20: September is still open, attention");
ok(get({ today: "2026-10-07", booksClosedThrough: "2026-08-31" }, "close_month")!.status === "ok", "on Oct 7 there is still time to close September");
ok(get({ today: "2026-10-08", booksClosedThrough: "2026-08-31" }, "close_month")!.status === "attention", "from Oct 8 an open September needs attention");
ok(/December/.test(get({ today: "2027-01-20", booksClosedThrough: "2026-11-30" }, "close_month")!.detail), "across the new year the previous month is December");
ok(get({ booksClosedThrough: "junk" }, "close_month")!.status === "not_set_up", "a malformed lock date is treated as not set up");

// Summary and bad input.
const mix = computeRoutines({ ...base, cashSalesLast30: 1, cashCountDates: ["2026-10-19"], outstandingPayables: [{ daysOverdue: 2 }], booksClosedThrough: "2026-09-30" });
const s = routinesSummary(mix);
ok(s.ok === 2 && s.attention === 1 && s.notSetUp === 0, "cash ok, bills late, month closed: 2 on track, 1 needs attention");
ok(computeRoutines({ ...base, today: "junk" }).length === 0, "a bad date gives nothing");

// Wiring: the page, the navigation, the guard and the shared hook exist; every check links to a real page.
const page = fs.readFileSync("app/routines/page.tsx", "utf8");
ok(/useRoutineChecks\(\)/.test(page) && /useRequireRole\(\["owner", "manager"\]\)/.test(page), "the Routines page uses the shared checks and is limited to Owner and Manager (others cannot see the data the checks read)");
ok(!/export (function|const) /.test(page.replace(/export default function/g, "")), "the page file exports only the page (Next.js rejects other exports)");
const hook = fs.readFileSync("lib/useRoutineChecks.ts", "utf8");
ok(/computeRoutines\(/.test(hook) && /n\.subjectKind !== "customer"/.test(hook) && /\.trim\(\)\.toLowerCase\(\)/.test(hook), "the hook feeds the checks from live data, using the diary's customer key (trimmed, lower-cased)");
ok(/l\.daysOverdue > 0 && l\.amountOutstanding > 0/.test(hook) && /l\.amountOutstanding > 0\)\.map/.test(hook), "only open amounts count as overdue or owed");
ok(/reason === "count_correction"/.test(hook) && /s\.paymentMethod === "cash"/.test(hook), "stock counts are count-correction adjustments; cash sales are cash-method sales");
const shell = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(/href: "\/routines", label: "Routines", icon: ChecklistIcon, roles: \["owner", "manager"\]/.test(shell), "Routines is in the navigation for Owner and Manager only");
const dash = fs.readFileSync("app/dashboard/page.tsx", "utf8");
ok(/routineAttention > 0 && \(role === "owner" \|\| role === "manager"\)/.test(dash), "the Dashboard hint appears only when something needs attention, and only to Owner and Manager");
for (const id of ["cash-count", "collections", "receivables-payables", "reconciliation", "products", "settings"]) ok(fs.existsSync(`app/${id}/page.tsx`), `the page ${id} that a check links to exists`);

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
