// Empirical check for the production/BOM math in recordProduction
// (contexts/DataContext.tsx) and the two risk-signal exclusions that ship
// alongside it (computeManualOpsSignals / computeSupplierConcentration in
// lib/calculations.ts). Nothing here touches Firestore — it runs the same
// WAC math recordProduction does against computeAllLedgers directly, and
// checks the two exclusions against real signal output, not just types.
//
// Run: npx tsx scripts/verify-production-math.ts

import {
  computeAllLedgers,
  computeManualOpsSignals,
  computeSupplierConcentration,
} from "../lib/calculations";
import { PRODUCTION_SUPPLIER_LABEL } from "../lib/types";
import type { Product, Purchase, Sale, SaleReturn, StockAdjustment } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// --- Set up: raw material "Steel" and finished good "Widget" (2kg steel/unit) ---
const steel: Product = { id: "steel", name: "Steel (kg)", type: "product", active: true, createdAt: 0 } as Product;
const widget: Product = {
  id: "widget",
  name: "Widget",
  type: "product",
  active: true,
  createdAt: 0,
  components: [{ id: "c1", componentProductId: "steel", qtyPerUnit: 2 }],
} as Product;
const products: Product[] = [steel, widget];

// Buy 100kg steel @ $10/kg -> WAC = 10
const purchases: Purchase[] = [
  { id: "p1", productId: "steel", qty: 100, unitCost: 10, date: "2026-01-01", supplier: "Acme Metals", createdAt: 0 },
];
const sales: Sale[] = [];
const saleReturns: SaleReturn[] = [];

// --- Step 1: ledgers before production ---
const ledgersBefore = computeAllLedgers(products, purchases, sales, saleReturns, []);
const steelWacBefore = ledgersBefore.get("steel")!.wac;
assert(steelWacBefore === 10, `steel WAC before production is 10 (got ${steelWacBefore})`);

// --- Step 2: simulate recordProduction(widget, qty=10) exactly as DataContext does ---
const qty = 10;
const wac = ledgersBefore.get("steel")!.wac;
const qtyConsumed = 2 * qty; // 20kg
const componentCostTotal = qtyConsumed * wac; // 200
const laborTotal = 0;
const totalCost = componentCostTotal + laborTotal;
const unitCost = totalCost / qty; // 20/unit

const stockAdjustments: StockAdjustment[] = [
  { id: "a1", productId: "steel", qty: -qtyConsumed, reason: "production_use", date: "2026-01-02", createdAt: 0 },
];
const purchasesAfter: Purchase[] = [
  ...purchases,
  { id: "p2", productId: "widget", qty, unitCost, date: "2026-01-02", supplier: PRODUCTION_SUPPLIER_LABEL, createdAt: 0 },
];

const ledgersAfter = computeAllLedgers(products, purchasesAfter, sales, saleReturns, stockAdjustments);

const steelAfter = ledgersAfter.get("steel")!;
assert(steelAfter.qtyOnHand === 80, `steel qtyOnHand after producing 10 widgets is 80 (got ${steelAfter.qtyOnHand})`);
assert(steelAfter.wac === 10, `steel WAC unaffected by consumption, stays 10 (got ${steelAfter.wac})`);

const widgetAfter = ledgersAfter.get("widget")!;
assert(widgetAfter.qtyOnHand === 10, `widget qtyOnHand after producing 10 is 10 (got ${widgetAfter.qtyOnHand})`);
assert(widgetAfter.wac === 20, `widget WAC = component cost / unit = 20 (got ${widgetAfter.wac})`);

// --- Step 3: manual-ops signal must NOT count production_use as an anomaly ---
const asOf = "2026-01-31";
const signalsWithProduction = computeManualOpsSignals([], stockAdjustments, [], saleReturns, asOf);
const signalsWithoutAnyAdjustment = computeManualOpsSignals([], [], [], saleReturns, asOf);
assert(
  signalsWithProduction.stockAdjustmentCount === signalsWithoutAnyAdjustment.stockAdjustmentCount,
  `a production_use adjustment does NOT inflate stockAdjustmentCount (${signalsWithProduction.stockAdjustmentCount} vs baseline ${signalsWithoutAnyAdjustment.stockAdjustmentCount})`
);

// A REAL anomaly (damage) must still count, to prove the exclusion is
// reason-specific and not accidentally swallowing all adjustments.
const withDamage: StockAdjustment[] = [
  ...stockAdjustments,
  { id: "a2", productId: "steel", qty: -1, reason: "damaged", date: "2026-01-03", createdAt: 0 },
];
const signalsWithDamage = computeManualOpsSignals([], withDamage, [], saleReturns, asOf);
assert(
  signalsWithDamage.stockAdjustmentCount === signalsWithProduction.stockAdjustmentCount + 1,
  `a real "damaged" adjustment still counts as an anomaly (${signalsWithDamage.stockAdjustmentCount} vs ${signalsWithProduction.stockAdjustmentCount})`
);

// --- Step 4: supplier concentration must exclude in-house production spend ---
const concentrationWithProduction = computeSupplierConcentration(purchasesAfter);
const concentrationWithoutProductionPurchase = computeSupplierConcentration(purchases);
assert(
  concentrationWithProduction.totalSpend === concentrationWithoutProductionPurchase.totalSpend,
  `in-house production Purchase excluded from supplier-concentration totalSpend (${concentrationWithProduction.totalSpend} vs ${concentrationWithoutProductionPurchase.totalSpend})`
);
assert(
  !concentrationWithProduction.suppliers.some((s) => s.supplier === PRODUCTION_SUPPLIER_LABEL),
  `"${PRODUCTION_SUPPLIER_LABEL}" never appears as a supplier in the concentration breakdown`
);

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
