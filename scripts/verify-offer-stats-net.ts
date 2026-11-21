// Offer (bundle/service) stats must be NET of returns/discounts, like the P&L they sit beside.
// Run: npx tsx scripts/verify-offer-stats-net.ts
import { computeOfferStats } from "../lib/calculations";
import type { Product, Sale } from "../lib/types";
import type { SaleEconomics } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const offer = { id: "o1", name: "Starter pack", sku: "O1", category: "", type: "service", active: true } as unknown as Product;
const sales = [
  { id: "s1", productId: "o1", qty: 2, unitPrice: 1000, date: "2026-10-01", createdAt: 0 },
  { id: "s2", productId: "o1", qty: 1, unitPrice: 1000, date: "2026-10-02", createdAt: 0 },
  { id: "s3", productId: "other", qty: 1, unitPrice: 5000, date: "2026-10-02", createdAt: 0 },
] as unknown as Sale[];
// s1 had a 300 discount on it; s2 has no economics row (falls back to the billed 1,000).
const econ = [
  { saleId: "s1", revenue: 1700, grossRevenue: 2000, discountedAmount: 300, cogs: 600 },
  { saleId: "s3", revenue: 5000, grossRevenue: 5000, discountedAmount: 0, cogs: 0 },
] as unknown as SaleEconomics[];

const st = computeOfferStats([offer], sales, econ).get("o1")!;
ok(st.timesSold === 3, "units sold counted gross (3), got " + st.timesSold);
ok(st.revenue === 2700, "revenue is net of the discount: 1,700 + 1,000 = 2,700, got " + st.revenue);
ok(st.cost === 600, "cost from ledger COGS = 600, got " + st.cost);
ok(st.margin === 2100, "margin = 2,100 (not 2,400 off list price), got " + st.margin);
ok(Math.abs(st.marginPct - (2100 / 2700) * 100) < 1e-9, "margin % on net revenue, got " + st.marginPct);

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
