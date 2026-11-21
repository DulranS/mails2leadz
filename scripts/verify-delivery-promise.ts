// Delivery promises to customers (lib/deliveryPromise.ts, the order intake, the stored order, and the rule): a promised day is checked like every
// other date; an order delivered on or before its promise is on time; a confirmed order past its promise with nothing delivered is overdue; only
// the owner can record a delivery day. Run: npx tsx scripts/verify-delivery-promise.ts
import fs from "node:fs";
import { cleanWebOrder } from "../lib/webOrders";
import { deliveryPromises } from "../lib/deliveryPromise";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const base = { externalId: "SHOP-1001", customerName: "Nimal", placedOn: "2026-11-02", lines: [{ name: "Chair", qty: 2 }] };
const withPromise = cleanWebOrder({ ...base, promisedDate: "2026-11-10" }, "2026-11-09");
ok(withPromise.ok && withPromise.ok && (withPromise as { value: { promisedDate?: string } }).value.promisedDate === "2026-11-10", "an order with a promised day keeps it");
const without = cleanWebOrder(base, "2026-11-09");
ok(without.ok && (without as { value: { promisedDate?: string } }).value.promisedDate === undefined, "an order with no promised day is still accepted, and nothing is invented");
ok(!cleanWebOrder({ ...base, promisedDate: "2026-02-30" }, "2026-11-09").ok, "a promised day that does not exist (30 February) is refused");
ok(!cleanWebOrder({ ...base, promisedDate: "next week" }, "2026-11-09").ok, "a promised day that is not a date is refused");

const orders = [
  { id: "a", customerName: "Early", status: "confirmed", promisedDate: "2026-11-10", deliveredOn: "2026-11-08" }, // 2 days early
  { id: "b", customerName: "Late", status: "confirmed", promisedDate: "2026-11-10", deliveredOn: "2026-11-12" },  // 2 days late
  { id: "c", customerName: "Waiting", status: "confirmed", promisedDate: "2026-11-05" },                        // past promise, not delivered
  { id: "d", customerName: "Future", status: "confirmed", promisedDate: "2026-11-20" },                         // not yet due
  { id: "e", customerName: "New", status: "new", promisedDate: "2026-11-01" },                                  // not confirmed: not judged
  { id: "f", customerName: "Plain", status: "confirmed" },                                                       // no promise: not judged
];
const dp = deliveryPromises(orders, "2026-11-09");
ok(dp.delivered.length === 2 && dp.onTime === 1 && dp.late === 1, "two delivered orders judged: one on time, one late");
ok(dp.delivered.find((d) => d.id === "a")!.bufferDays === 2 && dp.delivered.find((d) => d.id === "b")!.bufferDays === -2, "the buffer is the days delivered before the promise (negative when after)");
ok(dp.averageBufferDays === 0, "the average buffer across the two is zero days");
ok(dp.overdue.length === 1 && dp.overdue[0].id === "c" && dp.overdue[0].daysLate === 4, "an overdue order is listed with how many days it is past its promise");
ok(!dp.overdue.some((o) => o.id === "d" || o.id === "e" || o.id === "f"), "orders not yet due, not confirmed, or without a promise are not listed as overdue");
ok(deliveryPromises([], "2026-11-09").averageBufferDays === null, "with no delivered orders there is no average to show");

ok(read("lib/webOrders.ts").includes("promisedDate: promisedRaw || undefined"), "the intake keeps the promised day");
ok(read("app/api/v1/businesses/[businessId]/orders/route.ts").includes("...(o.promisedDate ? { promisedDate: o.promisedDate } : {})"), "the stored order carries the promised day");
ok(read("firestore.rules").includes("'deliveredOn', 'driverName', 'area', 'startedAt', 'finishedAt', 'promisedDate', 'customerAddress']"), "the rule lets the owner or manager record a delivery day and the v319 cycle-time and promise fields (owner/manager only), and nothing else new");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
