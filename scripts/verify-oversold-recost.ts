// Selling before buying: when the purchase arrives, the units already sold are re-costed at what it really cost.
// Hand-worked numbers, plus a conservation check over random sequences.
// Run: npx tsx scripts/verify-oversold-recost.ts
import { computeProductLedger } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
let t = 0;
const P = (id: string, qty: number, unitCost: number, date = "2026-10-01") => ({ id, productId: "x", qty, unitCost, date, createdAt: ++t }) as any;
const S = (id: string, qty: number, date = "2026-10-01") => ({ id, productId: "x", qty, unitPrice: 100, date, createdAt: ++t }) as any;

// 1. Never bought: sold 3, then bought 3 at 20 -> cost 60, stock 0, average 20.
{
  const sale = S("s", 3), buy = P("p", 3, 20);
  const r = computeProductLedger([buy], [sale]);
  ok(near(r.saleCogs.get("s")!.cogsTotal, 60) && near(r.saleCogs.get("s")!.cogsPerUnit, 20) && r.qtyOnHand === 0 && near(r.wac, 20), "never bought, then 3 at 20: cost 60 (20 each), stock 0, average 20");
}
// 2. Bought before: 5 at 10, sold 5, sold 3 more (provisional 10 each = 30), then 4 at 12 -> 3 re-costed at 12 = 36; 1 left at 12.
{
  const [p1, s1, s2, p2] = [P("p1", 5, 10), S("s1", 5), S("s2", 3), P("p2", 4, 12)];
  const r = computeProductLedger([p1, p2], [s1, s2]);
  ok(near(r.saleCogs.get("s1")!.cogsTotal, 50), "the sale covered by stock keeps its cost (50)");
  ok(near(r.saleCogs.get("s2")!.cogsTotal, 36) && near(r.saleCogs.get("s2")!.cogsPerUnit, 12), "the 3 sold early are re-costed from 30 to 36 (12 each)");
  ok(r.qtyOnHand === 1 && near(r.wac, 12) && near(r.inventoryValue, 12), "1 unit left at 12: the average is not blended with the old units");
}
// 3. Partly covered: 2 at 10 on hand, sold 5 (provisional 5 x 10 = 50), then 3 at 13 -> 2 x 10 + 3 x 13 = 59.
{
  const r = computeProductLedger([P("p1", 2, 10), P("p2", 3, 13)], [S("s", 5)]);
  ok(near(r.saleCogs.get("s")!.cogsTotal, 59) && r.qtyOnHand === 0, "5 sold with 2 on hand, 3 bought later at 13: cost is 2 x 10 + 3 x 13 = 59");
}
// 4. A bigger purchase than the shortfall: 3 owed, buy 10 at 8 -> 3 settled at 8, 7 into stock at 8.
{
  const r = computeProductLedger([P("p", 10, 8)], [S("s", 3)]);
  ok(near(r.saleCogs.get("s")!.cogsTotal, 24) && r.qtyOnHand === 7 && near(r.wac, 8) && near(r.inventoryValue, 56), "buy 10 at 8 after selling 3: sale costs 24, 7 left worth 56");
}
// 5. Two early sales settle oldest first, across two purchases: A sold 2, B sold 3 (nothing bought), buy 3 at 10, then 5 at 12.
{
  const [a, b] = [S("A", 2), S("B", 3)];
  const r1 = computeProductLedger([P("p1", 3, 10)], [a, b]);
  ok(near(r1.saleCogs.get("A")!.cogsTotal, 20) && near(r1.saleCogs.get("B")!.cogsTotal, 10), "first purchase (3 at 10): A fully costed (20), B partly (1 unit = 10), 2 of B still owed");
  const r2 = computeProductLedger([P("p1", 3, 10), P("p2", 5, 12)], [a, b]);
  ok(near(r2.saleCogs.get("A")!.cogsTotal, 20) && near(r2.saleCogs.get("B")!.cogsTotal, 34), "second purchase (5 at 12): B's last 2 units cost 24, B total 34");
  ok(r2.qtyOnHand === 3 && near(r2.wac, 12) && near(r2.inventoryValue, 36), "3 left at 12 = 36");
  ok(near(30 + 60, r2.saleCogs.get("A")!.cogsTotal + r2.saleCogs.get("B")!.cogsTotal + r2.inventoryValue), "everything bought (90) is either cost of sales (54) or stock (36)");
}
// 6. No shortfall: nothing changes. 10 at 5 then 10 at 7 -> average 6; sell 4 at 6.
{
  const r = computeProductLedger([P("p1", 10, 5), P("p2", 10, 7)], [S("s", 4, "2026-10-02")]);
  ok(near(r.wac, 6) && near(r.saleCogs.get("s")!.cogsPerUnit, 6) && r.qtyOnHand === 16 && !r.saleCogs.get("s")!.oversold, "buying before selling is the plain weighted average, as before");
}
// 7. A customer return restocks while units are still owed: the owed units are covered at their provisional cost.
{
  const p1 = P("p1", 1, 10), s1 = S("s1", 1), s2 = S("s2", 2);
  const ret = { id: "r1", saleId: "s1", productId: "x", qty: 1, restock: true, date: "2026-10-01", createdAt: ++t } as any;
  const p2 = P("p2", 1, 12);
  const r = computeProductLedger([p1, p2], [s1, s2], [ret]);
  ok(near(r.saleCogs.get("s2")!.cogsTotal, 22), "return covers one owed unit (stays 10); the one the purchase covers is re-costed to 12: 10 + 12 = 22");
}
// 7b. Which sale the later purchase re-costs after a return: 2 bought at 10 and sold; A sells 2 and B sells 1 with nothing left
// (3 owed); a customer returns the first 2 (restocked): A's 2 owed units are now covered, B's 1 is still owed.
{
  const p0 = P("p0", 2, 10), s0 = S("s0", 2), A = S("A", 2), B = S("B", 1);
  const ret = { id: "r", saleId: "s0", productId: "x", qty: 2, restock: true, date: "2026-10-01", createdAt: ++t } as any;
  const p2 = P("p2", 1, 12);
  const r = computeProductLedger([p0, p2], [s0, A, B], [ret]);
  ok(near(r.saleCogs.get("B")!.cogsTotal, 12) && near(r.saleCogs.get("A")!.cogsTotal, 20), "the purchase re-costs B (the sale still owed), not A (already covered by the return)");
}
// 8. A stock-loss adjustment made the stock negative (nothing owed by a sale): a purchase simply restores it at its cost.
{
  const adj = { id: "a", productId: "x", qty: -2, reason: "damaged", date: "2026-10-01", createdAt: ++t } as any;
  const r = computeProductLedger([P("p", 5, 10)], [], [], [adj]);
  ok(r.qtyOnHand === 3 && near(r.wac, 10) && near(r.inventoryValue, 30), "after a loss to negative stock, 5 bought at 10 leaves 3 at 10");
}
// 9. A purchase smaller than the shortfall settles only what it covers; the rest stays provisional and flagged.
{
  const sale = S("s", 5), buy = P("p", 2, 9);
  const r = computeProductLedger([buy], [sale]);
  ok(r.qtyOnHand === -3 && r.saleCogs.get("s")!.oversold, "5 sold, 2 bought later: still 3 short, still flagged");
  ok(near(r.saleCogs.get("s")!.cogsTotal, 18), "the 2 covered units are costed at 9 (18); the 3 still owed stay at the provisional 0");
  ok(near(r.wac, 9) && r.inventoryValue === 0, "no stock is left to value; the latest cost (9) is the estimate for the next sale");
}

