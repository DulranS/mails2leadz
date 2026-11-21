// Empirical check for the reorder safety buffer (computeEOQ, Settings.defaultSafetyStockDays).
// Run: npx tsx scripts/verify-safety-stock.ts
import { computeEOQ } from "../lib/calculations";
import { DEFAULT_SETTINGS } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const product = (o: Record<string, unknown> = {}) => ({ id: "p", name: "Widget", type: "product", ...o }) as any;
const settings = (o: Record<string, unknown> = {}) =>
  ({ ...DEFAULT_SETTINGS, defaultOrderingCost: 50, defaultHoldingCostPct: 20, defaultLeadTimeDays: 7, ...o }) as any;

const annual = 3650; // 10 units a day
const wac = 10;

// 1. Default (0) is exactly the old behaviour: demand x lead time.
const base = computeEOQ(product(), wac, annual, settings());
assert(near(base.reorderPoint, 10 * 7), "no buffer: reorder point = 10/day x 7 days = 70");
assert(DEFAULT_SETTINGS.defaultSafetyStockDays === 0, "new accounts default to no buffer");

// 2. A legacy settings doc with no such field behaves like 0.
const legacy = settings();
delete legacy.defaultSafetyStockDays;
assert(near(computeEOQ(product(), wac, annual, legacy).reorderPoint, 70), "legacy settings (field missing) = 0 days");

// 3. The buffer adds days of demand on top of lead time.
const withBuffer = computeEOQ(product(), wac, annual, settings({ defaultSafetyStockDays: 3 }));
assert(near(withBuffer.reorderPoint, 10 * (7 + 3)), "3 buffer days: 10/day x (7 + 3) = 100");

// 4. A per-product lead time still wins over the default, and the buffer sits on top of it.
const custom = computeEOQ(product({ leadTimeDays: 14 }), wac, annual, settings({ defaultSafetyStockDays: 3 }));
assert(near(custom.reorderPoint, 10 * (14 + 3)), "product lead time 14 + buffer 3: 10/day x 17 = 170");

// 5. The buffer moves only the flag, never the order quantity or its costs.
assert(near(withBuffer.eoq, base.eoq) && near(withBuffer.totalAnnualCost, base.totalAnnualCost)
  && near(withBuffer.ordersPerYear, base.ordersPerYear), "EOQ, orders/year and annual cost are unchanged by the buffer");

// 6. Bad values can't make the flag fire later than the plain lead time.
assert(near(computeEOQ(product(), wac, annual, settings({ defaultSafetyStockDays: -5 })).reorderPoint, 70), "negative buffer clamps to 0");

// 7. No demand -> no reorder point, buffer or not (nothing to protect).
assert(computeEOQ(product(), wac, 0, settings({ defaultSafetyStockDays: 10 })).reorderPoint === 0, "no sales history: reorder point stays 0");

// 8. The flag rule on the Products page: stock + on order <= reorder point.
const flags = (qty: number, onOrder: number, rp: number) => rp > 0 && qty + onOrder <= rp;
assert(!flags(85, 0, base.reorderPoint) && flags(85, 0, withBuffer.reorderPoint), "85 on hand: quiet without a buffer, flagged with 3 buffer days");
assert(!flags(60, 50, withBuffer.reorderPoint), "stock already on order still suppresses the flag");
