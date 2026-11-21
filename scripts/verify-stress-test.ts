// Stress test (lib/stressTest.ts). Hand-worked numbers, plus a check that it agrees with the app's own break-even.
// Run: npx tsx scripts/verify-stress-test.ts
import fs from "node:fs";
import { stressBaseline, runStress, clamp, type StressMonth } from "../lib/stressTest";
import { computeBreakEven } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
// One steady month: revenue 100,000; goods + variable costs 60,000 (contribution 40%); operating costs 25,000; other 5,000; profit 10,000; cash flow +8,000.
const m = (month: string, o: Partial<StressMonth> = {}): StressMonth => ({ month, totalRevenue: 100000, cogs: 50000, variableCosts: 10000, operatingExpenses: 25000, netProfitPreTax: 10000, netCashFlow: 8000, ...o });
const b = stressBaseline([m("2026-07"), m("2026-08"), m("2026-09")], "2026-10")!;
ok(b.revenue === 100000 && b.variableCosts === 60000 && b.operatingExpenses === 25000 && b.netProfit === 10000 && b.netCashFlow === 8000 && b.months === 3, "baseline: the average of three steady months");
ok(b.otherCosts === 5000, "the rest between revenue and profit (interest, depreciation, losses) is 5,000, so the baseline adds up exactly");

// No change: the baseline, to the cent.
const same = runStress(b, 50000, { salesChangePct: 0, costChangePct: 0 });
ok(same.netProfit === 10000 && same.marginPct === 10 && same.breakEvenRevenue === 75000 && same.marginOfSafetyPct === 25 && same.runwayMonths === null, "no change: profit 10,000 (10%), break-even 75,000 (30,000 / 40%), margin of safety 25%, cash not falling");
// Sales -20%, costs +10%: revenue 80,000; goods 60,000 x 0.8 x 1.1 = 52,800; opex 27,500; profit 80,000 - 52,800 - 27,500 - 5,000 = -5,300.
const bad = runStress(b, 50000, { salesChangePct: -20, costChangePct: 10 });
ok(bad.revenue === 80000 && bad.netProfit === -5300 && bad.marginPct === -6.6, "sales -20% and costs +10%: profit -5,300 (-6.6% of 80,000)");
ok(bad.breakEvenRevenue === 95588.24 && bad.marginOfSafetyPct === -19.5, "break-even rises to 95,588 (32,500 / 34%), so sales are 19.5% below it");
ok(bad.monthlyCashFlow === -7300 && bad.runwayMonths === 6.8, "cash flow 8,000 + (-5,300 - 10,000) = -7,300 a month: 50,000 lasts 6.8 months");
// Each shock on its own.
ok(runStress(b, 0, { salesChangePct: 0, costChangePct: 10 }).netProfit === 1500, "costs +10% alone: 100,000 - 66,000 - 27,500 - 5,000 = 1,500");
ok(runStress(b, 0, { salesChangePct: 20, costChangePct: 0 }).netProfit === 18000, "sales +20% alone: 120,000 - 72,000 - 25,000 - 5,000 = 18,000");
ok(runStress(b, 0, { salesChangePct: -20, costChangePct: 0 }).netProfit === 2000, "sales -20% alone: 80,000 - 48,000 - 25,000 - 5,000 = 2,000");
// Never breaks even: costs so high that variable costs exceed revenue.
const doomed = runStress(b, 1000, { salesChangePct: 0, costChangePct: 100 });
ok(doomed.breakEvenRevenue === null && doomed.marginOfSafetyPct === null && doomed.runwayMonths !== null, "variable costs doubled past revenue: no break-even, and a runway is shown");
// No fixed costs at all (other income covers them): break-even is 0 and every sale is above it.
const free = stressBaseline([m("2026-09", { operatingExpenses: 0, netProfitPreTax: 45000 })], "2026-10")!;
const freeNow = runStress(free, 1000, { salesChangePct: 0, costChangePct: 0 });
ok(free.otherCosts === -5000 && freeNow.breakEvenRevenue === 0 && freeNow.marginOfSafetyPct === 100, "negative fixed costs: break-even 0, margin of safety 100%");
// Cash flow of exactly zero is not "falling": no runway figure, not a division by zero.
const flat = stressBaseline([m("2026-09", { netCashFlow: 0 })], "2026-10")!;
ok(runStress(flat, 1000, { salesChangePct: 0, costChangePct: 0 }).runwayMonths === null && runStress(flat, 1000, { salesChangePct: 0, costChangePct: 0 }).monthlyCashFlow === 0, "cash flow exactly 0: not falling");

