// Late payment charge (lib/lateFees.ts) and the reminder wording that mentions it. Hand-worked numbers.
// Run: npx tsx scripts/verify-late-fees.ts
import { computeLateCharge, lateChargeFor, lateFeeTerms, MAX_LATE_FEE_MONTHLY_PCT } from "../lib/lateFees";
import { buildReceivableReminderText } from "../lib/print";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

// --- Terms: off unless a sensible positive rate is set.
ok(lateFeeTerms({}) === null && lateFeeTerms({ lateFeeMonthlyPct: 0 }) === null && lateFeeTerms({ lateFeeMonthlyPct: -1 }) === null, "no rate, zero or negative => off");
ok(lateFeeTerms({ lateFeeMonthlyPct: NaN }) === null && lateFeeTerms({ lateFeeMonthlyPct: Infinity }) === null, "NaN or infinite => off");
ok(lateFeeTerms({ lateFeeMonthlyPct: MAX_LATE_FEE_MONTHLY_PCT + 0.01 }) === null && lateFeeTerms({ lateFeeMonthlyPct: MAX_LATE_FEE_MONTHLY_PCT }) !== null, "above 10% a month is treated as a typing slip and ignored; 10% itself is allowed");
const t = lateFeeTerms({ lateFeeMonthlyPct: 2, lateFeeGraceDays: 7.9 })!;
ok(t.monthlyPct === 2 && t.graceDays === 7, "grace days are whole days (rounded down)");
ok(lateFeeTerms({ lateFeeMonthlyPct: 2, lateFeeGraceDays: -3 })!.graceDays === 0 && lateFeeTerms({ lateFeeMonthlyPct: 2 })!.graceDays === 0, "negative or missing grace => 0");

// --- Charge: 100,000 outstanding, 2% a month, 7 days grace.
const terms = { monthlyPct: 2, graceDays: 7 };
ok(near(computeLateCharge(100000, 37, terms), 100000 * 0.02 * 30 / 30), "37 days overdue, 7 grace => 30 chargeable days = 1 month = 2,000");
ok(near(computeLateCharge(100000, 22, terms), 100000 * 0.02 * 15 / 30), "22 days overdue => 15 chargeable days = half a month = 1,000");
ok(computeLateCharge(100000, 7, terms) === 0, "still inside the grace period (exactly 7 days) => nothing yet");
ok(near(computeLateCharge(100000, 8, terms), (100000 * 0.02) / 30), "one day past grace => one day's worth");
ok(computeLateCharge(100000, -5, terms) === 0 && computeLateCharge(100000, 0, terms) === 0, "not yet due => nothing");
ok(computeLateCharge(100000, 60, null) === 0, "feature off => nothing");
ok(computeLateCharge(0, 60, terms) === 0 && computeLateCharge(-50, 60, terms) === 0 && computeLateCharge(NaN, 60, terms) === 0, "nothing owed (or nonsense) => nothing");
ok(computeLateCharge(100000, NaN, terms) === 0, "nonsense days => nothing");
ok(near(computeLateCharge(100000, 360 + 7, terms), 100000 * 0.02 * 12), "a year past grace is 12 months of simple interest (24,000): simple, not compounding");

// --- On a receivable line.
ok(near(lateChargeFor({ amountOutstanding: 50000, daysOverdue: 67 }, { lateFeeMonthlyPct: 1.5, lateFeeGraceDays: 7 }), 50000 * 0.015 * 60 / 30), "line: 50,000 at 1.5%, 60 chargeable days = 1,500");
ok(lateChargeFor({ amountOutstanding: 50000, daysOverdue: 67 }, {}) === 0, "line with the feature off => 0");

// --- Reminder wording: unchanged when there is no charge; mentions it when there is.
const base = { businessName: "Acme", customer: "Nimal", itemName: "Cement", amountOutstanding: 20000, dueDate: "2026-09-01", daysOverdue: 30, currency: "LKR" };
const plain = buildReceivableReminderText(base);
ok(!/late charge/i.test(plain), "no late charge given => the reminder is exactly as it was (no mention)");
ok(buildReceivableReminderText({ ...base, lateCharge: 0 }) === plain && buildReceivableReminderText({ ...base, lateCharge: 0.004 }) === plain, "a zero or sub-cent charge is not mentioned");
const withFee = buildReceivableReminderText({ ...base, lateCharge: 800 });
ok(/late charge of .*800.* has built up under our terms/.test(withFee), "a real charge is mentioned with its amount");
ok(withFee.startsWith("Hi Nimal, this is a friendly reminder from Acme:") && withFee.endsWith("thank you!"), "wording otherwise unchanged");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
