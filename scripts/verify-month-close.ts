// Month-end close checklist (lib/monthClose.ts): each step's status from the records, the lock date, ready-to-close, the lock offered only
// when every step is done, and the wiring to the closed-period rules and the Operations tab. Run: npx tsx scripts/verify-month-close.ts
import fs from "node:fs";
import { buildCloseChecklist, periodEnd } from "../lib/monthClose";
import { validateBooksClosedThrough } from "../lib/periodLock";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(periodEnd("2026-11") === "2026-11-30" && periodEnd("2028-02") === "2028-02-29" && periodEnd("2027-02") === "2027-02-28", "the lock date is the real last day of the month, including a leap February");

const good = {
  period: "2026-10",
  bankLines: [{ date: "2026-10-05", status: "matched" }, { date: "2026-10-20", status: "matched" }],
  cashCountDates: ["2026-10-31"],
  stockCountDates: ["2026-10-15"],
  hasStock: true,
  overdueReceivables: 0,
  overduePayables: 0,
  expenseDates: ["2026-10-02"],
  saleDates: ["2026-10-03"],
  accrualsForPeriod: 0,
  accrualsReviewed: true,
};
const ready = buildCloseChecklist(good);
ok(ready.readyToClose && ready.steps.every((s) => s.status === "done") && ready.lockThrough === "2026-10-31", "a month with every step done is ready to close, and locks through its last day");
ok(!ready.alreadyLocked, "a month not yet locked is shown as open");

const open = buildCloseChecklist({ ...good, bankLines: [{ date: "2026-10-05", status: "unmatched" }, { date: "2026-10-06", status: "unmatched" }] });
const bank = open.steps.find((s) => s.key === "bank")!;
ok(!open.readyToClose && bank.status === "attention" && bank.detail.includes("2 bank lines"), "unmatched bank lines hold the month open and say how many");
ok(buildCloseChecklist({ ...good, cashCountDates: [] }).steps.find((s) => s.key === "cash")!.status === "attention", "no cash count this month is a step to do");
ok(buildCloseChecklist({ ...good, stockCountDates: [], hasStock: false }).steps.find((s) => s.key === "stock")!.status === "done", "no stock on hand means the stock count is not needed");
ok(buildCloseChecklist({ ...good, stockCountDates: [], hasStock: true }).steps.find((s) => s.key === "stock")!.status === "attention", "stock on hand without a count this month is a step to do");
ok(buildCloseChecklist({ ...good, overdueReceivables: 3 }).steps.find((s) => s.key === "receivables")!.detail.includes("60 days"), "overdue customers are checked against the 60 day rule");
ok(buildCloseChecklist({ ...good, overduePayables: 1 }).readyToClose === false, "an overdue bill holds the month open");
ok(buildCloseChecklist({ ...good, expenseDates: ["2026-09-30"] }).steps.find((s) => s.key === "expenses")!.status === "attention", "expenses from another month do not count for this one");
ok(buildCloseChecklist({ ...good, saleDates: [] }).steps.find((s) => s.key === "sales")!.status === "attention", "no sales recorded this month is a step to do");
ok(buildCloseChecklist({ ...good, accrualsForPeriod: 0, accrualsReviewed: false }).steps.find((s) => s.key === "accruals")!.status === "attention" && buildCloseChecklist({ ...good, accrualsForPeriod: 0, accrualsReviewed: false }).readyToClose === false, "a month with no accruals and no confirmation is a step to do");
ok(buildCloseChecklist({ ...good, accrualsForPeriod: 2, accrualsReviewed: false }).steps.find((s) => s.key === "accruals")!.status === "done", "recorded accruals complete the step");

const locked = buildCloseChecklist({ ...good, closedThrough: "2026-10-31" });
ok(locked.alreadyLocked && locked.readyToClose, "a month already locked through its end is shown as locked");
ok(buildCloseChecklist({ ...good, closedThrough: "2026-09-30" }).alreadyLocked === false, "a lock on an earlier month does not lock this one");

ok(validateBooksClosedThrough("2026-10-31", "2026-11-03") === null, "the lock date passes the closed-period rules");
ok(validateBooksClosedThrough("2026-10-15", "2026-11-03") !== null, "a mid-month lock date is refused by the closed-period rules");

ok(tabsForRole("owner").includes("close") && tabsForRole("manager").includes("close") && !tabsForRole("staff").includes("close"), "the month-end close is for the owner and manager");
const panel = read("components/ops/MonthClosePanel.tsx");
ok(panel.includes("validateBooksClosedThrough(checklist.lockThrough, today)") && panel.includes("updateSettings({ booksClosedThrough: checklist.lockThrough })"), "locking uses the same closed-period rules and sets the same setting");
ok(panel.includes("readyToClose ?") && panel.includes("Locking the books is only offered when every step is done"), "the lock is only offered when every step is done");
ok(panel.includes("confirm(`Lock the books through"), "locking asks the owner to confirm first");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
