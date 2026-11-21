// Empirical check for stock-out costing (lib/stockOuts.ts): the lost revenue and margin come only from what was
// logged, and a lost sale is a memo that cannot move the books.
// Run: npx tsx scripts/verify-stock-outs.ts
import { shortfall, stockOutMargin, stockOutRevenue, stockOutsByProduct, summarizeStockOuts } from "../lib/stockOuts";
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import type { CapitalEntry, Product, Purchase, Sale, StockOut } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const so = (o: Partial<StockOut> & { id: string; productId: string; qty: number; unitPrice: number; date: string }): StockOut => ({ createdAt: 1, ...o } as StockOut);

// One entry: 5 wanted, price 100, cost 60 -> sales lost 500, margin lost 200.
const a = so({ id: "a", productId: "w", qty: 5, unitPrice: 100, unitCost: 60, date: "2026-09-10" });
assert(stockOutRevenue(a) === 500 && stockOutMargin(a) === 200, "5 x (100 price, 60 cost): 500 of sales and 200 of margin lost");
assert(stockOutMargin(so({ id: "b", productId: "w", qty: 2, unitPrice: 50, date: "2026-09-10" })) === 100, "no cost recorded: the whole price is counted, never a guessed cost");
assert(stockOutMargin(so({ id: "c", productId: "w", qty: 4, unitPrice: 40, unitCost: 50, date: "2026-09-10" })) === -40, "below-cost price shows a negative margin rather than hiding it");
assert(stockOutRevenue(so({ id: "d", productId: "w", qty: -3, unitPrice: 10, date: "2026-09-10" })) === 0, "a negative quantity can't produce lost sales");
assert(stockOutRevenue(so({ id: "e", productId: "w", qty: NaN, unitPrice: 10, date: "2026-09-10" })) === 0, "junk quantity is ignored, not NaN");

// Summaries and the window.
const list = [
  a,
  so({ id: "f", productId: "w", qty: 3, unitPrice: 100, unitCost: 60, date: "2026-10-01" }),
  so({ id: "g", productId: "x", qty: 10, unitPrice: 20, unitCost: 5, date: "2026-10-05" }),
  so({ id: "h", productId: "x", qty: 1, unitPrice: 20, unitCost: 5, date: "2026-06-01" }),
  so({ id: "z", productId: "x", qty: 0, unitPrice: 20, unitCost: 5, date: "2026-10-05" }),
];
const all = summarizeStockOuts(list);
assert(all.events === 4 && all.units === 19, "zero-quantity entries are not counted as events");
assert(near(all.lostRevenue, 500 + 300 + 200 + 20) && near(all.lostMargin, 200 + 120 + 150 + 15), "totals add up entry by entry");
const win = summarizeStockOuts(list, { fromISO: "2026-09-01" });
assert(win.events === 3 && near(win.lostMargin, 200 + 120 + 150), "the window leaves out older entries");
assert(summarizeStockOuts(list, { fromISO: "2026-09-01", toISO: "2026-09-30" }).events === 1, "an upper bound works too");
assert(summarizeStockOuts([]).events === 0 && summarizeStockOuts([]).lostMargin === 0, "nothing logged is exactly zero");

const by = stockOutsByProduct(list, [{ id: "w", name: "Widget" }, { id: "x", name: "Gadget" }], { fromISO: "2026-09-01" });
assert(by.length === 2 && by[0].productId === "w" && by[0].productName === "Widget", "the item that cost most margin is first");
assert(by[0].units === 8 && by[0].events === 2 && by[0].lastDate === "2026-10-01", "per-item units, times and last date");
assert(stockOutsByProduct([so({ id: "q", productId: "gone", qty: 1, unitPrice: 1, date: "2026-10-01" })], []).at(0)?.productName === "—", "a deleted product still shows its loss, named with a dash");

assert(shortfall(10, 6) === 4 && shortfall(6, 6) === 0 && shortfall(3, 6) === 0 && shortfall(5, 0) === 5, "shortfall is wanted minus on hand, never negative");
assert(shortfall(5, -2) === 5 && shortfall(NaN, 3) === 0, "negative stock and junk are safe");

// A lost sale is a memo: the engine takes no stock-out input, so nothing it computes can differ. Prove the books
// are identical with and without any number of entries by running them through the real functions.
{
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const NOW = new Date();
  const day = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
  const P: Product[] = [{ id: "w", name: "Widget", sku: "W", category: "", type: "product", active: true, createdAt: 0 } as Product];
  const pu: Purchase[] = [{ id: "p", productId: "w", qty: 10, unitCost: 60, date: day(30), paymentMethod: "cash", createdAt: 1 } as Purchase];
  const sa: Sale[] = [{ id: "s", productId: "w", qty: 10, unitPrice: 100, date: day(5), paymentMethod: "cash", createdAt: 2 } as Sale];
  const cap: CapitalEntry[] = [{ id: "c", kind: "investment", amount: 100000, date: day(400), createdAt: 1 } as CapitalEntry];
  const run = () => {
    const l = computeAllLedgers(P, pu, sa, [], [], []);
    const e = computeSaleEconomics(sa, l, []);
    const m = computeMonthlyPnL(sa, e, [], pu, [], cap, 0);
    const b = computeBalanceSheet(m, currentInventoryValue(l), [], computeCapitalSummary(cap, m), day(0), [], 0, 0, [], 0);
    return JSON.stringify({ q: l.get("w")!.qtyOnHand, m, b });
  };
  const before = run();
  summarizeStockOuts(list); stockOutsByProduct(list, []);
  assert(run() === before, "logging and summarising lost sales leaves stock, profit, cash and the balance sheet exactly as they were");
}

console.log(`\n${pass} passed, ${fail} failed`);
