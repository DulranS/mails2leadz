// Reducing-balance depreciation next to the original straight-line (computeFixedAssetStatus).
// The point to prove: both methods reconcile with the monthly P&L totals and the Balance Sheet.
// Run: npx tsx scripts/verify-depreciation-methods.ts
import { computeBalanceSheet, computeCapitalSummary, computeFixedAssetMonthlyTotals, computeFixedAssetStatus, computeMonthlyPnL } from "../lib/calculations";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("OK:", m); }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const base: any = { id: "a1", name: "Van", category: "Vehicles", purchaseDate: "2025-01-15", cost: 1_000_000, usefulLifeMonths: 60, createdAt: 1 };

// Straight-line is untouched.
const sl = computeFixedAssetStatus(base, "2025-12-31");
assert(near(sl.accumulatedDepreciation, 200000) && near(sl.monthlyDepreciation, 1_000_000 / 60), "straight-line: 12 of 60 months = 20% of cost");
assert(computeFixedAssetStatus({ ...base, depreciationMethod: "straight_line" }, "2025-12-31").netBookValue === sl.netBookValue, "an explicit straight_line equals the old default");

// Reducing balance at 25% a year: after exactly 12 months, 75% of cost remains.
const rb: any = { ...base, depreciationMethod: "reducing_balance", reducingRatePct: 25 };
const y1 = computeFixedAssetStatus(rb, "2025-12-31");
assert(near(y1.netBookValue, 750000, 0.5), "reducing balance: 25% a year leaves 750,000 after year one");
const y2 = computeFixedAssetStatus(rb, "2026-12-31");
assert(near(y2.netBookValue, 562500, 0.5), "year two takes 25% of what was left (562,500)");
assert(y1.monthlyDepreciation > y2.monthlyDepreciation, "the monthly charge shrinks over time");
assert(y1.accumulatedDepreciation < computeFixedAssetStatus({ ...rb, reducingRatePct: 40 }, "2025-12-31").accumulatedDepreciation, "a higher rate writes off more");

// Salvage floor.
const floor = computeFixedAssetStatus({ ...rb, salvageValue: 400000 }, "2040-12-31");
assert(near(floor.netBookValue, 400000) && floor.fullyDepreciated, "never goes below salvage, and is then marked fully depreciated");
assert(!computeFixedAssetStatus(rb, "2040-12-31").fullyDepreciated || computeFixedAssetStatus(rb, "2040-12-31").netBookValue <= 0.005, "with no salvage it is not 'fully depreciated' while value remains");

// A missing or zero rate falls back safely to straight-line instead of dividing by nothing.
assert(near(computeFixedAssetStatus({ ...rb, reducingRatePct: 0 }, "2025-12-31").accumulatedDepreciation, 200000), "reducing balance with no rate behaves as straight-line");

// Monthly totals reconcile to the status, for both methods, including a disposal.
for (const [label, asset] of [["straight-line", base], ["reducing balance", rb]] as const) {
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) months.push(`2025-${String(m).padStart(2, "0")}`);
  const totals = computeFixedAssetMonthlyTotals([asset], months);
  const sum = months.reduce((s, k) => s + (totals.get(k)?.depreciation ?? 0), 0);
  assert(near(sum, computeFixedAssetStatus(asset, "2025-12-31").accumulatedDepreciation, 0.05), `${label}: monthly depreciation adds up to accumulated depreciation`);
  const sold = { ...asset, disposalDate: "2025-08-20", disposalAmount: 700000 };
  const t2 = computeFixedAssetMonthlyTotals([sold], months);
  const gl = months.reduce((s, k) => s + (t2.get(k)?.disposalGainLoss ?? 0), 0);
  const nbvAtSale = computeFixedAssetStatus(sold, "2025-08-20").netBookValue;
  assert(near(gl, 700000 - nbvAtSale, 0.05), `${label}: disposal gain/loss = proceeds - book value at sale`);
}

// The Balance Sheet balances with a reducing-balance asset (cash out, depreciation as expense, NBV as asset).
{
  const capital: any[] = [{ id: "c1", kind: "investment", amount: 2_000_000, date: "2024-12-01", createdAt: 1 }];
  const today = new Date().toISOString().slice(0, 10);
  const asset: any = { ...rb, purchaseDate: "2025-01-15" };
  const pnl = computeMonthlyPnL([], [], [], [], [], capital, 20, 0, [asset]);
  const bs = computeBalanceSheet(pnl, 0, [], computeCapitalSummary(capital, pnl), today, [asset]);
  assert(bs.balances, "Balance Sheet balances with a reducing-balance asset");
  assert(near(bs.fixedAssetsNetBookValue, computeFixedAssetStatus(asset, today).netBookValue, 0.05), "Balance Sheet shows the reducing-balance book value");
}
