// Quick scorecard and R&D detection (pass 305, lib/scorecard.ts).
import { isRdCategory, rdExpenseFor, scorecard, type ScorecardMonth } from "../lib/scorecard";
import type { Expense } from "../lib/types";

let failed = 0;
const ok = (c: boolean, w: string) => { if (!c) failed++; console.log(`${c ? "ok  " : "FAIL"} - ${w}`); };

ok(isRdCategory("R&D") && isRdCategory("Research and development") && isRdCategory("Product development"), "R&D, research and development are recognised");
ok(!isRdCategory("Transport & logistics") && !isRdCategory("Rent"), "other categories are not R&D");

const monthly = (over: Partial<Expense>) => ({
  id: "x", name: "n", amount: 0, category: "Rent", kind: "expense", isRecurring: true, recurrence: "monthly",
  startDate: "2026-01-01", ...over,
}) as unknown as Expense;
const months12 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
ok(rdExpenseFor([monthly({ category: "R&D", amount: 500 })], months12) === 6000, "a 500 monthly R&D cost over 12 months is 6000");
ok(rdExpenseFor([monthly({ category: "Rent", amount: 500 })], months12) === 0, "non-R&D costs count as zero R&D");
ok(rdExpenseFor([monthly({ category: "R&D", amount: 500, startDate: "2026-07-01", isRecurring: false })], months12) === 500, "a one-off R&D cost counts once, in its month");

const m = (over: Partial<ScorecardMonth>): ScorecardMonth => ({
  totalRevenue: 0, grossProfit: 0, sellingExpenses: 0, adminExpenses: 0, depreciationExpense: 0,
  interestExpense: 0, netProfitAfterTax: 0, fixedAssetPurchases: 0, ...over,
});
const healthy = scorecard({
  months: [m({ totalRevenue: 1000, grossProfit: 500, sellingExpenses: 100, adminExpenses: 100, depreciationExpense: 50, interestExpense: 50, netProfitAfterTax: 250, fixedAssetPurchases: 100 })],
  rdExpense: 0, cash: 500, loansPayable: 300, totalEquity: 1000,
});
const row = (rows: ReturnType<typeof scorecard>, id: string) => rows.find((r) => r.id === id)!;
ok(row(healthy, "gross").value === 50 && row(healthy, "gross").pass === true, "gross margin 50% passes above 40%");
ok(row(healthy, "sga").value === 20 && row(healthy, "sga").pass === true, "SG&A is selling plus admin: 20%, under 30%");
ok(row(healthy, "depreciation").value === 5 && row(healthy, "depreciation").pass === true, "depreciation 5%, under 10%");
ok(row(healthy, "interest").value === 5 && row(healthy, "interest").pass === true, "interest 5%, under 15%");
ok(row(healthy, "net").value === 25 && row(healthy, "net").pass === true, "net margin 25%, above 20%");
ok(row(healthy, "cash-debt").pass === true && row(healthy, "cash-debt").value === 200, "cash 500 over debt 300");
ok(row(healthy, "de").value === 0.3 && row(healthy, "de").pass === true, "debt-to-equity 0.30, under 0.80");
ok(row(healthy, "capex").value === 10 && row(healthy, "capex").pass === true, "capex 10%, under 25%");

const rdHeavy = scorecard({
  months: [m({ totalRevenue: 1000, sellingExpenses: 100, adminExpenses: 300 })], rdExpense: 300, cash: 0, loansPayable: 900, totalEquity: 500,
});
ok(row(rdHeavy, "sga").value === 10, "R&D is taken out of admin before SG&A is measured");
ok(row(rdHeavy, "rd").value === 30 && row(rdHeavy, "rd").pass === false, "R&D at exactly 30% fails the below-30% test");
ok(row(rdHeavy, "de").value === 1.8 && row(rdHeavy, "de").pass === false, "debt-to-equity 1.80 fails under 0.80");

const noRevenue = scorecard({ months: [m({})], rdExpense: 0, cash: 0, loansPayable: 0, totalEquity: 0 });
ok(row(noRevenue, "gross").value === null && row(noRevenue, "gross").pass === null, "no revenue: percentage checks are not judged");
ok(row(noRevenue, "de").pass === null, "no equity: debt-to-equity is not judged");

console.log(failed ? `${failed} failed` : "Quick scorecard: all checks passed");
process.exit(failed ? 1 : 0);
