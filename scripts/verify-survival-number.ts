// Empirical check for computeSurvivalNumber (lib/calculations.ts).
// Run: npx tsx scripts/verify-survival-number.ts
import { computeSurvivalNumber } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const be = { contributionMarginRatio: 0.5, monthlyFixedCosts: 2000, breakEvenRevenue: 4000, actualRevenue: 5000, marginOfSafetyPct: 20, overheadCoverageRatio: 1.25 } as any;
const w = (id: string, date: string, amount: number, kind = "withdrawal") => ({ id, kind, amount, date, createdAt: 0 }) as any;

const entries = [
  w("a", "2026-09-05", 900),
  w("b", "2026-08-05", 600),
  w("c", "2026-07-20", 300),
  w("d", "2026-05-01", 5000), // outside the 3-month window
  w("e", "2026-09-10", 7000, "investment"), // not a withdrawal
  w("f", "2026-08-15", 4000, "reinvestment"), // not a withdrawal
];
const r = computeSurvivalNumber(be, entries, "2026-09-28")!;
assert(!!r, "returns a result when withdrawals exist in the window");
assert(near(r.avgMonthlyWithdrawals, 600), "average = (900+600+300)/3 = 600; old and non-withdrawal entries excluded");
assert(near(r.survivalNumber, 2600), "survival number = fixed costs 2000 + 600 taken out");
assert(near(r.survivalRevenue, 5200), "sales needed = 2600 / 0.5 margin = 5200");

assert(computeSurvivalNumber(be, [w("x", "2026-05-01", 999), w("y", "2026-09-01", 50, "investment")], "2026-09-28") === null,
  "no withdrawals in the window => null, so the UI stays silent");
assert(computeSurvivalNumber(be, [], "2026-09-28") === null, "no capital entries => null");

const zeroMargin = computeSurvivalNumber({ ...be, contributionMarginRatio: 0 }, entries, "2026-09-28")!;
assert(zeroMargin.survivalRevenue === Infinity && near(zeroMargin.survivalNumber, 2600), "zero margin => cash number still shown, sales needed is Infinity (UI shows a dash)");

assert(computeSurvivalNumber(be, entries, "not-a-date") === null, "bad date => null, no crash");
const edge = computeSurvivalNumber(be, [w("z", "2026-06-28", 300), w("z2", "2026-06-29", 300)], "2026-09-28")!;
assert(near(edge.avgMonthlyWithdrawals, 100), "an entry exactly on the window's start date is excluded, one day inside is included");
