// A business that mixes goods, pure services and a productized (fixed-price,
// recipe-costed) service must produce coherent books. Runs the real calculation
// code on one such business and checks: the Balance Sheet balances, services
// never enter inventory, recipe costs land in COGS, and credit services age as
// receivables. Also pins WHY the UI hides "oversold" for services: the ledger
// reports a negative on-hand for a service sold with no cost entry logged, which
// is correct cost math but not a stock warning (app/dashboard, app/sales).
// Run: npx tsx scripts/verify-mixed-business.ts
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import type { CapitalEntry, Product, Purchase, Sale } from "../lib/types";

let failed = false;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); failed = true; } else console.log("OK:", m); };
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const now = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const first = iso(new Date(now.getFullYear(), now.getMonth(), 1)); // same month: always <= today
const TODAY = iso(now);
const later = iso(new Date(now.getFullYear(), now.getMonth() + 1, 15));

const products = [
  { id: "gadget", name: "Gadget", type: "product", active: true, createdAt: 0 },
  { id: "consult", name: "Consulting hour", type: "service", active: true, createdAt: 0, laborCostPerUnit: 800 },
  { id: "audit", name: "Website audit", type: "service", active: true, createdAt: 0, defaultSellPrice: 25000,
    recipeLines: [{ id: "a", label: "Contractor", category: "x", amount: 8000 }, { id: "b", label: "Tools", category: "x", amount: 1000 }] },
] as unknown as Product[];
const purchases = [
  { id: "p1", productId: "gadget", qty: 10, unitCost: 1000, date: first, createdAt: 1 },
  // what fulfillOffer logs: qty x the recipe total, so cost is recognised at delivery
  { id: "p2", productId: "audit", qty: 2, unitCost: 9000, date: first, supplier: "Offer fulfillment", createdAt: 2 },
] as unknown as Purchase[];
const sales = [
  { id: "s1", productId: "gadget", qty: 3, unitPrice: 2000, date: first, paymentMethod: "cash", createdAt: 3 },
  { id: "s2", productId: "consult", qty: 5, unitPrice: 3000, date: first, paymentMethod: "cash", createdAt: 4 },
  { id: "s3", productId: "consult", qty: 2, unitPrice: 3000, date: first, paymentMethod: "credit", creditTermDays: 30, dueDate: later, customer: "Acme", createdAt: 5 },
  { id: "s4", productId: "audit", qty: 2, unitPrice: 25000, date: first, paymentMethod: "cash", createdAt: 6 },
] as unknown as Sale[];
const capital = [{ id: "c", kind: "investment", amount: 100000, date: first, createdAt: 0 }] as unknown as CapitalEntry[];

const ledgers = computeAllLedgers(products, purchases, sales);
const econ = computeSaleEconomics(sales, ledgers, []);
const byId = new Map(econ.map((e) => [e.saleId, e]));
const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], capital, 0, 0, [], [], [], [], []);
const ar = computeReceivablesAging(products, sales, econ, [], TODAY, [], []);
const ap = computePayablesAging(products, purchases, [], TODAY, []);
const inv = currentInventoryValue(ledgers);
const bs = computeBalanceSheet(pnl, inv, [], computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, ap.totalOutstanding, [], 0);

assert(bs.balances, "goods + services + productized offer: the Balance Sheet balances");
assert(near(inv, 7000), "inventory is only the 7 unsold gadgets (services never sit in stock)");
assert(near(byId.get("s1")!.cogs, 3000) && near(byId.get("s4")!.cogs, 18000), "gadget COGS and the offer's recipe cost (2 x 9,000) reach gross profit");
assert(near(byId.get("s2")!.cogs, 0) && near(byId.get("s2")!.grossProfit, 15000), "a pure service with no cost entry books its full price as gross profit");
assert(near(ar.totalOutstanding, 6000) && ar.lines[0]?.customer === "Acme", "a credit service is a receivable like any credit sale");
assert(near(pnl.reduce((s, m) => s + m.salesRevenue, 0), 6000 + 15000 + 6000 + 50000), "revenue mixes goods and services (77,000)");
const consultLedger = ledgers.get("consult")!;
assert(consultLedger.qtyOnHand < 0 && byId.get("s2")!.oversold === true,
  "pin: the ledger flags a cost-less service as 'oversold' — so the UI must hide that badge/warning for type 'service'");
if (failed) process.exit(1);
console.log("\nAll mixed-business checks passed.");
