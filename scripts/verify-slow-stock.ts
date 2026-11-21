// Empirical check for slow-stock detection (lib/stockHealth.ts), run against the REAL ledger maths.
// Run: npx tsx scripts/verify-slow-stock.ts
import { computeAllLedgers } from "../lib/calculations";
import { computeSlowStock } from "../lib/stockHealth";
import type { Product, Purchase, Sale } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const prod = (id: string, over: Partial<Product> = {}): Product =>
  ({ id, name: id, sku: id, category: "", type: "product", active: true, ...over } as Product);
const buy = (id: string, productId: string, qty: number, unitCost: number, date: string): Purchase =>
  ({ id, productId, qty, unitCost, date, createdAt: Date.parse(date) } as Purchase);
const sell = (id: string, productId: string, qty: number, unitPrice: number, date: string): Sale =>
  ({ id, productId, qty, unitPrice, date, createdAt: Date.parse(date), paymentMethod: "cash" } as Sale);

const AS_OF = "2026-10-06";
const products = [
  prod("fresh"), prod("selling"), prod("stale"), prod("never"), prod("gone"), prod("svc", { type: "service" }),
  prod("off", { active: false }), prod("empty"), prod("unknown"),
];
const purchases = [
  buy("p1", "fresh", 10, 10, "2026-09-20"),     // bought 16 days ago, never sold -> NOT slow (new)
  buy("p2", "selling", 10, 10, "2026-05-01"),   // old stock but sold recently -> NOT slow
  buy("p3", "stale", 10, 20, "2026-04-01"),     // last sale long ago -> slow, value 5 x 20 = 100
  buy("p4", "never", 4, 50, "2026-06-01"),      // bought 127 days ago, never sold -> slow, value 200
  buy("p5", "gone", 5, 10, "2026-03-01"),       // fully sold out -> nothing on hand
  buy("p6", "off", 10, 10, "2026-03-01"),       // inactive -> ignored
  buy("p7", "svc", 10, 10, "2026-03-01"),       // service -> ignored
];
const sales = [
  sell("s1", "selling", 2, 15, "2026-10-01"),
  sell("s2", "stale", 5, 30, "2026-05-10"),
  sell("s3", "gone", 5, 15, "2026-04-01"),
];
const ledgers = computeAllLedgers(products, purchases, sales);
const r = computeSlowStock(products, ledgers, sales, purchases, AS_OF);
const ids = r.items.map((i) => i.productId);

assert(ids.length === 2 && ids.includes("stale") && ids.includes("never"), "only the stale and never-sold items are flagged");
assert(!ids.includes("fresh"), "stock bought 16 days ago is never flagged, even though it has not sold");
assert(!ids.includes("selling"), "old stock that is still selling is not flagged");
assert(!ids.includes("gone") && !ids.includes("empty"), "sold-out and empty items are not flagged");
assert(!ids.includes("svc") && !ids.includes("off"), "services and inactive items are ignored");
assert(!ids.includes("unknown"), "an item with no purchase and no sale is left out, not guessed at");
assert(ids[0] === "never", "biggest tied-up value comes first");
const never = r.items.find((i) => i.productId === "never")!;
const stale = r.items.find((i) => i.productId === "stale")!;
assert(never.neverSold && never.lastSoldDate === null && never.idleDays === 127, "never-sold item counts idle days from first purchase");
assert(!stale.neverSold && stale.lastSoldDate === "2026-05-10" && stale.idleDays === 149, "sold item counts idle days from last sale");
assert(Math.abs(never.value - 200) < 1e-9 && Math.abs(stale.value - 100) < 1e-9, "values are stock at cost");
assert(Math.abs(r.totalValue - 300) < 1e-9, "total tied-up value is the sum of the flagged items");
const inv = [...ledgers.values()].reduce((s, l) => s + l.inventoryValue, 0);
assert(Math.abs(r.totalInventoryValue - inv) < 1e-9, "total stock value matches the stock ledgers (same figure as the Balance Sheet)");
assert(r.sharePct > 0 && r.sharePct <= 100 && Math.abs(r.sharePct - (300 / inv) * 100) < 1e-9, "share of stock value is correct and within 0-100");
const strict = computeSlowStock(products, ledgers, sales, purchases, AS_OF, 150);
assert(strict.items.length === 0 || strict.items.every((i) => i.idleDays >= 150), "a longer threshold only keeps items idle at least that long");
const future = computeSlowStock(products, ledgers, [...sales, sell("sf", "stale", 1, 30, "2027-01-01")], purchases, AS_OF);
assert(future.items.some((i) => i.productId === "stale" && i.idleDays === 149), "a sale dated in the future does not reset the clock");
const none = computeSlowStock([], new Map(), [], [], AS_OF);
assert(none.items.length === 0 && none.sharePct === 0 && none.totalValue === 0, "an empty business gives an empty, safe result");
const badDate = computeSlowStock(products, ledgers, sales, purchases, "not-a-date");
assert(badDate.items.length === 0, "an invalid as-of date yields nothing instead of crashing");
