// End-to-end books for several kinds of business, through the real calculation code, against hand-worked numbers.
// Each scenario checks that the Balance Sheet balances and that profit, stock and cash are what arithmetic says.
// Run: npx tsx scripts/verify-business-models.ts
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import type { CapitalEntry, Product, Purchase, Sale, StockAdjustment } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const now = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const D = iso(new Date(now.getFullYear(), now.getMonth(), 1)); // first of this month: never in the future
const TODAY = iso(now);
const later = iso(new Date(now.getFullYear(), now.getMonth() + 1, 15));
const capital = (amount: number) => [{ id: "c", kind: "investment", amount, date: D, createdAt: 0 }] as unknown as CapitalEntry[];

function books(products: Product[], purchases: Purchase[], sales: Sale[], adjustments: StockAdjustment[], cap: CapitalEntry[]) {
  const ledgers = computeAllLedgers(products, purchases, sales, [], adjustments);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const adjValues = adjustments.filter((a) => a.reason !== "production_use").map((a) => ({ date: a.date, value: ledgers.get(a.productId)?.adjustmentValue.get(a.id) ?? 0 }));
  const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], cap, 0, 0, [], [], [], [], [], adjValues);
  const ar = computeReceivablesAging(products, sales, econ, [], TODAY, [], []);
  const ap = computePayablesAging(products, purchases, [], TODAY, []);
  const inv = currentInventoryValue(ledgers);
  const bs = computeBalanceSheet(pnl, inv, [], computeCapitalSummary(cap, pnl), TODAY, [], ar.totalOutstanding, ap.totalOutstanding, [], 0);
  const month = pnl.find((m) => m.month === D.slice(0, 7))!;
  return { ledgers, econ, pnl, month, ar, ap, inv, bs };
}
const goods = (id: string) => ({ id, name: id, type: "product", active: true, createdAt: 0 }) as unknown as Product;
const service = (id: string) => ({ id, name: id, type: "service", active: true, createdAt: 0 }) as unknown as Product;

// 1. A reseller, with a stock count. Bought 10 at 100 (cash), sold 4 at 250 (cash): cost 400, revenue 1,000.
//    A count finds 2 missing (-200 at average cost) and 1 extra (+100). Net shrinkage 100. Profit 1,000 - 400 - 100 = 500.
{
  const purchases = [{ id: "p", productId: "g", qty: 10, unitCost: 100, date: D, createdAt: 1 }] as unknown as Purchase[];
  const sales = [{ id: "s", productId: "g", qty: 4, unitPrice: 250, date: D, paymentMethod: "cash", createdAt: 2 }] as unknown as Sale[];
  const adj = [
    { id: "a1", productId: "g", qty: -2, reason: "count_correction", date: D, createdAt: 3 },
    { id: "a2", productId: "g", qty: 1, reason: "count_correction", date: D, createdAt: 4 },
  ] as unknown as StockAdjustment[];
  const b = books([goods("g")], purchases, sales, adj, capital(100000));
  ok(near(b.month.stockShrinkage, 100), "reseller: a count that finds 2 missing (200) and 1 extra (100) books net stock shrinkage of 100");
  ok(near(b.month.netProfitPreTax, 500), "reseller: profit = 1,000 revenue - 400 cost - 100 shrinkage = 500 (a stock count DOES move profit)");
  ok(near(b.inv, 500) && b.ledgers.get("g")!.qtyOnHand === 5, "reseller: 5 units left at 100 = 500");
  ok(b.bs.balances, "reseller: the Balance Sheet balances after the count");
}

// 2. Dropshipper: the order is logged, then the supplier purchase for it. Sold 3 at 50, supplier charged 20 each.
{
  const sales = [{ id: "s", productId: "g", qty: 3, unitPrice: 50, date: D, paymentMethod: "cash", createdAt: 1 }] as unknown as Sale[];
  const purchases = [{ id: "p", productId: "g", qty: 3, unitCost: 20, date: D, createdAt: 2 }] as unknown as Purchase[];
  const b = books([goods("g")], purchases, sales, [], capital(1000));
  ok(near(b.month.netProfitPreTax, 90) && near(b.econ[0].cogs, 60), "dropshipper (sale logged before purchase): cost 60, profit 90, as if bought first");
  ok(b.inv === 0 && b.bs.balances, "dropshipper: no stock left, books balance");
}

// 3. Service business: a staged-billing milestone (recorded as a credit sale) and a billed late fee, both owed.
{
  const sales = [
    { id: "m", productId: "svc", qty: 1, unitPrice: 50000, date: D, paymentMethod: "credit", creditTermDays: 30, dueDate: later, customer: "Acme", invoiceId: "ms_1", createdAt: 1 },
    { id: "f", productId: "fee", qty: 1, unitPrice: 500, date: D, paymentMethod: "credit", creditTermDays: 30, dueDate: later, customer: "Acme", invoiceId: "lf_1", lateFeeForKey: "inv:old", createdAt: 2 },
  ] as unknown as Sale[];
  const b = books([service("svc"), service("fee")], [], sales, [], capital(10000));
  ok(near(b.month.salesRevenue, 50500) && near(b.month.netProfitPreTax, 50500), "service business: milestone and late fee are revenue, no cost, profit 50,500");
  ok(near(b.ar.totalOutstanding, 50500), "service business: both are owed (receivables 50,500)");
  ok(b.bs.balances, "service business: the Balance Sheet balances with receivables and no stock");
}

// 4. Goods bought on supplier credit, partly sold, with a loss: payables, receivables and shrinkage together.
{
  const purchases = [{ id: "p", productId: "g", qty: 20, unitCost: 50, date: D, paymentMethod: "credit", supplier: "Sup", creditTermDays: 30, dueDate: later, createdAt: 1 }] as unknown as Purchase[];
  const sales = [
    { id: "s1", productId: "g", qty: 8, unitPrice: 90, date: D, paymentMethod: "cash", createdAt: 2 },
    { id: "s2", productId: "g", qty: 4, unitPrice: 90, date: D, paymentMethod: "credit", creditTermDays: 14, dueDate: later, customer: "Zed", createdAt: 3 },
  ] as unknown as Sale[];
  const adj = [{ id: "a", productId: "g", qty: -3, reason: "damaged", date: D, createdAt: 4 }] as unknown as StockAdjustment[];
  const b = books([goods("g")], purchases, sales, adj, capital(5000));
  // revenue 12 x 90 = 1,080; cost 12 x 50 = 600; damaged 3 x 50 = 150; profit 330. Stock 5 x 50 = 250.
  ok(near(b.month.netProfitPreTax, 330) && near(b.inv, 250), "supplier credit + credit sale + damage: profit 330, stock 250");
  ok(near(b.ap.totalOutstanding, 1000) && near(b.ar.totalOutstanding, 360), "owed to the supplier 1,000, owed by the customer 360");
  ok(b.bs.balances, "supplier credit + credit sale + damage: the Balance Sheet balances");
}

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
