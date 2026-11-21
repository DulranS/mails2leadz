// Verifies the fix to lib/aiCashFlowPrediction.ts's generateCashFlowForecast:
// the AI assistant's forecast_cash_flow tool (app/api/ai/chat/route.ts)
// now passes deterministic=true, so the same question asked twice gets the
// same numbers back — before this fix, the function's own ±10% random
// jitter (there for chart variety, on a function with zero actual chart
// consumers anywhere in app/*.tsx — checked directly, not assumed) meant
// two identical chat questions could get two different cash-flow answers
// with nothing about the business having changed.
//
// Run: npx tsx scripts/verify-cashflow-forecast-determinism.ts

import { generateCashFlowForecast } from "../lib/aiCashFlowPrediction";
import type { Sale, Expense, Purchase, Settings } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const sales: Sale[] = [
  { id: "s1", productId: "p1", qty: 10, unitPrice: 100, date: "2026-06-15", createdAt: 0 } as Sale,
  { id: "s2", productId: "p1", qty: 12, unitPrice: 100, date: "2026-07-15", createdAt: 0 } as Sale,
];
const expenses: Expense[] = [
  {
    id: "e1",
    name: "Rent",
    amount: 500,
    category: "Rent",
    kind: "expense",
    isRecurring: true,
    recurrence: "monthly",
    startDate: "2026-06-01",
    createdAt: 0,
  } as Expense,
];
const purchases: Purchase[] = [
  { id: "pu1", productId: "p1", qty: 5, unitCost: 20, date: "2026-06-10", createdAt: 0 } as Purchase,
];
const settings: Settings = { rentAmount: 500 } as Settings;

// The fix itself: deterministic=true must give byte-identical results
// across repeated calls with the same inputs.
const runA = generateCashFlowForecast(sales, expenses, purchases, settings, 3, true);
const runB = generateCashFlowForecast(sales, expenses, purchases, settings, 3, true);
assert(
  JSON.stringify(runA) === JSON.stringify(runB),
  "deterministic=true gives identical output across repeated calls with the same inputs"
);

// Confirm the deterministic mode's projectedInflow is the plain average
// revenue, with no ±10% jitter — i.e. it's not just "less random", it's
// exactly the average every time.
const avgRevenue = sales.reduce((s, x) => s + x.qty * x.unitPrice, 0) / new Set(sales.map((s) => s.date.slice(0, 7))).size;
assert(
  runA.predictions.every((p) => Math.abs(p.projectedInflow - avgRevenue) < 0.001),
  `deterministic projectedInflow equals the plain average revenue exactly (${avgRevenue}), no jitter (got ${runA.predictions.map((p) => p.projectedInflow)})`
);

// The default (non-deterministic) behavior must still exist and still
// vary — this fix targets the AI's use of it, not the underlying
// chart-variety behavior itself, which should be untouched for any other
// caller that doesn't explicitly opt into determinism.
const runsVary =
  new Set(
    Array.from({ length: 5 }, () => JSON.stringify(generateCashFlowForecast(sales, expenses, purchases, settings, 3)))
  ).size > 1;
assert(runsVary, "the default (deterministic omitted/false) still varies across calls — chart-variety behavior is untouched");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
