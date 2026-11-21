// Empirical check for lib/supplierDelivery.ts. Run: npx tsx scripts/verify-supplier-delivery.ts
import { computeSupplierDelivery, deliveryLabel, deliveryTone } from "../lib/supplierDelivery";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
let n = 0;
const po = (o: Record<string, unknown>) =>
  ({ id: `po${n++}`, productId: "p", qtyOrdered: 1, unitCost: 1, orderDate: "2026-01-01", status: "received", createdAt: 0, ...o }) as any;

const orders = [
  po({ supplier: "Acme", expectedDate: "2026-02-10", receivedDate: "2026-02-10" }), // on time (same day)
  po({ supplier: "ACME ", expectedDate: "2026-03-10", receivedDate: "2026-03-08" }), // early, key is case/space-insensitive
  po({ supplier: "acme", expectedDate: "2026-04-10", receivedDate: "2026-04-14" }), // 4 late
  po({ supplier: "Acme", expectedDate: "2026-05-10", receivedDate: "2026-05-12" }), // 2 late
  po({ supplier: "Acme", receivedDate: "2026-05-20" }), // no expected date -> not scored
  po({ supplier: "Acme", status: "cancelled", expectedDate: "2026-01-02" }), // ignored
  po({ supplier: "Acme", status: "in_transit", expectedDate: "2026-09-01" }), // overdue open
  po({ supplier: "Acme", status: "ordered", expectedDate: "2026-12-01" }), // not yet due
  po({ supplier: "Acme", status: "ordered" }), // no date -> never overdue
  po({ supplier: "Solo", expectedDate: "2026-02-01", receivedDate: "2026-02-09" }), // 8 late, 1 scored
  po({ supplier: "", expectedDate: "2026-02-01", receivedDate: "2026-02-09" }), // no supplier -> skipped
  po({ expectedDate: "2026-02-01", receivedDate: "2026-02-09" }),
];
const m = computeSupplierDelivery(orders, "2026-10-13");
const a = m.get("acme")!;
assert(m.size === 2, "only named suppliers are tracked (blank / missing skipped)");
assert(a.scored === 4 && a.onTime === 2 && a.late === 2, "Acme: 4 scored, 2 on time, 2 late (case/space-insensitive name)");
assert(a.onTimePct === 50, "Acme on-time 50%");
assert(a.avgDaysLate === 3 && a.worstDaysLate === 4, "Acme late by 3 days on average, worst 4");
assert(a.overdueOpen === 1, "Acme: exactly one open order past its expected date (not-yet-due and undated excluded)");
assert(deliveryLabel(a) === "50% on time (2 of 4)", "label shows the sample size");
assert(deliveryTone(a) === "bad", "50% over 4 orders is red");
const s = m.get("solo")!;
assert(s.scored === 1 && s.onTimePct === 0 && s.avgDaysLate === 8, "Solo: one late order");
assert(deliveryTone(s) === "none", "one order is not enough for a verdict (no tone)");
assert(deliveryTone(undefined) === "none" && deliveryLabel(undefined) === null, "no orders -> nothing shown");
// boundary tones need >=3 scored
const mk = (onTimeN: number, lateN: number) => {
  const l: any[] = [];
  for (let i = 0; i < onTimeN; i++) l.push(po({ supplier: "X", expectedDate: "2026-01-10", receivedDate: "2026-01-10" }));
  for (let i = 0; i < lateN; i++) l.push(po({ supplier: "X", expectedDate: "2026-01-10", receivedDate: "2026-01-11" }));
  return computeSupplierDelivery(l, "2026-10-13").get("x");
};
assert(deliveryTone(mk(9, 1)) === "good", "90% is green");
assert(deliveryTone(mk(7, 3)) === "warn", "70% is amber");
assert(deliveryTone(mk(2, 1)) === "bad", "66.7% is red");
assert(deliveryLabel(computeSupplierDelivery([po({ supplier: "Y", status: "ordered", expectedDate: "2026-01-01" })], "2026-10-13").get("y")) === "1 overdue", "overdue-only supplier says so");
// date maths is calendar-day based across a DST-length month boundary
const dst = computeSupplierDelivery([po({ supplier: "Z", expectedDate: "2026-03-28", receivedDate: "2026-03-30" })], "2026-10-13").get("z")!;
assert(dst.avgDaysLate === 2, "calendar days, not hours (DST-safe)");
