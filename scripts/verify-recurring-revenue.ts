// Recurring-revenue health (lib/recurringRevenue.ts): ARR, added / lost in the last month, churn, predictable share, coverage.
// Run: npx tsx scripts/verify-recurring-revenue.ts
import { computeRecurringRevenueHealth } from "../lib/recurringRevenue";
import { computeMRR } from "../lib/calculations";
import type { Expense } from "../lib/types";
import type { MonthlyPnL } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) { checks++; if (!cond) { fails++; console.error("FAIL:", msg); } }
const near = (a: number | null, b: number, tol = 1e-6) => a !== null && Math.abs(a - b) <= tol;

const rev = (o: Partial<Expense>): Expense => ({ id: "r", name: "Plan", amount: 100, category: "Subscriptions", kind: "revenue", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01", ...o } as Expense);
const cost = (o: Partial<Expense>): Expense => rev({ kind: "expense", name: "Rent", category: "Rent", ...o });
const pnl = (month: string, totalRevenue: number, recurringRevenue: number) => ({ month, totalRevenue, recurringRevenue } as MonthlyPnL);

const asOf = "2026-10-16"; // window starts 2026-09-16
const items: Expense[] = [
  rev({ id: "a", amount: 1000 }),                                   // running throughout
  rev({ id: "b", amount: 600, startDate: "2026-10-01" }),           // added in the window
  rev({ id: "c", amount: 400, endDate: "2026-10-05" }),             // ended in the window  -> lost
  rev({ id: "d", amount: 1200, recurrence: "yearly", startDate: "2026-10-10" }), // yearly 1200 = 100/mo, added
  rev({ id: "e", amount: 300, startDate: "2026-09-20", endDate: "2026-10-02" }), // started AND ended inside the window: neither
  rev({ id: "f", amount: 999, endDate: "2026-08-01" }),             // ended long ago: ignored
  rev({ id: "g", amount: 50, isRecurring: false }),                 // one-off: ignored
  cost({ id: "h", amount: 700 }),                                   // a regular cost
];
const h = computeRecurringRevenueHealth(items, [], asOf);
ok(near(h.mrr, 1000 + 600 + 100), `mrr 1700, got ${h.mrr}`);
ok(near(h.arr, 1700 * 12), `arr, got ${h.arr}`);
ok(near(h.mrrBefore, 1000 + 400), `mrrBefore 1400, got ${h.mrrBefore}`);
ok(near(h.added, 700), `added 700, got ${h.added}`);
ok(near(h.lost, 400), `lost 400, got ${h.lost}`);
ok(near(h.netNew, 300), `netNew 300, got ${h.netNew}`);
ok(near(h.mrr, h.mrrBefore + h.added - h.lost), "identity: mrr = before + added - lost");
ok(near(h.growthPct, (300 / 1400) * 100), `growthPct, got ${h.growthPct}`);
ok(near(h.churnPct, (400 / 1400) * 100), `churnPct, got ${h.churnPct}`);
ok(near(h.monthlyRecurringCosts, 700), "recurring costs 700");
ok(near(h.coverage, 1700 / 700), `coverage, got ${h.coverage}`);

// Identity holds over many dates and shapes of item (including boundary days).
const dates = ["2026-09-16", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-10", "2026-10-16", "2026-10-31", "2026-03-31", "2026-12-31"];
for (const d of dates) {
  const r = computeRecurringRevenueHealth(items, [], d);
  ok(near(r.mrr, r.mrrBefore + r.added - r.lost, 1e-6), `identity at ${d}: ${r.mrr} vs ${r.mrrBefore}+${r.added}-${r.lost}`);
  ok(near(r.mrr, computeMRR(items, d).mrrRevenue), `mrr matches computeMRR at ${d}`);
}

// Nothing a month ago -> growth and churn are null, not infinity or zero.
const fresh = computeRecurringRevenueHealth([rev({ id: "n", amount: 500, startDate: "2026-10-10" })], [], asOf);
ok(fresh.growthPct === null && fresh.churnPct === null, "no baseline: growth and churn are null");
ok(near(fresh.added, 500) && near(fresh.netNew, 500), "no baseline: everything is new");
ok(fresh.coverage === null, "no recurring costs: coverage is null");

// Nothing at all
const none = computeRecurringRevenueHealth([], [], asOf);
ok(none.mrr === 0 && none.arr === 0 && none.added === 0 && none.lost === 0, "empty: all zero");
ok(none.predictableSharePct === null, "empty: share is null");

// Predictable share: last 3 FULL months only; the current month and older months are left out.
const months = [pnl("2026-06", 9999, 9999), pnl("2026-07", 1000, 400), pnl("2026-08", 1000, 500), pnl("2026-09", 2000, 600), pnl("2026-10", 5000, 0)];
const s = computeRecurringRevenueHealth(items, months, asOf);
ok(near(s.predictableSharePct, ((400 + 500 + 600) / (1000 + 1000 + 2000)) * 100), `share 37.5, got ${s.predictableSharePct}`);
// Unsorted input gives the same answer
const s2 = computeRecurringRevenueHealth(items, [...months].reverse(), asOf);
ok(near(s2.predictableSharePct, s.predictableSharePct ?? -1), "share does not depend on input order");
// Never above 100
const over = computeRecurringRevenueHealth(items, [pnl("2026-09", 100, 500)], asOf);
ok(over.predictableSharePct === 100, "share capped at 100");
// Zero revenue months -> null, not NaN
const zero = computeRecurringRevenueHealth(items, [pnl("2026-09", 0, 0)], asOf);
ok(zero.predictableSharePct === null, "zero revenue: share is null");
// Weekly normalisation (52/12)
const wk = computeRecurringRevenueHealth([rev({ amount: 120, recurrence: "weekly" })], [], asOf);
ok(near(wk.mrr, (120 * 52) / 12), `weekly normalisation, got ${wk.mrr}`);
// Window across a year boundary and a month-end
const ye = computeRecurringRevenueHealth([rev({ amount: 100, startDate: "2026-12-20" })], [], "2027-01-05");
ok(near(ye.mrrBefore, 0) && near(ye.added, 100), "year-boundary window (2026-12-05 .. 2027-01-05)");
const me = computeRecurringRevenueHealth([rev({ amount: 100, startDate: "2026-03-01" })], [], "2026-03-31");
ok(near(me.mrrBefore, 0) && near(me.added, 100), "month-end window starts on Feb 28 (not an overflow into March)");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
