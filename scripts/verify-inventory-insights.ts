// Empirical check for stock over time (lib/inventoryInsights.ts): month-end stock value is a faithful replay of
// the weighted-average-cost ledger, days of cover use the recent selling pace, and slow stock is told apart from
// stock that simply arrived recently.
//
// Run: npx tsx scripts/verify-inventory-insights.ts
import { computeAllLedgers, currentInventoryValue } from "../lib/calculations";
import { computeStockCover, stockValueHistory } from "../lib/inventoryInsights";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, t = 0.01) => Math.abs(a - b) <= t;

let seq = 0;
const prod = (id: string, name = id): any => ({ id, name, sku: id, type: "product", createdAt: 1 });
const buy = (productId: string, date: string, qty: number, unitCost: number): any => ({ id: "b" + ++seq, productId, date, qty, unitCost, createdAt: seq });
const sell = (productId: string, date: string, qty: number, unitPrice = 200): any => ({ id: "s" + ++seq, productId, date, qty, unitPrice, createdAt: seq });
const adj = (productId: string, date: string, qty: number): any => ({ id: "a" + ++seq, productId, date, qty, reason: "count", createdAt: seq });
const ret = (productId: string, saleId: string, date: string, qty: number): any => ({ id: "r" + ++seq, productId, saleId, date, qty, restock: true, refundAmount: 0, reason: "other", createdAt: seq });

// 1. Hand-worked example: each month-end is exactly what the ledger says on that day.
{
  const products = [prod("A")];
  const purchases = [buy("A", "2026-01-05", 10, 100), buy("A", "2026-03-03", 10, 120)];
  const sales = [sell("A", "2026-02-10", 4)];
  const h = stockValueHistory(products, purchases, sales, [], [], "2026-04-10", 5);
  assert(h.length === 5, "five points");
  assert(h.map((p) => p.date).join() === "2025-12-31,2026-01-31,2026-02-28,2026-03-31,2026-04-10", `dates are month-ends, then today (${h.map((p) => p.date).join()})`);
  assert(near(h[0].value, 0) && h[0].units === 0, "before anything was bought: nothing");
  assert(near(h[1].value, 1000) && h[1].units === 10, "end of Jan: 10 units at 100");
  assert(near(h[2].value, 600) && h[2].units === 6, "end of Feb: 6 units left at 100");
  assert(near(h[3].value, 6 * 100 + 10 * 120) && h[3].units === 16, "end of Mar: weighted average over 16 units");
  assert(near(h[4].value, h[3].value), "today equals the last month-end when nothing happened in April");
}

// 2. The last point always equals what the rest of the app calls today's inventory (returns and adjustments included).
{
  const products = [prod("A"), prod("B"), prod("C")];
  const purchases = [buy("A", "2026-01-02", 50, 10), buy("B", "2026-02-02", 20, 55.5), buy("A", "2026-03-15", 25, 12), buy("C", "2026-03-20", 5, 900)];
  const s1 = sell("A", "2026-03-01", 30), s2 = sell("B", "2026-03-05", 8);
  const sales = [s1, s2, sell("C", "2026-04-01", 1)];
  const returns = [ret("A", s1.id, "2026-03-10", 2)];
  const adjustments = [adj("B", "2026-03-31", -3), adj("A", "2026-04-02", 4)];
  const asOf = "2026-04-20";
  const h = stockValueHistory(products, purchases, sales, returns, adjustments, asOf, 12);
  const today = currentInventoryValue(computeAllLedgers(products, purchases, sales, returns, adjustments));
  assert(near(h[h.length - 1].value, today, 1e-6), `latest point equals today's inventory (${h[h.length - 1].value.toFixed(2)} vs ${today.toFixed(2)})`);
  assert(h.every((p) => Number.isFinite(p.value) && p.value >= 0), "every point is a sane, non-negative number");
  const mar = h.find((p) => p.date === "2026-03-31")!;
  const marLedger = currentInventoryValue(computeAllLedgers(products, purchases.filter((x) => x.date <= "2026-03-31"), sales.filter((x) => x.date <= "2026-03-31"), returns.filter((x) => x.date <= "2026-03-31"), adjustments.filter((x) => x.date <= "2026-03-31")));
  assert(near(mar.value, marLedger, 1e-6), "a past month-end matches replaying the ledger up to that day");
}

