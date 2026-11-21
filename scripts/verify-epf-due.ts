// EPF/ETF due date, holiday calendar, surcharges and ETF late-return penalty (pass 303, lib/epf-due.ts, lib/lk-holidays.ts).
import { epfDueDate, epfDueInfo, daysUntilDue, lastWorkingDay, lateSurchargeRate, lateSurchargeAmount, lateReturnPenalty } from "../lib/epf-due";
import { holidaysKnownFor } from "../lib/lk-holidays";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} - ${what}`); };
const isWeekday = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };

// Due dates
ok(epfDueDate("2026-10") === "2026-11-30", `October pay is due 30 November 2026 (got ${epfDueDate("2026-10")})`);
ok(epfDueDate("2026-05") === "2026-06-30", `May pay: 29 June is Poya, 30 June is a weekday, so 30 June (got ${epfDueDate("2026-05")})`);
ok(lastWorkingDay(2026, 6, new Set(["2026-06-29", "2026-06-30"])) === "2026-06-26", "if 29 and 30 June are holidays, the due date is Friday 26 June");
ok(lastWorkingDay(2026, 6) === "2026-06-30", "the real calendar gives 30 June (29 June is Poya, the last day is not)");
ok(epfDueDate("2026-11") === "2026-12-31", `November pay is due 31 December 2026 (got ${epfDueDate("2026-11")})`);
ok(epfDueDate("2026-02").startsWith("2026-03-") && isWeekday(epfDueDate("2026-02")), "February pay is due on a weekday in March");
ok(epfDueDate("2026-12").startsWith("2027-01-"), "December pay is due in January 2027");
ok(epfDueInfo("2026-12").holidaysChecked === false, "a 2027 due date reports that no holiday calendar was loaded");
ok(epfDueInfo("2026-10").holidaysChecked === true && holidaysKnownFor(2026), "a 2026 due date reports its holidays were checked");
ok(daysUntilDue("2026-11-30", "2026-11-17") === 13, "13 days from 17 to 30 November");
ok(daysUntilDue("2026-11-30", "2026-12-02") === -2, "negative once past");

// Surcharge bands
ok(lateSurchargeRate(0) === 0 && lateSurchargeRate(-3) === 0, "on time or early: no surcharge");
ok(lateSurchargeRate(1) === 0.05 && lateSurchargeRate(10) === 0.05, "1 to 10 days late: 5%");
ok(lateSurchargeRate(11) === 0.15 && lateSurchargeRate(30) === 0.15, "11 days to a month: 15%");
ok(lateSurchargeRate(31) === 0.2 && lateSurchargeRate(90) === 0.2, "a month to 3 months: 20%");
ok(lateSurchargeRate(91) === 0.3 && lateSurchargeRate(180) === 0.3, "3 to 6 months: 30%");
ok(lateSurchargeRate(181) === 0.4 && lateSurchargeRate(365) === 0.4, "6 to 12 months: 40%");
ok(lateSurchargeRate(366) === 0.5, "over 12 months: 50%");
ok(lateSurchargeAmount(1000, 5) === 50 && lateSurchargeAmount(1234.56, 40) === 246.91, "surcharge amount in money, to 2 decimals");

// ETF late return: 1% per completed month or part
ok(lateReturnPenalty(1000, 0) === 0, "an on-time return has no penalty");
ok(lateReturnPenalty(1000, 1) === 10 && lateReturnPenalty(1000, 31) === 20, "1% for each month or part of a month late");

console.log(failed ? `${failed} failed` : "EPF/ETF due date and surcharges: all checks passed");
process.exit(failed ? 1 : 0);
