// Payslips (lib/payslip.ts) and leave (lib/leave.ts): hand-worked cases, then the wiring that must know about the new
// leave collection.
// Run: npx tsx scripts/verify-payslip-and-leave.ts
import fs from "node:fs";
import {
  buildPayslipHtml, computePayslip, emptyPayslipInput, payslipExtras, payslipExtrasExpenseName, periodDays,
  validatePayslipInput, type PayslipInput,
} from "../lib/payslip";
import {
  cleanLeaveInput, isPaidLeave, leaveBalance, leaveOverview, leaveSpanDays, unpaidDaysInMonth, validateLeaveInput,
  type LeaveInput,
} from "../lib/leave";
import { isMutationName } from "../lib/readOnlyGuard";
import type { Employee, LeaveRecord, Settings } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const emp = (o: Partial<Employee> = {}): Employee => ({
  id: "e1", name: "Kasun", role: "Mechanic", payRate: 60000, payFrequency: "monthly", taxPct: 0, epfEtfApplicable: true,
  startDate: "2026-01-01", active: true, createdAt: 0, ...o,
});
const inp = (o: Partial<PayslipInput> = {}): PayslipInput => ({ ...emptyPayslipInput("2026-10"), ...o });

// ---- the plain month: basic only, EPF on -------------------------------------------------------------------------------
// 60,000 basic. Employee EPF 8% = 4,800. Employer EPF 12% = 7,200, ETF 3% = 1,800. Net = 55,200.
const a = computePayslip(emp(), inp());
ok(a.gross === 60000 && a.employeeEpf === 4800 && a.net === 55200 && a.employerEpf === 7200 && a.employerEtf === 1800, "plain month: gross 60,000, EPF 4,800, net 55,200, employer 7,200 + 1,800");
ok(near(a.net, 60000 * (1 - 0) - 60000 * 0.08), "agrees with the Employees page take-home rule when there are no extras");

// ---- everything at once ------------------------------------------------------------------------------------------------
// Overtime 10 h: hourly = 60,000 / 240 = 250; 10 x 250 x 1.5 = 3,750. Commission 2,000, allowances 1,000.
// Gross = 60,000 + 3,750 + 2,000 + 1,000 = 66,750. EPF base (no overtime) = 63,000 -> 8% = 5,040; employer 7,560 + 1,890.
// Tax 5% of gross = 3,337.50. Other 500. Deductions = 5,040 + 3,337.50 + 500 = 8,877.50. Net = 57,872.50.
const b = computePayslip(emp({ taxPct: 5 }), inp({ overtimeHours: 10, commission: 2000, allowances: 1000, otherDeductions: 500 }));
ok(b.hourlyRate === 250 && b.overtimePay === 3750, "hourly 250, overtime 10 h at 1.5x = 3,750");
ok(b.gross === 66750 && b.epfBase === 63000, "gross 66,750 and the EPF base leaves overtime out (63,000)");
ok(b.employeeEpf === 5040 && b.employerEpf === 7560 && b.employerEtf === 1890, "EPF 5,040; employer 7,560 and 1,890 on the base");
ok(b.tax === 3337.5 && b.totalDeductions === 8877.5 && b.net === 57872.5, "tax 3,337.50, deductions 8,877.50, net 57,872.50");
ok(near(b.net, b.gross - b.employeeEpf - b.tax - b.otherDeductions), "net = gross - EPF - tax - other");
ok(payslipExtras(b) === 4750, "extras to book = overtime 3,750 + allowances 1,000 (commission has its own card, basic is already booked)");

