// Group consolidation (lib/consolidation.ts): businesses' months added together; transfers between group businesses taken out of revenue and cost, so the
// profit does not change; validation (currency, two businesses, a real transfer); and the last twelve months. Worked numbers. Run:
// npx tsx scripts/verify-consolidation.ts
import { consolidate, validateGroup, lastTwelveMonths, type BusinessSummary } from "../lib/consolidation";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const a: BusinessSummary = { businessId: "A", name: "Shop", currency: "LKR", months: [{ month: "2026-10", revenue: 1000, costOfSales: 400, costsAndTax: 300, netProfit: 300 }] };
const b: BusinessSummary = { businessId: "B", name: "Depot", currency: "LKR", months: [{ month: "2026-10", revenue: 500, costOfSales: 200, costsAndTax: 200, netProfit: 100 }] };
const none = consolidate([a, b], []);
ok(none[0].revenue === 1500 && none[0].costOfSales === 600 && none[0].netProfit === 400, "with no transfers, the group is the two businesses added together (revenue 1,500, profit 400)");
const withT = consolidate([a, b], [{ id: "t1", month: "2026-10", amount: 200, fromBusinessId: "A", toBusinessId: "B" }]);
ok(withT[0].revenue === 1300 && withT[0].costOfSales === 400 && withT[0].eliminated === 200, "a transfer of 200 from Shop to Depot is taken out of revenue and cost: revenue 1,300, cost of sales 400");
ok(withT[0].netProfit === 400, "the group profit does not change when a transfer is taken out (it was never income or cost to the group)");
ok(consolidate([a, b], [{ id: "t2", month: "2026-09", amount: 50, fromBusinessId: "A", toBusinessId: "B" }]).some((r) => r.month === "2026-09" && r.revenue === -50), "a transfer in a month with no other sales still shows, and is taken out");

ok(validateGroup([a, b], []) === null, "two businesses in one currency form a group");
ok(validateGroup([a], []) !== null, "a group of one business is refused");
ok(validateGroup([a, { ...b, currency: "USD" }], []) !== null, "businesses in different currencies are not consolidated, and the message says why");
ok(validateGroup([a, b], [{ id: "x", month: "2026-10", amount: 10, fromBusinessId: "A", toBusinessId: "Z" }]) !== null, "a transfer to a business outside the group is refused");
ok(validateGroup([a, b], [{ id: "x", month: "2026-10", amount: 10, fromBusinessId: "A", toBusinessId: "A" }]) !== null, "a transfer from a business to itself is refused");
ok(validateGroup([a, b], [{ id: "x", month: "2026-10", amount: 0, fromBusinessId: "A", toBusinessId: "B" }]) !== null, "a transfer of nothing is refused");

const months = lastTwelveMonths("2026-11-12");
ok(months.length === 12 && months[0] === "2025-12" && months[11] === "2026-11", "the screen shows the last twelve months, oldest first");


// Multi-currency (v251): businesses in different currencies, converted to one reporting currency with the rates entered.
const usd: BusinessSummary = { businessId: "C", name: "Export", currency: "USD", months: [{ month: "2026-10", revenue: 10, costOfSales: 4, costsAndTax: 4, netProfit: 2 }] };
const rates = { USD: 300 };
ok(validateGroup([a, usd], []) !== null, "businesses in two currencies are refused until a reporting currency is chosen");
ok(validateGroup([a, usd], [], { reportingCurrency: "LKR", rates: {} }) !== null, "a missing rate is asked for by name, so no figure is added up without one");
ok(validateGroup([a, usd], [], { reportingCurrency: "LKR", rates }) === null, "with the reporting currency and the rate, the group can be added up");
const conv = consolidate([a, usd], [], { reportingCurrency: "LKR", rates });
ok(conv[0].revenue === 4000 && conv[0].costOfSales === 1600 && conv[0].netProfit === 900, "10 USD at 300 becomes 3,000 LKR: group revenue 4,000, cost of sales 1,600, profit 900 (300 + 600)");
const convT = consolidate([a, usd], [{ id: "t", month: "2026-10", amount: 200, fromBusinessId: "A", toBusinessId: "C" }], { reportingCurrency: "LKR", rates });
ok(convT[0].revenue === 3800 && convT[0].costOfSales === 1400 && convT[0].netProfit === 900, "a 200 LKR transfer (entered in the reporting currency) comes out of revenue and cost, and the profit is unchanged");
ok(consolidate([a, b], []).length === 1 && consolidate([a, b], [])[0].revenue === 1500, "with one currency, the group behaves exactly as before");
console.log(`${checks - fails}/${checks} checks passed (with currencies)`);
if (fails) process.exit(1);
