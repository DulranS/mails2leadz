// Customer order frequency (lib/orderFrequency.ts). Hand-worked dates and numbers.
// Run: npx tsx scripts/verify-order-frequency.ts
import { computeOrderRhythms, summarizeOrderFrequency, type OrderSale } from "../lib/orderFrequency";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
let n = 0;
const sale = (customer: string, date: string, price = 100, extra: Partial<OrderSale> = {}): OrderSale => ({ id: `s${++n}`, customer, date, unitPrice: price, qty: 1, ...extra });
const TODAY = "2026-10-20";
const find = (rs: ReturnType<typeof computeOrderRhythms>, name: string) => rs.find((r) => r.name === name)!;

// Ada orders every 14 days: Aug 4, Aug 18, Sep 1, Sep 15, Sep 29. Last order Sep 29: 21 days ago, ratio 1.5 = due.
const ada = ["2026-08-04", "2026-08-18", "2026-09-01", "2026-09-15", "2026-09-29"].map((d) => sale("Ada", d, 200));
// Bo, same rhythm but last order Aug 25 (56 days ago, ratio 4): slipping.
const bo = ["2026-06-30", "2026-07-14", "2026-07-28", "2026-08-11", "2026-08-25"].map((d) => sale("Bo", d, 50));
// Cy ordered Oct 14 after a 14-day rhythm: regular (6 days, inside a week).
const cy = ["2026-09-16", "2026-09-30", "2026-10-14"].map((d) => sale("Cy", d, 80));
const rs = computeOrderRhythms([...ada, ...bo, ...cy], TODAY);
const A = find(rs, "Ada"), B = find(rs, "Bo"), C = find(rs, "Cy");
ok(A.typicalGapDays === 14 && A.daysSinceLast === 21 && A.status === "due" && A.expectedNext === "2026-10-13", "Ada: every 14 days, 21 days since, due, expected Oct 13");
ok(B.typicalGapDays === 14 && B.daysSinceLast === 56 && B.status === "slipping", "Bo: 56 days since a 14-day rhythm is slipping");
ok(C.daysSinceLast === 6 && C.status === "regular", "Cy: ordered 6 days ago: regular (never late inside a week)");
ok(A.avgOrderValue === 200 && A.orders === 5 && A.orderDays === 5 && A.firstOrder === "2026-08-04", "Ada: 5 orders averaging 200");
ok(rs[0].name === "Bo" && rs[1].name === "Ada", "slipping first, then due");

// The boundaries, exactly: a gap of 14 days. 13 days since = regular; 14 = due; 27 = due; 28 = slipping; 35 = slipping.
const edge = (daysAgo: number) => {
  const last = new Date(Date.parse(TODAY + "T00:00:00Z") - daysAgo * 86400000).toISOString().slice(0, 10);
  const mk = (back: number) => new Date(Date.parse(last + "T00:00:00Z") - back * 86400000).toISOString().slice(0, 10);
  return computeOrderRhythms([sale("E", mk(28)), sale("E", mk(14)), sale("E", last)], TODAY)[0].status;
};
ok(edge(13) === "regular" && edge(14) === "due" && edge(27) === "due" && edge(28) === "slipping" && edge(35) === "slipping", "13 days regular, 14 due, 27 due, 28 slipping (twice the gap), 35 slipping");
// A frequent buyer is never flagged inside a week: orders every 2 days, 6 days since the last = regular, not "slipping" at 3x.
ok(computeOrderRhythms([sale("Q", "2026-10-10"), sale("Q", "2026-10-12"), sale("Q", "2026-10-14")], TODAY)[0].status === "regular", "6 days since a 2-day rhythm: regular (the one-week floor)");
ok(computeOrderRhythms([sale("Q", "2026-10-06"), sale("Q", "2026-10-08"), sale("Q", "2026-10-10")], TODAY)[0].status === "slipping", "10 days since a 2-day rhythm: slipping");

// Median, not mean: gaps 7, 7, 7, 60 (a holiday) still read as about weekly.
const jo = ["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-09-20"].map((d) => sale("Jo", d));
ok(find(computeOrderRhythms(jo, TODAY), "Jo").typicalGapDays === 7, "one long gap does not move the typical rhythm (median)");

