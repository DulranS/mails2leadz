// Category budgets (lib/categoryBudgets.ts): spend per category uses the P&L's own month rules, so the rows always add
// up to the month's expense total; budgets are cleaned; status flags are right. Hand-worked numbers.
// Run: npx tsx scripts/verify-category-budgets.ts
import { expenseTotalsForMonth } from "../lib/calculations";
import { cleanBudgets, computeCategoryBudgets, BUDGET_WATCH_PCT } from "../lib/categoryBudgets";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
let n = 0;
const exp = (o: any) => ({ id: `e${++n}`, name: "x", amount: 100, category: "Marketing", kind: "expense", isRecurring: false, recurrence: "monthly", startDate: "2026-10-05", ...o }) as any;
const M = "2026-10";

ok(BUDGET_WATCH_PCT === 80, "watch line is 80% of the budget");

// --- Cleaning: only positive finite numbers on named categories survive.
const c = cleanBudgets({ " Marketing ": 500, Rent: 0, Bad: -5, Nan: NaN, Inf: Infinity, "": 100, Ok: 1 });
ok(Object.keys(c).sort().join() === "Marketing,Ok" && c.Marketing === 500, "zero, negative, NaN, infinite and unnamed budgets are dropped; names are trimmed");
ok(Object.keys(cleanBudgets(undefined)).length === 0 && Object.keys(cleanBudgets(null)).length === 0, "no budgets => empty");

// --- Spend: a one-off counts in its month only; a recurring cost counts every active month (monthly-normalised).
const list = [
  exp({ category: "Marketing", amount: 300 }),
  exp({ category: "Marketing", amount: 90, startDate: "2026-09-20" }), // last month: not this month
  exp({ category: "Rent & utilities", amount: 1200, isRecurring: true, recurrence: "monthly", startDate: "2026-01-01" }),
  exp({ category: "Insurance", amount: 1200, isRecurring: true, recurrence: "yearly", startDate: "2026-01-01" }), // 100 a month
  exp({ category: "Marketing", amount: 5000, kind: "revenue", isRecurring: true, startDate: "2026-01-01" }), // revenue: ignored
  exp({ category: "Rent & utilities", amount: 50, isRecurring: true, recurrence: "monthly", startDate: "2026-01-01", endDate: "2026-09-30" }), // ended
];
let s = computeCategoryBudgets(list, { Marketing: 400, "Rent & utilities": 1000 }, M);
const row = (cat: string) => s.rows.find((r) => r.category === cat)!;
ok(near(row("Marketing").actual, 300), "Marketing: only this month's 300 (not last month's 90, not the revenue line)");
ok(near(row("Rent & utilities").actual, 1200), "Rent: 1,200 monthly; the ended 50 is not counted");
ok(near(row("Insurance").actual, 100), "a yearly 1,200 is 100 a month");
ok(near(s.totalActual, expenseTotalsForMonth(list, M).expenseTotal), "rows add up to the P&L's expense total for the month");

// --- Budget maths and status.
ok(near(row("Marketing").remaining!, 100) && near(row("Marketing").usedPct!, 75) && row("Marketing").status === "ok", "300 of 400: 75%, 100 left, ok");
ok(row("Rent & utilities").status === "over" && near(row("Rent & utilities").remaining!, -200) && near(row("Rent & utilities").usedPct!, 120), "1,200 of 1,000: over by 200, 120%");
ok(row("Insurance").budget === null && row("Insurance").status === "none" && row("Insurance").remaining === null, "no budget => status none, no remaining");
ok(near(s.totalBudget, 1400) && near(s.budgetedActual, 1500) && near(s.unbudgetedActual, 100) && s.overCount === 1, "budget total, budgeted vs unbudgeted spend, one over");
ok(near(s.budgetedActual + s.unbudgetedActual, s.totalActual), "budgeted + unbudgeted = total");

// --- Boundaries: exactly at the watch line is watch; exactly on budget is not over; a cent over is.
const at = (spent: number, budget: number) => computeCategoryBudgets([exp({ amount: spent })], { Marketing: budget }, M).rows[0].status;
ok(at(80, 100) === "watch" && at(79.99, 100) === "ok", "80% is watch, just under is ok");
ok(at(100, 100) === "watch" && at(100.01, 100) === "over", "exactly on budget is watch (not over); a cent more is over");

// --- Ordering: budgeted rows first, most used first; unbudgeted last by size.
s = computeCategoryBudgets(
  [exp({ category: "A", amount: 50 }), exp({ category: "B", amount: 90 }), exp({ category: "C", amount: 10 }), exp({ category: "D", amount: 70 })],
  { A: 100, B: 100 },
  M
);
ok(s.rows.map((r) => r.category).join() === "B,A,D,C", "B (90%) then A (50%), then unbudgeted D (70) then C (10)");

// --- A budget with nothing spent still shows; no budget and no spend does not; blank category is grouped.
s = computeCategoryBudgets([exp({ category: "   ", amount: 40 })], { Marketing: 200 }, M);
ok(s.rows.length === 2 && s.rows.some((r) => r.category === "Marketing" && r.actual === 0 && r.status === "ok"), "an unspent budget still shows as ok");
ok(s.rows.some((r) => r.category === "Uncategorised" && near(r.actual, 40)), "a blank category is grouped as Uncategorised");
ok(computeCategoryBudgets([], {}, M).rows.length === 0, "nothing at all => no rows");

// --- A category with no budget and nothing spent THIS month stays off the list, even if it had spend in other months.
s = computeCategoryBudgets([exp({ category: "Old", amount: 70, startDate: "2026-07-01" })], {}, M);
ok(s.rows.length === 0, "an unbudgeted category that only has spend in another month shows no row");

// --- Does not mutate its inputs.
const inp = [exp({ amount: 10 })];
const bud = { Marketing: 5 };
const snap = JSON.stringify([inp, bud]);
computeCategoryBudgets(inp, bud, M);
ok(JSON.stringify([inp, bud]) === snap, "inputs untouched");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