// 10. Conservation over random sequences: with no returns or adjustments, when stock ends at 0 or more, everything
// bought is either cost of goods sold or still in stock, to the cent.
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let trials = 0, checked = 0;
for (let i = 0; i < 400; i++) {
  const n = 2 + Math.floor(rnd() * 8);
  const buys: any[] = [], sells: any[] = [];
  let spent = 0;
  for (let k = 0; k < n; k++) {
    const date = `2026-10-${String(1 + Math.floor(rnd() * 5)).padStart(2, "0")}`;
    if (rnd() < 0.5) { const q = 1 + Math.floor(rnd() * 6), c = 1 + Math.floor(rnd() * 20); buys.push(P(`p${k}`, q, c, date)); spent += q * c; }
    else sells.push(S(`s${k}`, 1 + Math.floor(rnd() * 6), date));
  }
  const r = computeProductLedger(buys, sells);
  trials++;
  if (r.qtyOnHand >= 0) {
    checked++;
    const cogs = [...r.saleCogs.values()].reduce((sum, c) => sum + c.cogsTotal, 0);
    if (!near(spent, cogs + r.inventoryValue)) { fails++; console.error("FAIL: conservation", { spent, cogs, inv: r.inventoryValue, buys, sells }); break; }
  }
}
ok(checked > 50, `conservation was checked on ${checked} of ${trials} random sequences that ended with stock at 0 or more`);

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
