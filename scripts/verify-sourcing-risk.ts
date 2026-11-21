// Sourcing risk (lib/sourcingRisk.ts): products bought from one supplier, a supplier's share of spend, the twelve-month window, the flags, and
// the tab and its roles, checked with worked numbers. Run: npx tsx scripts/verify-sourcing-risk.ts
import { sourcingRisk, SINGLE_SOURCE_SPEND_SHARE_PCT } from "../lib/sourcingRisk";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const today = "2026-11-09";
const purchases = [
  { productId: "flour", qty: 10, unitCost: 100, date: "2026-06-01", supplier: "MillCo" },     // 1,000
  { productId: "flour", qty: 10, unitCost: 100, date: "2026-09-01", supplier: "MillCo" },     // 1,000
  { productId: "sugar", qty: 10, unitCost: 50, date: "2026-07-01", supplier: "MillCo" },      //   500
  { productId: "sugar", qty: 10, unitCost: 60, date: "2026-10-01", supplier: "SweetCo" },     //   600
  { productId: "eggs", qty: 5, unitCost: 40, date: "2026-08-01", supplier: "FarmA" },         //   200
  { productId: "old", qty: 99, unitCost: 99, date: "2024-01-01", supplier: "Ancient" },        // outside the window
  { productId: "nofrom", qty: 2, unitCost: 10, date: "2026-05-01" },                           //    20, no supplier
];
const r = sourcingRisk(purchases, today);

ok(r.totalSpend === 3320, "the spend counted is the last twelve months only (the 2024 purchase is left out)");
const flour = r.products.find((p) => p.productId === "flour")!;
ok(flour.singleSource === true && flour.suppliers.join() === "MillCo" && flour.spend === 2000, "flour bought from one supplier is single-source");
ok(r.products.find((p) => p.productId === "sugar")!.singleSource === false, "sugar bought from two suppliers is not single-source");
ok(r.products.find((p) => p.productId === "eggs")!.singleSource === true && r.products.find((p) => p.productId === "nofrom")!.singleSource === false, "eggs from one supplier is single-source; a product with no supplier recorded is not counted as one, its source is simply unknown");
ok(r.products[0].singleSource === true, "single-source products are listed first");
const millco = r.suppliers.find((s) => s.supplier === "MillCo")!;
ok(millco.spend === 2500 && millco.sharePct === 75.3 && millco.flagged === true, "a supplier taking 75% of spend is flagged as a single point of failure");
ok(r.suppliers.find((s) => s.supplier === "FarmA")!.flagged === false, "a smaller supplier is not flagged");
ok(r.suppliers.find((s) => s.supplier === "No supplier recorded")!.spend === 20, "purchases with no supplier are shown as such, not hidden");
ok(r.dominantSupplierFlagged === true && r.singleSourceCount === 2 && SINGLE_SOURCE_SPEND_SHARE_PCT === 50, "the business is told it depends on one supplier, and how many products have one source");
ok(sourcingRisk([], today).totalSpend === 0 && sourcingRisk([], today).suppliers.length === 0, "no purchases gives nothing to flag");

ok(tabsForRole("owner").includes("sourcing") && tabsForRole("manager").includes("sourcing") && !tabsForRole("staff").includes("sourcing"), "sourcing risk is for the owner and manager");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
