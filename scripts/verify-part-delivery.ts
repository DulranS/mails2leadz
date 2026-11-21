// Part deliveries on web orders (lib/partialDelivery.ts and the delivery run): an order starts open, goes part-delivered, and is delivered only when every line
// is complete; a delivery above what is left is refused; the order date is set only when fully delivered; the whole-order button brings every line up to
// full; values are worked out from what was delivered. Worked numbers. Run: npx tsx scripts/verify-part-delivery.ts
import fs from "node:fs";
import { orderDeliveryState, recordPartDelivery, completeAll, type PdLine } from "../lib/partialDelivery";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const order: PdLine[] = [{ name: "Cake", qty: 10, unitPrice: 500 }, { name: "Bread", qty: 4, unitPrice: 200 }];
ok(orderDeliveryState(order).status === "open", "a new order is open");

const first = recordPartDelivery(order, 0, 6, "2026-11-10");
ok(first.ok && first.lines[0].deliveredQty === 6 && !first.fullyDelivered && first.deliveredOn === undefined, "6 of 10 cakes delivered: the line shows 6, and the order is not yet dated as delivered");
const s1 = orderDeliveryState(first.ok ? first.lines : order);
ok(s1.status === "part_delivered" && s1.deliveredValue === 3000 && s1.outstandingValue === 2800, "part delivered: 3,000 delivered (6 cakes at 500), 2,800 still to go (4 cakes at 500 and 4 loaves at 200)");

ok(!recordPartDelivery(first.ok ? first.lines : order, 0, 5, "2026-11-11").ok, "delivering 5 more cakes is refused when only 4 are left");
ok(!recordPartDelivery(order, 0, 0, "2026-11-11").ok && !recordPartDelivery(order, 0, -1, "2026-11-11").ok, "a zero or negative delivery is refused");
ok(!recordPartDelivery(order, 5, 1, "2026-11-11").ok, "a line that is not on the order is refused");
ok(!recordPartDelivery(order, 0, 1, "2026-02-30").ok, "a date that does not exist is refused");

const rest = recordPartDelivery(first.ok ? first.lines : order, 0, 4, "2026-11-12");
ok(rest.ok && rest.lines[0].deliveredQty === 10 && !rest.fullyDelivered, "the remaining 4 cakes are delivered; the order still waits on the bread");
const bread = recordPartDelivery(rest.ok ? rest.lines : order, 1, 4, "2026-11-13");
ok(bread.ok && bread.fullyDelivered && bread.deliveredOn === "2026-11-13", "once every line is complete, the order is dated as delivered on the day the last line arrived");
ok(orderDeliveryState(bread.ok ? bread.lines : order).status === "delivered", "a complete order reports as delivered");

const all = completeAll(order);
ok(all.every((l) => l.deliveredQty === l.qty) && orderDeliveryState(all).status === "delivered", "the whole-order button brings every line to its full quantity");
ok(orderDeliveryState(order).outstandingValue === 5000 + 800, "an untouched order's outstanding value is every line at its price");

const panel = read("components/ops/DeliveryRunPanel.tsx");
ok(panel.includes("recordPartDelivery(") && panel.includes("completeAll("), "the delivery run records a part delivery, and the whole-order button uses the same record");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
