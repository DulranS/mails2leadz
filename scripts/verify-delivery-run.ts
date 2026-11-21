// Delivery run sheet (lib/deliveryRun.ts, the order fields, the rule and the screen): what is still to deliver by a day, grouped by driver then area,
// earliest promise first, overdue and unassigned counted, delivered and unconfirmed orders left out, and the wiring. Run: npx tsx scripts/verify-delivery-run.ts
import fs from "node:fs";
import { deliveryRun, type RunOrder } from "../lib/deliveryRun";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const day = "2026-11-10";
const orders: RunOrder[] = [
  { id: "1", customerName: "Nimal", status: "confirmed", promisedDate: "2026-11-10", driverName: "Kasun", area: "Kandy", total: 5000 },
  { id: "2", customerName: "Dilani", status: "confirmed", promisedDate: "2026-11-08", driverName: "Kasun", area: "Kandy", total: 3000 },  // overdue
  { id: "3", customerName: "Ravi", status: "confirmed", promisedDate: "2026-11-10", area: "Galle", total: 2000 },                         // unassigned
  { id: "4", customerName: "Amal", status: "confirmed", promisedDate: "2026-11-10", deliveredOn: "2026-11-09", driverName: "Kasun", total: 1000 }, // delivered: out
  { id: "5", customerName: "Sunil", status: "new", promisedDate: "2026-11-10", driverName: "Kasun", total: 800 },                           // not confirmed: out
  { id: "6", customerName: "Later", status: "confirmed", promisedDate: "2026-11-20", driverName: "Kasun", total: 400 },                     // not due yet: out
];
const r = deliveryRun(orders, day);
ok(r.total === 3, "only confirmed, undelivered orders due by the day are on the run sheet");
ok(r.overdue === 1 && r.unassigned === 1, "one overdue order and one not yet given to a driver are counted");
const kasun = r.runs.find((x) => x.driver === "Kasun")!;
ok(kasun.stops.length === 2 && kasun.stops[0].customerName === "Dilani" && kasun.value === 8000, "a driver's stops are in promised-day order, and their value adds up (3,000 + 5,000)");
ok(r.runs.some((x) => x.driver === "Not assigned" && x.stops[0].customerName === "Ravi"), "orders with no driver are kept on their own sheet, so none is missed");
ok(deliveryRun([], day).total === 0, "no orders gives an empty run");
ok(deliveryRun([{ id: "7", customerName: "No date", status: "confirmed", total: 1 }], day).total === 1, "an order with no promised day is kept on the run, so it is not lost");

ok(tabsForRole("owner").includes("deliveryrun") && tabsForRole("manager").includes("deliveryrun") && !tabsForRole("staff").includes("deliveryrun"), "the delivery run is for the owner and manager");
ok(read("firestore.rules").includes("'deliveredOn', 'driverName', 'area'"), "the rule lets the owner or manager set a driver and an area on an order, and nothing else new");
ok(read("components/ops/DeliveryRunPanel.tsx").includes("deliveryRun(") && read("components/ops/DeliveryRunPanel.tsx").includes("updateWebOrder(id, { driverName"), "the screen reads the run and sets the driver and the area on each order");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);

// v244: the customer address from the shop is kept, and stops within an area are put in address order on the run sheet.
import { cleanWebOrder } from "../lib/webOrders";
const withAddr = cleanWebOrder({ externalId: "SHOP-9", customerName: "Ruwan", placedOn: "2026-11-09", customerAddress: "  12 Lake Road,   Kandy  ", lines: [{ name: "Chair", qty: 1 }] }, "2026-11-09");
ok(withAddr.ok && (withAddr as { value: { customerAddress?: string } }).value.customerAddress === "12 Lake Road, Kandy", "an address from the shop is kept, with spaces tidied");
const noAddr = cleanWebOrder({ externalId: "SHOP-10", customerName: "Ruwan", placedOn: "2026-11-09", lines: [{ name: "Chair", qty: 1 }] }, "2026-11-09");
ok(noAddr.ok && (noAddr as { value: { customerAddress?: string } }).value.customerAddress === undefined, "an order with no address is still accepted, with none invented");
const stops = deliveryRun([
  { id: "a", customerName: "Far", status: "confirmed", driverName: "Kasun", area: "Kandy", customerAddress: "90 Hill St", total: 1 },
  { id: "b", customerName: "Near", status: "confirmed", driverName: "Kasun", area: "Kandy", customerAddress: "12 Lake Rd", total: 1 },
], "2026-11-10").runs[0].stops.map((s) => s.customerName);
ok(stops.join() === "Near,Far", "within an area, stops are in address order, so a driver's route runs along the road");
ok(read("lib/webOrders.ts").includes("customerAddress: addressRaw || undefined") && read("app/api/v1/businesses/[businessId]/orders/route.ts").includes("customerAddress: o.customerAddress"), "the shop's address is stored with the order");
ok(read("components/ops/DeliveryRunPanel.tsx").includes("s.customerAddress"), "the run sheet shows each stop's address");
console.log(`${checks - fails}/${checks} checks passed (with addresses)`);
if (fails) process.exit(1);
