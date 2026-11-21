// Expected pipeline value (lib/pipelineValue.ts) and revenue drivers (lib/revenueDrivers.ts). Hand-worked numbers.
// Run: npx tsx scripts/verify-pipeline-and-drivers.ts
import fs from "node:fs";
import { expectedPipelineValue } from "../lib/pipelineValue";
import { computeRevenueDrivers } from "../lib/revenueDrivers";
import type { OrderSale } from "../lib/orderFrequency";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// Pipeline: open leads worth 10,000 + 5,000 + 0 + none; won 6 of 10 decided = 60%: expected 9,000 of a 15,000 best case.
const e = expectedPipelineValue([10000, 5000, 0, undefined, null], 60, 10)!;
ok(e.bestCase === 15000 && e.expected === 9000 && e.winRatePct === 60 && e.decided === 10, "15,000 open at a 60% win rate is 9,000 expected, resting on 10 decided leads");
ok(expectedPipelineValue([10000], 60, 4) === null && expectedPipelineValue([10000], 60, 5) !== null, "fewer than 5 decided leads: no figure; exactly 5 is enough");
ok(expectedPipelineValue([10000], null, 20) === null && expectedPipelineValue([10000], NaN, 20) === null && expectedPipelineValue([10000], 101, 20) === null && expectedPipelineValue([10000], -1, 20) === null, "no or invalid win rate: no figure");
ok(expectedPipelineValue([0, null, undefined], 50, 20) === null && expectedPipelineValue([], 50, 20) === null, "nothing valued in the open pipeline: no figure");
ok(expectedPipelineValue([100], 0, 20)!.expected === 0, "a 0% win rate is a real answer: expected 0");
ok(expectedPipelineValue([1000.555], 33.333, 10)!.winRatePct === 33.3, "the rate is shown to one decimal");

// Revenue drivers. Asof 2026-10-20. Previous 12 months (Oct 2024 - Oct 2025): customers A,B; A orders twice, B once, 100 each = 300.
// Current: A, B, C; A twice (100 each), B twice (100), C once (200) = 600 over 5 orders from 3 customers.
let n = 0;
const s = (customer: string | undefined, date: string, price: number, extra: Partial<OrderSale> = {}): OrderSale => ({ id: `s${++n}`, customer, date, unitPrice: price, qty: 1, ...extra });
const prev = [s("A", "2025-01-10", 100), s("A", "2025-06-10", 100), s("B", "2025-03-10", 100)];
const cur = [s("A", "2026-01-10", 100), s("A", "2026-06-10", 100), s("B", "2026-02-10", 100), s("B", "2026-07-10", 100), s("C", "2026-09-10", 200)];
const d = computeRevenueDrivers([...prev, ...cur], "2026-10-20")!;
ok(d.current.customers === 3 && d.current.orders === 5 && d.current.revenue === 600, "current: 3 customers, 5 orders, 600");
ok(d.current.ordersPerCustomer === 1.67 && d.current.avgOrder === 120, "orders each 1.67 (5/3), average order 120 (600/5)");
ok(d.previous!.customers === 2 && d.previous!.orders === 3 && d.previous!.revenue === 300 && d.previous!.avgOrder === 100 && d.previous!.ordersPerCustomer === 1.5, "previous: 2 customers, 3 orders, 300, 1.5 orders each, average 100");
ok(d.change!.customersPct === 50 && d.change!.ordersPerCustomerPct === 11.1 && d.change!.avgOrderPct === 20 && d.change!.revenuePct === 100, "customers +50%, orders each +11.1%, order size +20%, revenue +100%");
// The three levers multiply back to revenue exactly: 1.5 x 1.1111 x 1.2 = 2.0.
ok(Math.abs((1 + d.change!.customersPct / 100) * (5 / 3 / 1.5) * (1 + d.change!.avgOrderPct / 100) - 2) < 1e-9, "customers x orders each x order size reproduces the doubling of revenue");
ok(d.biggestLever === "customers", "the biggest mover is the number of customers (+50%)");
// Orders: an invoice of two lines is one order; late charges are not orders; names ignore case and spaces.
const inv = [s("A", "2026-05-01", 60, { invoiceId: "I1" }), s("a ", "2026-05-01", 40, { invoiceId: "I1" }), s("A", "2026-06-01", 9, { lateFeeForKey: "x" })];
const di = computeRevenueDrivers(inv, "2026-10-20")!;
ok(di.current.orders === 1 && di.current.customers === 1 && di.current.revenue === 100, "two lines on one invoice are one order of 100; a billed late charge is not counted");
// Unattributed: sales with no customer are reported, never counted as customers.
const un = computeRevenueDrivers([s("A", "2026-05-01", 300), s(undefined, "2026-05-02", 100), s("  ", "2026-05-03", 100)], "2026-10-20")!;
ok(un.current.customers === 1 && un.current.revenue === 300 && un.unattributedRevenue === 200 && un.unattributedSharePct === 40, "walk-in sales (200 of 500) are shown as unattributed, 40%");
// No previous period: levers shown without a comparison. No sales at all: nothing.
const solo = computeRevenueDrivers([s("A", "2026-05-01", 100)], "2026-10-20")!;
ok(solo.previous === null && solo.change === null && solo.biggestLever === null, "no earlier 12 months: no comparison");
ok(computeRevenueDrivers([], "2026-10-20") === null && computeRevenueDrivers([s("A", "2026-05-01", 1)], "junk") === null && computeRevenueDrivers([s("A", "2020-05-01", 1)], "2026-10-20") === null, "no sales in the last 12 months, or a bad date: nothing");
// Window edges: exactly 365 days back is out of the current period; the day after is in.
ok(computeRevenueDrivers([s("A", "2025-10-20", 100), s("A", "2025-10-21", 100)], "2026-10-20")!.current.orders === 1, "the current period is the last 365 days: 2025-10-21 in, 2025-10-20 out");
// Unchanged revenue: no biggest lever.
const flat = computeRevenueDrivers([s("A", "2025-03-01", 100), s("A", "2026-03-01", 100)], "2026-10-20")!;
ok(flat.change!.revenuePct === 0 && flat.biggestLever === null, "same customers, orders and size: nothing moved");

// Wiring.
const leads = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(/expectedPipelineValue\(/.test(leads) && /leadConversion\.winRatePct/.test(leads), "the Leads page shows the expected value from the app's own win rate");
const cust = fs.readFileSync("app/customers/page.tsx", "utf8");
ok(/computeRevenueDrivers\(sales, todayIso\(\)\)/.test(cust), "the Customers page shows the revenue drivers");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
