// Time and energy value (lib/timeValue.ts): hours from clock entries, labour cost, profit per hour, and recurring share of revenue.
import { entryHours, monthOfEntry, timeValueFor } from "../lib/timeValue";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h, 0, 0).getTime();

ok(entryHours({ clockIn: at(2026, 11, 2, 9), clockOut: at(2026, 11, 2, 17) }) === 8, "an entry's hours are clock-out minus clock-in");
ok(entryHours({ clockIn: at(2026, 11, 2, 9) }) === 0, "a running entry counts nothing until it is closed");
ok(entryHours({ clockIn: at(2026, 11, 2, 9), clockOut: at(2026, 11, 9, 9) }) === 24, "an entry longer than a day is capped at 24 hours");
ok(monthOfEntry(at(2026, 11, 30, 23)) === "2026-11" && monthOfEntry(at(2026, 12, 1, 0)) === "2026-12", "an entry belongs to the month it was worked in");

const entries = [
  { memberName: "Ann", clockIn: at(2026, 11, 2, 9), clockOut: at(2026, 11, 2, 17), hourlyRate: 500, billable: true },
  { memberName: "Ben", clockIn: at(2026, 11, 3, 9), clockOut: at(2026, 11, 3, 13), hourlyRate: 400, billable: false },
  { memberName: "Ann", clockIn: at(2026, 10, 30, 9), clockOut: at(2026, 10, 30, 17), hourlyRate: 500, billable: true },
  { memberName: "Ann", clockIn: at(2026, 11, 4, 9), hourlyRate: 500, billable: true },
];
const v = timeValueFor({ entries, month: "2026-11", totalRevenue: 100000, recurringRevenue: 25000, netProfitAfterTax: 12000 });
ok(v.hours === 12 && v.billableHours === 8, "only closed entries in the month count, and billable hours are split out");
ok(v.labourCost === 8 * 500 + 4 * 400, "labour cost is each entry's hours times the rate it was clocked in at");
ok(v.byPerson[0].name === "Ann" && v.byPerson[0].hours === 8 && v.byPerson[1].hours === 4, "hours are listed per person, most first");
ok(v.profitPerHour === 1000, "profit per hour is profit after tax divided by hours worked");
ok(v.recurringSharePct === 25, "recurring share is recurring revenue as a percentage of total revenue");

const none = timeValueFor({ entries: [], month: "2026-11", totalRevenue: 0, recurringRevenue: 0, netProfitAfterTax: 500 });
ok(none.profitPerHour === null && none.recurringSharePct === null && none.hours === 0, "with no hours or no revenue, the ratios are not shown as zero");

console.log(`verify-time-value: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