// ---- no-pay days -------------------------------------------------------------------------------------------------------
// Monthly 30,000, 3 no-pay days: 30,000 / 30 = 1,000 a day -> 3,000 off. Not covered by EPF. Gross 27,000, EPF 2,160.
const c = computePayslip(emp({ payRate: 30000 }), inp({ noPayDays: 3 }));
ok(c.noPayDeduction === 3000 && c.gross === 27000 && c.epfBase === 27000 && c.employeeEpf === 2160 && c.net === 24840, "3 no-pay days off a 30,000 month: gross 27,000, EPF 2,160, net 24,840");
ok(computePayslip(emp({ payRate: 30000 }), inp({ noPayDays: 30 })).gross === 0, "a whole month of no-pay leaves nothing, never negative");
ok(computePayslip(emp({ payRate: 7000, payFrequency: "weekly" }), inp({ noPayDays: 1 })).noPayDeduction === 1000, "weekly pay: one day = a seventh (7,000 / 7)");
ok(periodDays("weekly") === 7 && periodDays("monthly") === 30 && periodDays("yearly") === 365, "period lengths");

// ---- weekly and yearly staff: the hourly rate comes from the pay worked out as a month --------------------------------
// Weekly 15,000 -> month = 15,000 x 52 / 12 = 65,000 -> hourly 270.83; 2 h at 1.5x = 812.49 (2 x 270.83 x 1.5).
const w = computePayslip(emp({ payRate: 15000, payFrequency: "weekly" }), inp({ overtimeHours: 2 }));
ok(w.hourlyRate === 270.83 && near(w.overtimePay, 812.49), "weekly 15,000: hourly 270.83, 2 h overtime 812.49");
const y = computePayslip(emp({ payRate: 720000, payFrequency: "yearly" }), inp({ overtimeHours: 1, overtimeMultiplier: 2 }));
ok(y.hourlyRate === 250 && y.overtimePay === 500, "yearly 720,000: month 60,000, hourly 250, 1 h at 2x = 500");

// ---- EPF off ----------------------------------------------------------------------------------------------------------
const d = computePayslip(emp({ epfEtfApplicable: false }), inp());
ok(d.employeeEpf === 0 && d.employerEpf === 0 && d.employerEtf === 0 && d.net === 60000, "EPF/ETF not applicable: nothing taken, nothing owed");

// ---- validation -------------------------------------------------------------------------------------------------------
const e0 = emp();
ok(validatePayslipInput(e0, inp()) === null, "a plain slip is valid");
ok(validatePayslipInput(e0, inp({ month: "2026-13" })) !== null && validatePayslipInput(e0, inp({ month: "" })) !== null, "month must be real");
ok(validatePayslipInput(e0, inp({ overtimeHours: -1 })) !== null && validatePayslipInput(e0, inp({ allowances: NaN })) !== null, "negative or NaN amounts refused");
ok(validatePayslipInput(e0, inp({ overtimeHours: 745 })) !== null && validatePayslipInput(e0, inp({ overtimeHours: 744 })) === null, "overtime cannot exceed the hours in a month");
ok(validatePayslipInput(e0, inp({ overtimeMultiplier: 0.9 })) !== null && validatePayslipInput(e0, inp({ overtimeMultiplier: 5.1 })) !== null && validatePayslipInput(e0, inp({ overtimeMultiplier: 2 })) === null, "overtime rate 1x to 5x");
ok(validatePayslipInput(e0, inp({ hoursPerMonth: 50 })) !== null && validatePayslipInput(e0, inp({ hoursPerMonth: 500 })) !== null, "hours in a month 100 to 400");
ok(validatePayslipInput(e0, inp({ noPayDays: 31 })) !== null && validatePayslipInput(e0, inp({ noPayDays: 30 })) === null, "no-pay days cannot exceed the 30 in the period");
ok(validatePayslipInput(emp({ payFrequency: "weekly" }), inp({ noPayDays: 8 })) !== null, "weekly: more than 7 no-pay days refused");

// ---- the printed slip -------------------------------------------------------------------------------------------------
const settings = { currency: "LKR", businessName: "Acme & Sons <Ltd>" } as unknown as Settings;
const html = buildPayslipHtml(computePayslip(emp({ name: "A<b>&", taxPct: 5 }), inp({ overtimeHours: 10, noPayDays: 1 })), settings, "2026-10-24");
ok(!html.includes("A<b>&") && html.includes("A&lt;b&gt;&amp;"), "a name with markup is escaped");
ok(html.includes("Net pay") && html.includes("Gross pay") && html.includes("Overtime") && html.includes("Less no-pay"), "the slip shows gross, overtime, no-pay and net");
ok(html.includes("overtime is not included"), "the employer line says overtime is outside the EPF base");
ok(!buildPayslipHtml(computePayslip(emp({ epfEtfApplicable: false }), inp()), settings, "x").includes("Paid in by the employer"), "no employer EPF line when EPF does not apply");
ok(payslipExtrasExpenseName("Kasun", "2026-10") === "Payslip extras — Kasun (2026-10)", "fixed expense name for the extras");

