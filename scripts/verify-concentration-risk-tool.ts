// Empirical check for lib/aiGrowthRisk.ts — the thin wrapper that lets the
// AI Assistant answer "am I too dependent on one customer/supplier?" using
// the exact same computeCustomerConcentration / computeSupplierConcentration
// numbers the Sales and Purchases pages already show. The only new logic
// here is severityFor's 60% / 35% banding, so that's what this checks —
// against the same thresholds those two pages' Badge tones use ("bad" >=60,
// "amber" >=35, "good" below).
//
// Run: npx tsx scripts/verify-concentration-risk-tool.ts

import { generateConcentrationRiskReport } from "../lib/aiGrowthRisk";
import type { Sale, Purchase } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}

function sale(customer: string, revenue: number, daysAgo = 10): Sale {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `s_${customer}_${revenue}_${daysAgo}`,
    productId: "p1",
    qty: 1,
    unitPrice: revenue,
    date: d.toISOString().slice(0, 10),
    customer,
    createdAt: Date.now(),
  } as Sale;
}

function purchase(supplier: string, cost: number, daysAgo = 10): Purchase {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `p_${supplier}_${cost}_${daysAgo}`,
    productId: "p1",
    qty: 1,
    unitCost: cost,
    date: d.toISOString().slice(0, 10),
    supplier,
    createdAt: Date.now(),
  } as Purchase;
}

// ---- empty history: no crash, everything null, not "low" ------------------
{
  const r = generateConcentrationRiskReport([], []);
  assert(r.customer.topCustomerSharePct === null && r.customer.severity === null, "no sales history -> null, not a false 'low'");
  assert(r.supplier.topSupplierSharePct === null && r.supplier.severity === null, "no purchase history -> null, not a false 'low'");
}

// ---- one dominant customer (70%) crosses into high, mirrors page's >=60 --
{
  const sales = [sale("Kamal", 700), sale("Nadeesha", 200), sale("Priya", 100)];
  const r = generateConcentrationRiskReport(sales, []);
  assert(r.customer.topCustomer === "Kamal", "highest-revenue customer identified correctly");
  assert(Math.abs((r.customer.topCustomerSharePct ?? 0) - 70) < 0.001, "top customer share computed correctly (70%)");
  assert(r.customer.severity === "high", "70% share matches the page's >=60% 'high' band");
}

// ---- exactly on the 35% boundary reads medium, not low or high -----------
// A is the top customer (35 of 100) — B and C split the rest so A stays highest.
{
  const sales = [sale("A", 35), sale("B", 34), sale("C", 31)];
  const r = generateConcentrationRiskReport(sales, []);
  assert(r.customer.topCustomer === "A" && r.customer.topCustomerSharePct === 35, "top customer's boundary share is exactly 35%");
  assert(r.customer.severity === "medium", "exactly 35% is 'medium', matching the page's inclusive >=35 band");
}

// ---- just under 35% reads low ---------------------------------------------
{
  const sales = [sale("A", 34), sale("B", 33), sale("C", 33)];
  const r = generateConcentrationRiskReport(sales, []);
  assert(r.customer.topCustomer === "A" && r.customer.severity === "low", "34% (just under the band) is 'low'");
}

// ---- supplier side mirrors the same bands independently of customer side -
{
  const purchases = [purchase("Acme Traders", 900), purchase("City Hardware", 100)];
  const r = generateConcentrationRiskReport([], purchases);
  assert(r.supplier.topSupplier === "Acme Traders", "highest-spend supplier identified correctly");
  assert(r.supplier.severity === "high", "90% supplier share is 'high'");
  assert(r.customer.severity === null, "supplier-only data doesn't invent a customer figure");
}

if (process.exitCode === 1) {
  console.log("\nFAIL — see above.");
} else {
  console.log("\nALL CHECKS PASSED");
}
