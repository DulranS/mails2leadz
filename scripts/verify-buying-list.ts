// "What to order now" (lib/buyingList.ts): which stock items are at their reorder point, how much to buy, from whom,
// what it costs, and what the cash allows. Hand-worked numbers.
// Run: npx tsx scripts/verify-buying-list.ts
import { computeBuyingList, splitByBudget } from "../lib/buyingList";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const prod = (id: string, o: any = {}) => ({ id, name: `Item ${id}`, sku: id, category: "x", type: "product", active: true, ...o }) as any;
const buy = (productId: string, o: any) => ({ id: `b${Math.random()}`, productId, qty: 10, unitCost: 12, date: "2026-09-01", supplier: "Globex", createdAt: 1, ...o }) as any;
const eoq = (o: any = {}) => ({ eoq: 100, reorderPoint: 50, dailyDemand: 5, ...o });
const build = (o: any) => computeBuyingList({ products: [], qtyOnHand: new Map(), onOrder: new Map(), eoq: new Map(), wac: new Map(), purchases: [], ...o });

// Position = on hand 20 + on order 10 = 30, at or below reorder point 50: order up to 50 + 100 = 150 => buy 120.
let l = build({ products: [prod("p1")], qtyOnHand: new Map([["p1", 20]]), onOrder: new Map([["p1", 10]]), eoq: new Map([["p1", eoq()]]), purchases: [buy("p1", {})] });
ok(l.lines.length === 1 && l.lines[0].suggestQty === 120, "position 30, rp 50, eoq 100 => buy 120");
ok(near(l.lines[0].unitCost, 12) && near(l.lines[0].lineCost, 1440) && near(l.total, 1440), "120 x 12 = 1,440");
ok(l.lines[0].supplier === "Globex" && near(l.lines[0].coverDays!, 4), "last supplier; 20 on hand / 5 a day = 4 days of cover");

// Exactly at the reorder point counts; one above does not; stock on order can lift it clear.
const at = (qty: number, on = 0) => build({ products: [prod("p1")], qtyOnHand: new Map([["p1", qty]]), onOrder: new Map([["p1", on]]), eoq: new Map([["p1", eoq()]]) }).lines.length;
ok(at(50) === 1 && at(51) === 0, "at the reorder point triggers, one above does not");
ok(at(20, 100) === 0, "20 on hand + 100 already on order is clear of the reorder point");

// Never less than one batch; well below the reorder point buys up to reorder point + batch.
l = build({ products: [prod("p1")], qtyOnHand: new Map([["p1", 49]]), eoq: new Map([["p1", eoq()]]) });
ok(l.lines[0].suggestQty === 101 || l.lines[0].suggestQty === 100 + 1, "49 on hand => 50 + 100 - 49 = 101");
l = build({ products: [prod("p1")], qtyOnHand: new Map([["p1", 50]]), eoq: new Map([["p1", eoq()]]) });
ok(l.lines[0].suggestQty === 100, "exactly at the reorder point => one batch");
l = build({ products: [prod("p1")], qtyOnHand: new Map([["p1", 0]]), eoq: new Map([["p1", eoq({ eoq: 20 })]]) });
ok(l.lines[0].suggestQty === 70, "a small batch of 20 from empty still buys 50 + 20 - 0 = 70, not 20 (which would trigger again at once)");
l = build({ products: [prod("p1")], qtyOnHand: new Map([["p1", 30]]), eoq: new Map([["p1", eoq({ eoq: 99.2, reorderPoint: 50.4 })]]) });
ok(l.lines[0].suggestQty === Math.ceil(50.4 + 99.2 - 30), "fractional figures round the quantity up to a whole unit");

// Who is skipped: services, inactive, no sales history, plenty of stock.
l = build({
  products: [prod("s", { type: "service" }), prod("i", { active: false }), prod("n"), prod("h")],
  qtyOnHand: new Map([["s", 0], ["i", 0], ["n", 0], ["h", 900]]),
  eoq: new Map([["s", eoq()], ["i", eoq()], ["n", eoq({ eoq: 0, reorderPoint: 0 })], ["h", eoq()]]),
});
ok(l.lines.length === 0, "services, inactive items, items with no history and well-stocked items are not listed");

