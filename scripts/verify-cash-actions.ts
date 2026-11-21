// Empirical check for computeCashActions (lib/calculations.ts).
// Run: npx tsx scripts/verify-cash-actions.ts
import { computeCashActions } from "../lib/calculations";

let failed = 0;
function assert(c: boolean, m: string) { if (!c) { failed++; console.error("FAIL:", m); } else console.log("OK:", m); }
const rl = (customer: string, out: number, days: number) => ({ customer, amountOutstanding: out, daysOverdue: days } as any);
const pl = (out: number, days: number) => ({ amountOutstanding: out, daysOverdue: days } as any);
const R = (lines: any[]) => ({ asOf: "2026-09-29", totalOutstanding: 0, byBucket: {}, lines } as any);

const empty = computeCashActions(R([]), R([]), R([]));
assert(empty.overdueIn.count === 0 && empty.overdueIn.total === 0 && empty.dueOut.count === 0, "empty books => nothing to do");

const a = computeCashActions(
  R([rl("Ann", 500, 10), rl("Ann", 250, 40), rl("Bob", 900, 3), rl("Cy", 100, -5), rl("Di", 0, 30), rl("Ed", 50, 0)]),
  R([pl(300, 2), pl(200, -7), pl(400, -8)]),
  R([pl(1000, -3), pl(0, 5)])
);
assert(a.overdueIn.count === 3 && a.overdueIn.total === 1650, "only past-due, non-zero balances count (not-yet-due, zero, due-today excluded)");
assert(a.overdueIn.oldestDaysOverdue === 40, "oldest overdue = 40 days");
assert(a.overdueIn.top[0].customer === "Bob" && a.overdueIn.top[0].amount === 900, "biggest overdue balance first");
assert(a.overdueIn.top[1].customer === "Ann" && a.overdueIn.top[1].amount === 750 && a.overdueIn.top[1].oldestDaysOverdue === 40, "same customer's invoices are summed");
assert(a.dueOut.count === 3 && a.dueOut.total === 1500, "payables: overdue + due within 7 days; 8 days out and zero balances excluded");
assert(a.dueOut.overdueCount === 1 && a.dueOut.overdueTotal === 300, "overdue payables split out");

const blank = computeCashActions(R([rl("  ", 10, 5)]), R([]), R([]));
assert(blank.overdueIn.top[0].customer === "No name recorded", "blank customer name gets a readable label");
const custom = computeCashActions(R([]), R([pl(100, -10)]), R([]), 14);
assert(custom.dueOut.count === 1, "dueSoonDays window is respected");
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("ALL CHECKS PASSED");
