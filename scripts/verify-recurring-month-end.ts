// Verifies the recurring-schedule date maths (lib/recurringTransactions.ts) and the
// two other month-arithmetic fixes made in the final pass:
//   1. A monthly schedule that starts on the 29th/30th/31st must NOT skip a month
//      (31 Jan + 1 month used to be 3 Mar) and must return to its own day after a short month.
//   2. The answer must not depend on the machine's time zone (run under three).
//   3. A schedule advances from its own due date, not from the day the app happened to be opened.
//   4. The forecast's month labels step one calendar month at a time even from the 31st.
//
// Run: npx tsx scripts/verify-recurring-month-end.ts
// (it re-runs itself under Asia/Colombo, UTC and America/New_York)

import { execFileSync } from "node:child_process";
import { calculateNextDueDate, dayOfMonthOf } from "../lib/recurringTransactions";
import { catchUpNextDueDate } from "../lib/recurringInvoices";
import { catchUpNextDueDate as catchUpExpense } from "../lib/recurringExpenses";
import { generateCashFlowForecast } from "../lib/aiCashFlowPrediction";
import type { Settings } from "../lib/types";

const ZONES = ["Asia/Colombo", "UTC", "America/New_York"];
if (!process.env.BALANCR_TZ_CHILD) {
  let failed = false;
  for (const tz of ZONES) {
    try {
      const out = execFileSync(process.execPath, [...process.execArgv, process.argv[1]], {
        env: { ...process.env, TZ: tz, BALANCR_TZ_CHILD: "1" },
        encoding: "utf8",
      });
      process.stdout.write(out);
    } catch (e: any) {
      failed = true;
      process.stdout.write(String(e.stdout ?? "") + String(e.stderr ?? ""));
    }
  }
  process.exit(failed ? 1 : 0);
}

let fails = 0;
let checks = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  checks++;
  if (actual !== expected) {
    fails++;
    console.error(`FAIL [${process.env.TZ}]: ${msg} (got ${String(actual)}, expected ${String(expected)})`);
  }
}

// --- 1. month-end clamping, no anchor ------------------------------------
eq(calculateNextDueDate("monthly", "2026-01-31"), "2026-02-28", "31 Jan -> 28 Feb, not 3 Mar");
eq(calculateNextDueDate("monthly", "2028-01-31"), "2028-02-29", "31 Jan -> 29 Feb in a leap year");
eq(calculateNextDueDate("monthly", "2026-01-30"), "2026-02-28", "30 Jan -> 28 Feb");
eq(calculateNextDueDate("monthly", "2026-03-31"), "2026-04-30", "31 Mar -> 30 Apr, not 1 May");
eq(calculateNextDueDate("monthly", "2026-08-31"), "2026-09-30", "31 Aug -> 30 Sep, not 1 Oct");
eq(calculateNextDueDate("monthly", "2026-12-31"), "2027-01-31", "31 Dec -> 31 Jan next year");
eq(calculateNextDueDate("monthly", "2026-12-15"), "2027-01-15", "December rolls the year");
eq(calculateNextDueDate("monthly", "2026-10-15"), "2026-11-15", "an ordinary day is unchanged");
eq(calculateNextDueDate("monthly", "2026-08-01"), "2026-09-01", "the 1st is unchanged");
eq(calculateNextDueDate("weekly", "2026-10-26"), "2026-11-02", "weekly +7 across a month end");
eq(calculateNextDueDate("weekly", "2026-12-28"), "2027-01-04", "weekly +7 across a year end");
eq(calculateNextDueDate("yearly", "2028-02-29"), "2029-02-28", "29 Feb yearly -> 28 Feb, not 1 Mar");
eq(calculateNextDueDate("yearly", "2026-06-10"), "2027-06-10", "yearly ordinary");
eq(calculateNextDueDate("none", "2026-06-10"), "2026-06-10", "'none' returns the date unchanged");
eq(calculateNextDueDate("monthly", "not-a-date"), "not-a-date", "an invalid date is returned unchanged, never throws");

