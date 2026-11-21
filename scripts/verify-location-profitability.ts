// Empirical check for computeLocationProfitability (lib/calculations.ts).
// Run: npx tsx scripts/verify-location-profitability.ts
import { computeLocationProfitability } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const locations = [
  { id: "main", name: "Main", active: true, isDefault: true, createdAt: 0 },
  { id: "north", name: "North", active: true, createdAt: 0 },
  { id: "idle", name: "Idle branch", active: true, createdAt: 0 },
  { id: "closed", name: "Closed", active: false, createdAt: 0 },
] as any[];

const sale = (id: string, date: string, qty: number, locationId?: string) => ({ id, date, qty, locationId }) as any;
const econ = (saleId: string, revenue: number, cogs: number, variableCost = 0, cogsVariableCost = 0) => {
  const grossProfit = revenue - cogs - cogsVariableCost;
  return {
    saleId, revenue, cogs, variableCost, cogsVariableCost, grossProfit,
    contributionMargin: grossProfit - (variableCost - cogsVariableCost),
  } as any;
};

const sales = [
  sale("s1", "2026-09-10", 2, "main"),
  sale("s2", "2026-09-12", 1, undefined), // legacy record: no locationId => default (Main)
  sale("s3", "2026-09-15", 4, "north"),
  sale("s4", "2026-08-01", 9, "north"), // outside the range below
  sale("s5", "2026-09-20", 1, "north"), // has an includeInCogs shipping cost
];
const economics = [
  econ("s1", 200, 80, 10),
  econ("s2", 100, 40, 0),
  econ("s3", 400, 300, 20),
  econ("s4", 900, 500, 0),
  econ("s5", 50, 20, 8, 8), // 8 of shipping counted in Gross Profit
];
const purchases = [
  { id: "p1", date: "2026-09-05", qty: 10, unitCost: 5, locationId: "north" },
  { id: "p2", date: "2026-09-06", qty: 4, unitCost: 5, locationId: undefined }, // legacy => Main
  { id: "p3", date: "2026-07-01", qty: 100, unitCost: 5, locationId: "north" }, // outside range
] as any[];
const expenses = [
  { id: "e1", kind: "expense", amount: 300, startDate: "2026-09-08", isRecurring: false, locationId: "north" },
  { id: "e2", kind: "expense", amount: 999, startDate: "2026-08-08", isRecurring: false, locationId: "north" }, // out of range
  { id: "e3", kind: "expense", amount: 500, startDate: "2026-09-09", isRecurring: false }, // shared overhead: no location
  { id: "e4", kind: "expense", amount: 400, startDate: "2026-01-01", isRecurring: true, recurrence: "monthly", locationId: "north" },
  { id: "e5", kind: "expense", amount: 700, startDate: "2026-01-01", endDate: "2026-06-30", isRecurring: true, recurrence: "monthly", locationId: "north" }, // ended
  { id: "e6", kind: "expense", amount: 1200, startDate: "2026-01-01", isRecurring: true, recurrence: "yearly", locationId: "main" },
  { id: "e7", kind: "revenue", amount: 5000, startDate: "2026-09-09", isRecurring: false, locationId: "north" }, // not a cost
] as any[];

const rows = computeLocationProfitability(sales, economics, purchases, expenses, locations, "2026-09-01", "2026-09-30");
const by = (id: string) => rows.find((r) => r.locationId === id)!;

assert(rows.length === 3 && !rows.some((r) => r.locationId === "closed"), "one row per ACTIVE location; closed one with no activity is left out");
const main = by("main");
const north = by("north");
const idle = by("idle");

assert(near(main.revenue, 300) && main.ordersCount === 2 && main.unitsSold === 3, "Main: explicit + legacy (no locationId) sales both land on the default location");
assert(near(main.grossProfit, 180) && near(main.contributionMargin, 170), "Main: gross profit 180, contribution 170");
assert(near(main.grossMarginPct as number, 60) && near(main.contributionMarginPct as number, (170 / 300) * 100), "Main: margin percentages computed off revenue");
assert(near(main.avgOrderValue, 150), "Main: average order value = revenue / orders");
assert(near(main.purchasesValue, 20), "Main: legacy purchase (no locationId) counts as received at the default location");

assert(near(north.revenue, 450) && north.ordersCount === 2, "North: the out-of-range sale is excluded");
assert(near(north.grossProfit, 100 + 22), "North: gross profit sums per-sale figures (100 + 22 incl. the includeInCogs shipping on s5)");
assert(near(north.contributionMargin, 80 + 22), "North: contribution = 80 + 22, i.e. revenue - cogs - ALL variable costs");
assert(near(north.grossProfit - north.contributionMargin, 20 + 8 - 8) , "North: gross profit minus contribution equals only the below-the-line variable cost");
assert(near(north.purchasesValue, 50), "North: purchases in range only (out-of-range 500 excluded)");

assert(near(north.directOneOffCosts, 300), "North: only the in-range one-off cost tagged to North counts (out-of-range 999 and revenue-kind 5000 excluded)");
assert(near(north.contributionAfterDirectCosts, north.contributionMargin - 300), "North: contributionAfterDirectCosts = contribution - direct one-off costs");
assert(near(north.recurringMonthlyCosts, 400), "North: active recurring cost counted as monthly run-rate; the ended one is not");
assert(near(main.recurringMonthlyCosts, 100), "Main: yearly 1200 normalizes to 100/month");

const allDirect = rows.reduce((s, r) => s + r.directOneOffCosts, 0);
assert(near(allDirect, 300), "the untagged 500 shared-overhead expense is never allocated to any location");

assert(idle.revenue === 0 && idle.ordersCount === 0 && idle.grossMarginPct === null && idle.contributionMarginPct === null && idle.avgOrderValue === 0,
  "an active location with zero activity still appears, with null margins and no divide-by-zero");

const historic = computeLocationProfitability(
  [sale("h1", "2026-09-10", 1, "closed")], [econ("h1", 70, 30)], [], [], locations, "2026-09-01", "2026-09-30");
assert(historic.some((r) => r.locationId === "closed" && near(r.revenue, 70) && r.locationName === "Closed"),
  "history from a since-deactivated location still shows in the period it was active");

assert(computeLocationProfitability(sales, economics, purchases, expenses, [], "2026-09-01", "2026-09-30").length === 0, "no locations => empty result, no crash");

const all = computeLocationProfitability(sales, economics, purchases, expenses, locations);
assert(near(by2(all, "north").revenue, 400 + 900 + 50), "no date range => every sale counts (400 + 900 + 50)");
function by2(list: typeof rows, id: string) { return list.find((r) => r.locationId === id)!; }
