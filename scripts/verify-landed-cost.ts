// Empirical check: delivery costs (freight, customs, handling) spread over the units received flow into stock cost,
// WAC, cost of goods and margin, instead of being silently left out. Run: npx tsx scripts/verify-landed-cost.ts
import { computeProductLedger, landedUnitCost } from "../lib/calculations";
import type { Purchase, Sale } from "../lib/types";
let pass = 0, fail = 0;
function assert(c: boolean, m: string) { if (c) { pass++; console.log("OK:", m); } else { fail++; console.error("FAIL:", m); process.exitCode = 1; } }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

assert(landedUnitCost(100, 10, 0, 0, 0) === 100, "no delivery cost leaves the unit cost alone");
assert(near(landedUnitCost(100, 10, 50, 30, 20), 110), "100 each + (50+30+20)/10 = 110 all-in");
assert(landedUnitCost(100, 0, 50, 0, 0) === 100 && landedUnitCost(100, -3, 50, 0, 0) === 100, "zero/negative quantity can't divide by zero");
assert(near(landedUnitCost(100, 10, -40, 0, 0), 100), "a negative delivery cost is ignored, not subtracted");

// Through the real ledger: the same goods, with and without 100 of freight on 10 units.
const mk = (unitCost: number): Purchase[] => [{ id: "p1", productId: "a", qty: 10, unitCost, date: "2026-01-01", createdAt: 1, paymentMethod: "cash" } as Purchase];
const sale: Sale[] = [{ id: "s1", productId: "a", qty: 4, unitPrice: 150, date: "2026-01-10", createdAt: 2, paymentMethod: "cash" } as Sale];
const without = computeProductLedger(mk(100), sale);
const withFreight = computeProductLedger(mk(landedUnitCost(100, 10, 100)), sale);
assert(near(withFreight.wac, 110) && near(withFreight.inventoryValue, 660), "WAC 110 and 6 units left worth 660 with the freight included");
const cogs = (l: ReturnType<typeof computeProductLedger>) => [...l.saleCogs.values()].reduce((s, c) => s + c.cogsTotal, 0);
assert(near(cogs(without), 400) && near(cogs(withFreight), 440), "cost of the 4 sold is 440, not 400: margin no longer overstated by the delivery cost");
assert(near(without.inventoryValue + cogs(without) + 100, withFreight.inventoryValue + cogs(withFreight)), "every cent of the 100 freight ends up in stock value or cost of goods; none vanishes");
console.log(`\n${pass} passed, ${fail} failed`);