// 3. Overselling never shows negative stock value, and a year-boundary replay is right.
{
  const products = [prod("A")];
  const h = stockValueHistory(products, [buy("A", "2025-11-10", 5, 10)], [sell("A", "2025-12-05", 9)], [], [], "2026-02-15", 4);
  assert(h.every((p) => p.value >= 0 && p.units >= 0), "oversold stock is clamped at zero");
  assert(h[0].date === "2025-11-30" && h[1].date === "2025-12-31" && h[2].date === "2026-01-31", "month-ends across a year boundary");
}

// 4. Days of cover use the recent pace; slow stock needs a fair chance to sell.
{
  const asOf = "2026-06-30";
  const products = [prod("FAST"), prod("SLOW"), prod("OLDSALE"), prod("NEW"), prod("GONE")];
  const purchases = [
    buy("FAST", "2026-03-01", 100, 10), buy("SLOW", "2026-01-01", 40, 50), buy("OLDSALE", "2025-11-01", 10, 200),
    buy("NEW", "2026-06-20", 30, 80), buy("GONE", "2026-04-01", 5, 10),
  ];
  const sales = [
    sell("FAST", "2026-04-15", 30), sell("FAST", "2026-05-20", 30), sell("FAST", "2026-06-25", 30), // 90 units in the trailing 90 days
    sell("OLDSALE", "2026-02-01", 2),
    sell("GONE", "2026-04-02", 5),
  ];
  const ledgers = computeAllLedgers(products, purchases, sales);
  const c = computeStockCover(products, ledgers, purchases, sales, asOf);
  const fast = c.runningLow.find((x) => x.productId === "FAST");
  assert(!!fast && fast.coverDays !== null && fast.coverDays < 30, "a fast seller with 10 units left and ~1 a day is running low");
  assert(c.slow.some((x) => x.productId === "SLOW"), "never sold, on the shelf 6 months: slow");
  assert(c.slow.some((x) => x.productId === "OLDSALE"), "last sale over 90 days ago: slow");
  assert(!c.slow.some((x) => x.productId === "NEW"), "arrived 10 days ago and hasn't sold yet: NOT slow");
  assert(!c.slow.some((x) => x.productId === "GONE") && !c.runningLow.some((x) => x.productId === "GONE"), "sold out: in neither list");
  assert(!c.runningLow.some((x) => x.productId === "SLOW"), "slow stock isn't also flagged as running out");
  assert(c.slow[0].value >= c.slow[c.slow.length - 1].value, "slow stock is sorted by cash tied up");
  const expectSlow = 40 * 50 + 8 * 200;
  assert(near(c.slowValue, expectSlow), `cash tied up in slow stock = ${expectSlow} (got ${c.slowValue})`);
  assert(c.slowSharePct !== null && near(c.slowSharePct, (expectSlow / c.totalValue) * 100, 1e-6), "share of stock value is slow stock / all stock");
  assert(near(c.totalValue, currentInventoryValue(ledgers), 1e-6), "total matches the ledger total");
}

// 5. Nothing in stock, no products, and bad input never crash or produce NaN.
{
  const empty = computeStockCover([], new Map(), [], [], "2026-06-30");
  assert(empty.totalValue === 0 && empty.slowSharePct === null && empty.slow.length === 0 && empty.runningLow.length === 0, "an empty business is harmless");
  const h = stockValueHistory([], [], [], [], [], "2026-06-30", 6);
  assert(h.length === 6 && h.every((p) => p.value === 0), "no products: flat zero history");
  assert(stockValueHistory([], [], [], [], [], "2026-06-30", 0).length === 1 && stockValueHistory([], [], [], [], [], "2026-06-30", 999).length === 60, "the number of months is bounded");
}

console.log(`\nverify-inventory-insights: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