// Cost: latest purchase wins (by date, whatever the input order); else the average cost; else unknown.
l = build({
  products: [prod("p1"), prod("p2"), prod("p3")],
  qtyOnHand: new Map(),
  eoq: new Map([["p1", eoq()], ["p2", eoq()], ["p3", eoq()]]),
  wac: new Map([["p2", 7]]),
  purchases: [buy("p1", { date: "2026-09-20", unitCost: 15, supplier: "Newer" }), buy("p1", { date: "2026-08-01", unitCost: 10, supplier: "Older" })],
});
const by = (id: string) => l.lines.find((x) => x.productId === id)!;
ok(near(by("p1").unitCost, 15) && by("p1").supplier === "Newer", "newest purchase gives the cost and supplier even when supplied oldest-last");
ok(near(by("p2").unitCost, 7) && by("p2").supplier === null, "no purchases: falls back to average cost, no supplier");
ok(!by("p3").costKnown && by("p3").lineCost === 0 && l.unknownCostCount === 1, "no cost at all: flagged, not guessed");
ok(near(l.total, by("p1").lineCost + by("p2").lineCost), "total excludes the unpriced line");

// Grouping: one group per supplier (case-insensitive), biggest first, no-supplier group last; urgent lines first.
l = build({
  products: [prod("a"), prod("b"), prod("c"), prod("d")],
  qtyOnHand: new Map([["a", 40], ["b", 10], ["c", 30], ["d", 5]]),
  eoq: new Map(["a", "b", "c", "d"].map((id) => [id, eoq()] as const)),
  purchases: [buy("a", { supplier: "Globex", unitCost: 10 }), buy("b", { supplier: "globex ", unitCost: 10 }), buy("c", { supplier: "Initech", unitCost: 100 })],
});
ok(l.groups.length === 3, "Globex / globex are one group; Initech; and one with no supplier");
ok(l.groups[0].supplier === "Initech" && l.groups[l.groups.length - 1].supplier === null, "biggest total first, no-supplier last");
const globex = l.groups.find((g) => g.supplier?.toLowerCase().trim() === "globex")!;
ok(globex.lines.length === 2 && globex.lines[0].productId === "b", "inside a group the item with least cover comes first");
ok(l.lines[0].productId === "d", "overall most urgent first (5 on hand)");

// Budget split: urgent first, a line that does not fit is deferred and the walk continues.
const L = (id: string, cost: number, cover: number, known = true) => ({ productId: id, name: id, sku: id, supplier: null, onHand: 0, onOrder: 0, reorderPoint: 1, suggestQty: 1, unitCost: cost, costKnown: known, lineCost: known ? cost : 0, coverDays: cover }) as any;
let s = splitByBudget([L("a", 1000, 1), L("b", 5000, 2), L("c", 800, 3)], 2000);
ok(s.afford.map((x) => x.productId).join() === "a,c" && s.defer.map((x) => x.productId).join() === "b" && near(s.spend, 1800), "1,000 and 800 fit in 2,000; the 5,000 is deferred");
s = splitByBudget([L("a", 1000, 1)], 1000);
ok(s.afford.length === 1 && s.defer.length === 0, "a line exactly equal to the budget fits");
s = splitByBudget([L("a", 1000, 1), L("u", 0, 2, false)], 0);
ok(s.afford.length === 0 && s.defer.length === 1 && s.unpriced.length === 1, "zero budget affords nothing; unpriced lines are listed separately");
s = splitByBudget([L("a", 1000, 1)], -500);
ok(s.afford.length === 0 && s.spend === 0, "a negative budget is treated as zero");

// Does not mutate inputs.
const inputProducts = [prod("p1")];
const inputPurchases = [buy("p1", { date: "2026-09-20" }), buy("p1", { date: "2026-08-01" })];
const snap = JSON.stringify([inputProducts, inputPurchases]);
build({ products: inputProducts, qtyOnHand: new Map([["p1", 1]]), eoq: new Map([["p1", eoq()]]), purchases: inputPurchases });
ok(JSON.stringify([inputProducts, inputPurchases]) === snap, "inputs untouched");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
