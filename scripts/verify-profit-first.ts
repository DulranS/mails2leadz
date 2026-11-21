// Verifies computeProfitFirstAllocation (lib/calculations.ts) — the
// optional Profit First-style target-allocation guide shown on the
// Dashboard when Settings.profitFirstEnabled is on.
//
// Run: npx tsx scripts/verify-profit-first.ts

import { computeProfitFirstAllocation } from "../lib/calculations";
import type { MonthlyPnL } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

function pnl(overrides: Partial<MonthlyPnL>): MonthlyPnL {
  return {
    month: "2026-09",
    salesRevenue: 0,
    recurringRevenue: 0,
    totalRevenue: 0,
    cogs: 0,
    cogsVariableCosts: 0,
    variableCosts: 0,
    grossProfit: 0,
    grossMarginPct: null,
    contributionMargin: 0,
    contributionMarginPct: null,
    operatingExpenses: 0,
    interestExpense: 0,
    badDebtExpense: 0,
    netProfitPreTax: 0,
    tax: 0,
    netProfitAfterTax: 0,
    netMarginPct: null,
    unitsSold: 0,
    economicProfit: 0,
    depreciationExpense: 0,
    disposalGainLoss: 0,
    cashSalesRevenue: 0,
    receivableCollections: 0,
    purchaseCash: 0,
    payableSettlements: 0,
    expenseCash: 0,
    billSettlements: 0,
    loanProceeds: 0,
    principalRepayment: 0,
    capitalIn: 0,
    capitalOut: 0,
    fixedAssetPurchases: 0,
    fixedAssetDisposalProceeds: 0,
    operatingCashFlow: 0,
    financingCashFlow: 0,
    investingCashFlow: 0,
    netCashFlow: 0,
    outputTax: 0,
    inputTax: 0,
    ...overrides,
  } as MonthlyPnL;
}

// --- month not found -----------------------------------------------------
{
  const r = computeProfitFirstAllocation([], "2026-09", {});
  assert(r === null, "no matching month => null, not a zeroed-out result");
}

// --- real revenue is cash-collected, not accrual/gross sales -------------
{
  const months = [
    pnl({ month: "2026-09", cashSalesRevenue: 1000, recurringRevenue: 500, receivableCollections: 300, salesRevenue: 5000 }),
  ];
  const r = computeProfitFirstAllocation(months, "2026-09", {});
  assert(r?.realRevenue === 1800, "realRevenue = cashSalesRevenue + recurringRevenue + receivableCollections, ignores accrual salesRevenue");
}

// --- default percentages (published under-$250k starter CAPs) ------------
{
  const months = [pnl({ cashSalesRevenue: 10000 })];
  const r = computeProfitFirstAllocation(months, "2026-09", {});
  assert(r?.profitPct === 5 && r?.ownerPayPct === 50 && r?.taxPct === 15 && r?.opexPct === 30, "defaults are 5/50/15/30 when nothing is configured");
  assert(r?.profitTarget === 500 && r?.ownerPayTarget === 5000 && r?.taxTarget === 1500 && r?.opexTarget === 3000, "targets are the right % of realRevenue");
  assert(r!.profitTarget + r!.ownerPayTarget + r!.taxTarget + r!.opexTarget === r!.realRevenue, "the four targets always sum back to realRevenue exactly");
}

// --- custom percentages that sum to under 100 -----------------------------
{
  const months = [pnl({ cashSalesRevenue: 10000 })];
  const r = computeProfitFirstAllocation(months, "2026-09", {
    profitFirstProfitPct: 10,
    profitFirstOwnerPayPct: 20,
    profitFirstTaxPct: 15,
  });
  assert(r?.opexPct === 55, "opex is always 100 - the other three, never its own setting");
  assert(r?.overCommitted === false, "45% committed => not overCommitted");
}

// --- over-committed: three percentages already consume 100%+ -------------
{
  const months = [pnl({ cashSalesRevenue: 10000 })];
  const r = computeProfitFirstAllocation(months, "2026-09", {
    profitFirstProfitPct: 40,
    profitFirstOwnerPayPct: 40,
    profitFirstTaxPct: 30,
  });
  assert(r?.opexPct === 0, "opex floors at 0 rather than going negative when the other three exceed 100%");
  assert(r?.overCommitted === true, "profit+ownerPay+tax >= 100 flags overCommitted");
  // Unlike the under-100 case, these targets do NOT sum back to realRevenue —
  // the three configured percentages alone already total 110%, and Opex
  // contributes 0 on top of that rather than going negative to compensate.
  // That's the whole meaning of overCommitted: the targets, taken together,
  // ask for more than 100% of what actually came in.
  assert(
    Math.abs(r!.profitTarget + r!.ownerPayTarget + r!.taxTarget + r!.opexTarget - r!.realRevenue * 1.1) < 1e-9,
    "over-committed targets sum to 110% of realRevenue (40+40+30+0), not a clamped 100%"
  );
}

// --- out-of-range settings (e.g. hand-edited in Firestore) are clamped ---
{
  const months = [pnl({ cashSalesRevenue: 10000 })];
  const r = computeProfitFirstAllocation(months, "2026-09", {
    profitFirstProfitPct: -10,
    profitFirstOwnerPayPct: 500,
  });
  assert(r?.profitPct === 0, "a negative configured percentage clamps to 0");
  assert(r?.ownerPayPct === 100, "a percentage above 100 clamps to 100");
}

// --- zero revenue month: everything is zero, not divide-by-zero garbage --
{
  const months = [pnl({ month: "2026-09", cashSalesRevenue: 0 })];
  const r = computeProfitFirstAllocation(months, "2026-09", {});
  assert(r?.realRevenue === 0, "zero cash collected this month");
  assert(
    r?.profitTarget === 0 && r?.ownerPayTarget === 0 && r?.taxTarget === 0 && r?.opexTarget === 0,
    "every target is a clean 0 on a zero-revenue month, not NaN"
  );
}

if (process.exitCode === 1) {
  console.error("\nSOME CHECKS FAILED");
} else {
  console.log("\nALL CHECKS PASSED");
}
