// Stock losses must reach profit so the Balance Sheet keeps balancing.
// Run: npx tsx scripts/verify-stock-shrinkage.ts
import { computeAllLedgers, currentInventoryValue, computeSaleEconomics, computeMonthlyPnL, computeBalanceSheet } from "../lib/calculations";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("OK:", m); }
const today = new Date().toISOString().slice(0, 10);
const now = Date.now();
const products: any[] = [{ id: "p1", name: "Widget" }];
const purchases: any[] = [{ id: "u1", productId: "p1", qty: 10, unitCost: 100, date: today, createdAt: now, paymentMethod: "cash" }];
const capital: any[] = [{ id: "c1", kind: "investment", amount: 1000, date: today, createdAt: now }];

function run(adjs: any[]) {
  const ledgers = computeAllLedgers(products, purchases, [], [], adjs);
  const vals = adjs.filter((a) => a.reason !== "production_use")
    .map((a) => ({ date: a.date, value: ledgers.get(a.productId)!.adjustmentValue.get(a.id)! }));
  const econ = computeSaleEconomics([], ledgers, [], [], []);
  const pnl = computeMonthlyPnL([], econ, [], purchases, [], capital, 0, 0, [], [], [], [], [], vals);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], { netCapitalIn: 1000 } as any, today);
  return { last: pnl[pnl.length - 1], gap: bs.totalAssets - bs.totalLiabilitiesAndEquity };
}
const base = run([]);
const lost = run([{ id: "a1", productId: "p1", qty: -2, reason: "damaged", date: today, createdAt: now + 1 }]);
const found = run([{ id: "a2", productId: "p1", qty: 1, reason: "count_correction", date: today, createdAt: now + 1 }]);
const prod = run([{ id: "a3", productId: "p1", qty: -3, reason: "production_use", date: today, createdAt: now + 1 }]);
assert(Math.abs(lost.last.stockShrinkage - 200) < 0.01, "2 damaged units at WAC 100 = 200 shrinkage");
assert(Math.abs(lost.last.netProfitPreTax - (base.last.netProfitPreTax - 200)) < 0.01, "loss reduces profit by 200");
assert(Math.abs(lost.gap - base.gap) < 0.01, "balance sheet gap unchanged by a stock loss");
assert(Math.abs(found.last.stockShrinkage + 100) < 0.01 && Math.abs(found.gap - base.gap) < 0.01, "found stock is a 100 gain and stays balanced");
assert(prod.last.stockShrinkage === 0, "production_use is not booked as a loss");