// ---- leave: spans and validation --------------------------------------------------------------------------------------
ok(leaveSpanDays("2026-10-05", "2026-10-09") === 5 && leaveSpanDays("2026-10-05", "2026-10-05") === 1 && leaveSpanDays("2026-10-09", "2026-10-05") === 0 && leaveSpanDays("x", "2026-10-05") === 0, "inclusive span; wrong way round or bad dates is 0");
const L = (o: Partial<LeaveInput> = {}): LeaveInput => ({ employeeId: "e1", type: "annual", from: "2026-10-05", to: "2026-10-09", days: 5, ...o });
ok(validateLeaveInput(L()) === null && validateLeaveInput(L({ days: 3.5 })) === null && validateLeaveInput(L({ days: 0.5, to: "2026-10-05" })) === null, "5 days, 3.5 days (weekend inside) and a half day are valid");
ok(validateLeaveInput(L({ days: 6 })) !== null, "more days than the dates cover is refused");
ok(validateLeaveInput(L({ days: 0 })) !== null && validateLeaveInput(L({ days: -1 })) !== null && validateLeaveInput(L({ days: 1.3 })) !== null && validateLeaveInput(L({ days: NaN })) !== null, "0, negative, 1.3 and NaN days refused");
ok(validateLeaveInput(L({ employeeId: "" })) !== null && validateLeaveInput(L({ type: "holiday" as never })) !== null, "who and kind are required");
ok(validateLeaveInput(L({ from: "2026-10-09", to: "2026-10-05" })) !== null && validateLeaveInput(L({ from: "2026-02-30" })) !== null, "dates must be real and in order");
ok(validateLeaveInput(L({ note: "x".repeat(301) })) !== null && validateLeaveInput(L({ note: "x".repeat(300) })) === null, "note limit 300");
ok(JSON.stringify(cleanLeaveInput(L({ note: "  " }))) === JSON.stringify({ employeeId: "e1", type: "annual", from: "2026-10-05", to: "2026-10-09", days: 5 }) && cleanLeaveInput(L({ note: " flu " })).note === "flu", "blank note dropped, real one trimmed, no undefined fields");
ok(isPaidLeave("annual") && isPaidLeave("sick") && !isPaidLeave("unpaid"), "paid and unpaid kinds");

// ---- leave: balance ---------------------------------------------------------------------------------------------------
const rec = (o: Partial<LeaveRecord>): LeaveRecord => ({ id: "r", employeeId: "e1", employeeName: "Kasun", type: "annual", from: "2026-03-02", to: "2026-03-04", days: 3, createdAt: 0, ...o });
const recs = [
  rec({ days: 3 }), rec({ type: "sick", from: "2026-06-10", days: 1.5 }), rec({ type: "unpaid", from: "2026-10-12", days: 2 }),
  rec({ from: "2025-12-30", days: 4 }), // last year: not counted in 2026
];
const bal = leaveBalance(14, recs, 2026);
ok(bal.usedPaid === 4.5 && bal.remaining === 9.5 && bal.unpaid === 2 && !bal.over && bal.allowance === 14, "2026: 3 + 1.5 paid used, 9.5 left, 2 no-pay; last year's spell is not counted");
ok(leaveBalance(14, recs, 2025).usedPaid === 4, "2025 sees only its own record");
ok(leaveBalance(4, recs, 2026).over && leaveBalance(4, recs, 2026).remaining === -0.5, "taking more than the allowance shows over by 0.5");
ok(leaveBalance(undefined, recs, 2026).allowance === 0 && !leaveBalance(0, recs, 2026).over && leaveBalance(NaN, recs, 2026).allowance === 0, "no allowance set: nothing to be over");
ok(!leaveBalance(4.5, recs, 2026).over && leaveBalance(4.5, recs, 2026).remaining === 0, "using the allowance exactly is not over it");
ok(unpaidDaysInMonth(recs, "e1", "2026-10") === 2 && unpaidDaysInMonth(recs, "e1", "2026-09") === 0 && unpaidDaysInMonth(recs, "other", "2026-10") === 0, "no-pay days for a payslip month, by employee");
ok(unpaidDaysInMonth([rec({ type: "annual", from: "2026-10-12" })], "e1", "2026-10") === 0, "paid leave is never offered as no-pay");