// Two order days: one interval, flagged low confidence. One order day: new, then one-off after 90 days.
const two = computeOrderRhythms([sale("Di", "2026-09-01"), sale("Di", "2026-09-11")], TODAY)[0];
ok(two.typicalGapDays === 10 && two.lowConfidence && two.status === "slipping", "two orders: gap 10, low confidence; 39 days since is slipping");
ok(computeOrderRhythms([sale("Ed", "2026-10-10")], TODAY)[0].status === "new" && computeOrderRhythms([sale("Fy", "2026-07-01")], TODAY)[0].status === "one_off", "one order: new, or one-off after 90 days");
ok(computeOrderRhythms([sale("Ed", "2026-10-10")], TODAY)[0].typicalGapDays === null && computeOrderRhythms([sale("Ed", "2026-10-10")], TODAY)[0].expectedNext === null, "no rhythm to read from a single order day");

// What is an order: an invoice (goods + delivery) is one; two orders the same day are one order day; late charges are not orders.
const inv = [sale("Gus", "2026-09-01", 100, { invoiceId: "I1" }), sale("Gus", "2026-09-01", 15, { invoiceId: "I1" }), sale("Gus", "2026-09-15", 100, { invoiceId: "I2" })];
const g = computeOrderRhythms(inv, TODAY)[0];
ok(g.orders === 2 && g.avgOrderValue === 107.5 && g.typicalGapDays === 14, "goods + delivery on one invoice = one order (115), gap 14");
const sameDay = computeOrderRhythms([sale("Hal", "2026-09-01"), sale("Hal", "2026-09-01"), sale("Hal", "2026-09-15")], TODAY)[0];
ok(sameDay.orders === 3 && sameDay.orderDays === 2 && sameDay.typicalGapDays === 14, "two orders on one day: 3 orders, 2 order days, gap 14 (not 0)");
const fee = computeOrderRhythms([sale("Ivy", "2026-09-01"), sale("Ivy", "2026-10-15", 9, { lateFeeForKey: "sale:x" })], TODAY)[0];
ok(fee.orders === 1 && fee.lastOrder === "2026-09-01", "a billed late charge is not an order");

// Names: case and spaces ignored; blanks and future dates skipped; bad dates ignored.
const nm = computeOrderRhythms([sale("  ada ", "2026-09-01"), sale("ADA", "2026-09-15"), sale("", "2026-09-15"), sale("Zed", "2026-12-01"), sale("Zed", "not a date")], TODAY);
ok(nm.length === 1 && nm[0].orders === 2 && nm[0].name === "ada", "names matched ignoring case and spaces; blank, future and malformed rows skipped");
ok(computeOrderRhythms([sale("A", "2026-09-01")], "junk").length === 0 && computeOrderRhythms([], TODAY).length === 0, "bad as-of date or no sales: nothing");
ok(computeOrderRhythms([sale("A", "2026-10-20"), sale("A", "2026-10-20")], TODAY)[0].daysSinceLast === 0, "ordered today: 0 days since");

// Summary: last 12 months only for repeat rate; median gap over every customer's typical gap.
const all = [...ada, ...bo, ...cy, ...jo, sale("Old", "2024-01-01"), sale("Old", "2024-02-01"), sale("Once", "2026-10-01")];
const sum = summarizeOrderFrequency(all, computeOrderRhythms(all, TODAY), TODAY);
ok(sum.activeCustomers === 5 && sum.repeatCustomers === 4 && sum.repeatRatePct === 80, "5 active in 12 months (Ada, Bo, Cy, Jo, Once), 4 ordered on 2+ days: 80%");
ok(sum.avgOrdersPerCustomer === 3.8, "19 orders / 5 customers = 3.8");
ok(sum.medianGapDays === 14, "median of the typical gaps (14, 14, 14, 7, 31) is 14");
const none = summarizeOrderFrequency([], [], TODAY);
ok(none.repeatRatePct === null && none.avgOrdersPerCustomer === null && none.medianGapDays === null && none.activeCustomers === 0, "no sales: nulls, no division by zero");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