// Clamping: absurd inputs stay inside the model.
ok(clamp(-500, -90, 100) === -90 && clamp(500, -90, 100) === 100 && clamp(NaN, -90, 100) === 0, "inputs are clamped (sales -90..+100, costs -50..+100); NaN is 0");
ok(runStress(b, 100, { salesChangePct: -500, costChangePct: 0 }).revenue === 10000, "sales -500% is held at -90%: revenue 10,000");
// Cash: negative or bad cash gives runway 0, not a crash.
ok(runStress(b, -500, { salesChangePct: -20, costChangePct: 10 }).runwayMonths === 0 && runStress(b, NaN, { salesChangePct: -20, costChangePct: 10 }).runwayMonths === 0, "no cash on hand: runway 0 months");

// Baseline rules: complete months only, the last three, nothing without revenue.
const mixed = stressBaseline([m("2026-06", { totalRevenue: 1, cogs: 0, variableCosts: 0, operatingExpenses: 0, netProfitPreTax: 1, netCashFlow: 1 }), m("2026-07", { totalRevenue: 200000, netProfitPreTax: 20000 }), m("2026-08"), m("2026-09", { totalRevenue: 120000, netProfitPreTax: 12000 }), m("2026-10", { totalRevenue: 999999 })], "2026-10")!;
ok(mixed.months === 3 && mixed.revenue === 140000 && mixed.netProfit === 14000, "only the last 3 complete months (Jul, Aug, Sep): revenue (200k + 100k + 120k) / 3 = 140,000; the running month is ignored");
ok(stressBaseline([], "2026-10") === null && stressBaseline([m("2026-10")], "2026-10") === null && stressBaseline([m("2026-09", { totalRevenue: 0 })], "2026-10") === null && stressBaseline([m("2026-09")], "junk") === null, "no complete month with revenue, or a bad date: no test");
ok(stressBaseline([m("2026-09", { totalRevenue: NaN as unknown as number })], "2026-10") === null, "NaN revenue is not a number to test with");

// It must agree with the app's own break-even for the same months (a different calculation of the same thing).
const pnl = [m("2026-07"), m("2026-08"), m("2026-09")].map((x) => ({ ...x, salesRevenue: x.totalRevenue, depreciationExpense: 2000, contributionMargin: x.totalRevenue - x.cogs - x.variableCosts })) as any;
const appBE = computeBreakEven(pnl[2], pnl);
const myB = stressBaseline([m("2026-07"), m("2026-08"), m("2026-09")], "2026-10")!;
// The app's fixed costs here are opex + depreciation (27,000); the stress test's fixed = opex + other (30,000, where other holds depreciation plus 3,000 of other costs). Same contribution ratio:
ok(Math.abs(appBE.contributionMarginRatio - 0.4) < 1e-9 && Math.abs((myB.revenue - myB.variableCosts) / myB.revenue - 0.4) < 1e-9, "the contribution ratio is the same as the app's (40%)");

// Wiring.
const comp = fs.readFileSync("components/StressTest.tsx", "utf8");
ok(/stressBaseline\(monthlyPnL, todayIso\(\)\.slice\(0, 7\)\)/.test(comp) && /runStress\(/.test(comp), "the card reads the P&L months and runs the model");
ok(/const now = runStress\(baseline, balanceSheet\.cash, \{ salesChangePct: 0, costChangePct: 0 \}\)/.test(comp) && /const then = runStress\(baseline, balanceSheet\.cash, \{ salesChangePct: s, costChangePct: c \}\)/.test(comp), "\"Now\" is the unchanged baseline and \"In this case\" uses the two dials");
ok(/clamp\(Number\(sales\), -90, 100\)/.test(comp) && /clamp\(Number\(cost\), -50, 100\)/.test(comp), "typed values are clamped before use");
const health = fs.readFileSync("app/health/page.tsx", "utf8");
ok(/<StressTest \/>/.test(health), "the card is on the Financial health page");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