// ---- leave: overview --------------------------------------------------------------------------------------------------
const emps = [emp({ id: "e1", name: "Kasun", leaveDaysPerYear: 14 }), emp({ id: "e2", name: "Amali", leaveDaysPerYear: 14 }), emp({ id: "e3", name: "Nope" }), emp({ id: "e4", name: "Gone", active: false, leaveDaysPerYear: 14 }), emp({ id: "e5", name: "Zed", leaveDaysPerYear: 2 })];
const ov = leaveOverview(emps, [...recs, rec({ employeeId: "e5", days: 3 }), rec({ employeeId: "e4", days: 1 })], 2026);
ok(ov.map((r) => r.name).join(",") === "Zed,Amali,Gone,Kasun", "over-allowance first, then name; leaves out staff with no allowance and no leave; an inactive person shows only if they took leave");
ok(!leaveOverview([emp({ id: "e9", name: "Ghost", active: false, leaveDaysPerYear: 14 })], [], 2026).length, "an inactive person with an allowance and no leave is not listed");
ok(!ov.some((r) => r.name === "Nope"), "an employee with no allowance and no leave is not listed");

// ---- wiring: the read-only guard and the new collection ---------------------------------------------------------------
ok(isMutationName("addLeaveRecord") && isMutationName("deleteLeaveRecord"), "the accountant read-only guard recognises the leave writers");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const ownerList = /if \(role === "owner"\)\s*return \[([\s\S]*?)\];/.exec(ctx)?.[1] ?? "";
const mgrList = /if \(role === "manager" \|\| role === "accountant"\)\s*return \[([\s\S]*?)\];/.exec(ctx)?.[1] ?? "";
ok(ownerList.includes('"leaveRecords"') && !mgrList.includes('"leaveRecords"'), "leave is loaded for the owner only, like payroll");
ok(/(?:onSnapshot|trackedSnapshot)\(query\(collection\(db, "users", businessId, "leaveRecords"\)/.test(ctx) && /bump\("leaveRecords"\)/.test(ctx), "a listener bumps the ready counter");
ok(/addLeaveRecord: async[\s\S]{0,200}requirePermission\("manage:employees"\)/.test(ctx) && /deleteLeaveRecord: async[\s\S]{0,200}requirePermission\("manage:employees"\)/.test(ctx), "leave writes need the payroll permission");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(/match \/leaveRecords\/\{docId\}\s*\{\s*allow read, write: if isOwner\(businessId\);/.test(rules), "rules: leave is owner only, same as employees");
ok(fs.readFileSync("lib/backupPayload.ts", "utf8").includes("leaveRecords: data.leaveRecords"), "in the full backup");
ok(fs.readFileSync("scripts/restore-from-backup.mjs", "utf8").includes('"leaveRecords"'), "restorable");
ok(fs.readFileSync("lib/backup.ts", "utf8").includes("leave.csv"), "leave.csv in the backup zip");
const lock = fs.readFileSync("scripts/verify-period-lock.ts", "utf8");
ok(lock.includes('"addLeaveRecord"') && lock.includes('"deleteLeaveRecord"'), "leave writers are listed as deliberately outside the period lock");
const emps2 = fs.readFileSync("app/employees/page.tsx", "utf8");
ok(emps2.includes("PayslipCard") && emps2.includes("LeaveCard") && emps2.includes("leaveDaysPerYear"), "the Employees page shows both and the allowance field");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