// --- 2. anchor day: a 31st schedule keeps its day ------------------------
{
  let cur = "2026-01-31";
  const seen: string[] = [cur];
  for (let i = 0; i < 12; i++) {
    cur = calculateNextDueDate("monthly", cur, 31);
    seen.push(cur);
  }
  eq(
    seen.join(","),
    "2026-01-31,2026-02-28,2026-03-31,2026-04-30,2026-05-31,2026-06-30,2026-07-31,2026-08-31,2026-09-30,2026-10-31,2026-11-30,2026-12-31,2027-01-31",
    "a schedule anchored on the 31st never skips a month and never drifts"
  );
  // Without the anchor it clamps and stays low, but still never skips.
  let drift = "2026-01-31";
  const months = new Set<string>();
  for (let i = 0; i < 12; i++) {
    drift = calculateNextDueDate("monthly", drift);
    months.add(drift.slice(0, 7));
  }
  eq(months.size, 12, "even with no anchor, twelve steps land in twelve different months");
  eq(calculateNextDueDate("yearly", "2029-02-28", 29), "2030-02-28", "yearly 29 Feb anchor, non-leap year");
  eq(calculateNextDueDate("yearly", "2027-02-28", 29), "2028-02-29", "yearly 29 Feb anchor returns on the leap day");
  eq(dayOfMonthOf("2026-10-31"), 31, "dayOfMonthOf reads the day");
  eq(dayOfMonthOf(undefined), undefined, "dayOfMonthOf(undefined)");
  eq(dayOfMonthOf("junk"), undefined, "dayOfMonthOf(junk)");
}

// --- 3. catch-up steps from the schedule's own due date -----------------
{
  // Billed on the 1st; the owner only opens the app on the 4th. The next date must
  // be the 1st of next month, not the 4th.
  eq(catchUpNextDueDate("monthly", "2026-10-01", "2026-10-04", 1), "2026-11-01", "invoice on the 1st stays on the 1st when generated on the 4th");
  eq(catchUpExpense("monthly", "2026-10-01", "2026-10-04", 1), "2026-11-01", "same for expense templates");
  // Away for months: lands on the first date still in the future, on the 1st.
  eq(catchUpNextDueDate("monthly", "2026-01-01", "2026-09-25", 1), "2026-10-01", "long gap resolves to the next 1st");
  // A month-end retainer generated late: 31 Jan schedule, opened on 3 Mar.
  eq(catchUpNextDueDate("monthly", "2026-02-28", "2026-03-03", 31), "2026-03-31", "month-end retainer lands on 31 Mar after a short February");
  // Billed early: due 25 Nov, billed 10 Oct -> the November cycle is used up.
  eq(catchUpNextDueDate("monthly", "2026-11-25", "2026-10-10", 25), "2026-12-25", "billing early consumes that cycle");
  // The result is always strictly after today.
  for (const asOf of ["2026-02-28", "2026-03-01", "2026-03-31", "2026-04-30", "2026-12-31"]) {
    const next = catchUpNextDueDate("monthly", "2026-01-31", asOf, 31);
    eq(next > asOf, true, `catch-up lands after ${asOf} (got ${next})`);
  }
}

// --- 4. forecast month labels ------------------------------------------
{
  const settings = { rentAmount: 0 } as Settings;
  const fc = generateCashFlowForecast([], [], [], settings, 4, true);
  const labels = fc.predictions.map((p) => p.date.slice(0, 7));
  eq(new Set(labels).size, 4, "four forecast months are four different calendar months");
  const now = new Date();
  const expectFirst = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 7); // next calendar month
  eq(labels[0], expectFirst, "the first forecast month is the next calendar month");
}

if (fails) {
  console.error(`${fails} of ${checks} checks FAILED under ${process.env.TZ}`);
  process.exit(1);
}
console.log(`OK under ${process.env.TZ}: ${checks} checks`);
