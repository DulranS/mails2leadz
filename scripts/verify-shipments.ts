// Shipments: stage order, required dates, proof of delivery, overdue and timing figures. Hand-worked cases for lib/shipments.ts.
//
// Run: npx tsx scripts/verify-shipments.ts

import {
  cleanShipmentInput,
  daysBetween,
  isOverdue,
  nextStage,
  sortOpenShipments,
  summarizeShipments,
  validateShipmentInput,
  type ShipmentInput,
} from "../lib/shipments";
import type { Shipment } from "../lib/types";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

const base: ShipmentInput = { reference: "AWB-123", stage: "booked" };
const sh = (over: Partial<Shipment>): Shipment => ({ id: over.id ?? "x", reference: "R", stage: "booked", createdAt: 0, updatedAt: 0, ...over });

// 1. Validation: reference and stage
check(validateShipmentInput({ ...base, reference: "   " }) !== null, "a blank reference is refused");
check(validateShipmentInput({ ...base, stage: "lost" as never }) !== null, "an unknown stage is refused");
check(validateShipmentInput(base) === null, "a booked shipment with only a reference is fine");

// 2. Each stage reached needs its date
check(validateShipmentInput({ ...base, stage: "shipped" }) !== null, "on its way needs the day it left");
check(validateShipmentInput({ ...base, stage: "shipped", shippedOn: "2026-10-01" }) === null, "on its way with its date is fine");
check(validateShipmentInput({ ...base, stage: "cleared", shippedOn: "2026-10-01", arrivedOn: "2026-10-05" }) !== null, "cleared needs a cleared date too");

// 3. Proof of delivery
const fullDelivered: ShipmentInput = {
  reference: "AWB-123",
  stage: "delivered",
  shippedOn: "2026-10-01",
  arrivedOn: "2026-10-05",
  clearedOn: "2026-10-07",
  deliveredOn: "2026-10-09",
  receivedBy: "Kamal",
  proofRef: "POD-77",
};
check(validateShipmentInput(fullDelivered) === null, "a full delivered shipment with proof is fine");
check(validateShipmentInput({ ...fullDelivered, receivedBy: "" }) !== null, "delivered without a receiver is refused");
check(validateShipmentInput({ ...fullDelivered, deliveredOn: undefined }) !== null, "delivered without a delivery date is refused");

// 4. Dates must be real and must not run backwards
check(validateShipmentInput({ ...base, etaDate: "10/10/2026" }) !== null, "a non-ISO date is refused");
check(validateShipmentInput({ ...base, etaDate: "2026-13-01" }) !== null, "a month of 13 is refused");
check(
  validateShipmentInput({ ...fullDelivered, arrivedOn: "2026-10-12" }) !== null,
  "arrived after cleared-or-delivered dates is refused as out of order"
);
check(validateShipmentInput({ ...base, notes: "x".repeat(501) }) !== null, "notes over 500 characters are refused");

// 5. Cleaning: dates and proof beyond the current stage are dropped
{
  const back = cleanShipmentInput({ ...fullDelivered, stage: "shipped" });
  check(back.shippedOn === "2026-10-01", "moving back keeps the date of the stage reached");
  check(back.arrivedOn === undefined && back.clearedOn === undefined, "moving back drops later stage dates");
  check(back.deliveredOn === undefined && back.receivedBy === undefined && back.proofRef === undefined, "moving back drops delivery and proof");
}
{
  const done = cleanShipmentInput(fullDelivered);
  check(done.receivedBy === "Kamal" && done.proofRef === "POD-77", "a delivered shipment keeps its proof");
  check(done.etaDate === undefined, "a delivered shipment drops its expected day");
}
{
  const open = cleanShipmentInput({ ...base, etaDate: "2026-11-02", carrier: "  Emirates Cargo  ", origin: "" });
  check(open.etaDate === "2026-11-02", "an open shipment keeps its expected day");
  check(open.carrier === "Emirates Cargo", "text is trimmed");
  check(!("origin" in open), "an empty optional field is left out, not stored blank");
  check(open.reference === "AWB-123", "the reference is kept");
}

// 6. Overdue and the open summary
{
  const today = "2026-10-28";
  const late = sh({ id: "a", stage: "shipped", shippedOn: "2026-10-10", etaDate: "2026-10-25" });
  const onTime = sh({ id: "b", stage: "shipped", shippedOn: "2026-10-20", etaDate: "2026-11-02" });
  const doneLate = sh({ id: "c", stage: "delivered", shippedOn: "2026-09-01", arrivedOn: "2026-09-03", clearedOn: "2026-09-05", deliveredOn: "2026-10-27", receivedBy: "Ali", etaDate: "2026-09-30" });
  check(isOverdue(late, today), "an open shipment past its expected day is overdue");
  check(!isOverdue(onTime, today), "an open shipment still ahead is not overdue");
  check(!isOverdue(doneLate, today), "a delivered shipment is never overdue, even if it came late");
  const s = summarizeShipments([late, onTime, doneLate], today);
  check(s.open === 2, `two shipments are still open (got ${s.open})`);
  check(s.overdue === 1, `one open shipment is overdue (got ${s.overdue})`);
}

// 7. Delivered in the last 30 days: today and 29 days back count, 30 days back does not
{
  const today = "2026-10-28";
  const edge29 = sh({ id: "d1", stage: "delivered", deliveredOn: "2026-09-29", receivedBy: "x" });
  const edge30 = sh({ id: "d2", stage: "delivered", deliveredOn: "2026-09-28", receivedBy: "x" });
  const now = sh({ id: "d3", stage: "delivered", deliveredOn: "2026-10-28", receivedBy: "x" });
  const future = sh({ id: "d4", stage: "delivered", deliveredOn: "2026-10-30", receivedBy: "x" });
  check(summarizeShipments([edge29, edge30, now], today).deliveredLast30 === 2, "the 30-day window includes 29 days back and excludes 30");
  check(summarizeShipments([now, future], today).deliveredLast30 === 1, "a delivery dated after today is not counted yet");
}

// 8. Average days from departure to delivery
{
  const a = sh({ id: "e1", stage: "delivered", shippedOn: "2026-10-01", deliveredOn: "2026-10-11", receivedBy: "x" }); // 10
  const b = sh({ id: "e2", stage: "delivered", shippedOn: "2026-10-01", deliveredOn: "2026-10-21", receivedBy: "x" }); // 20
  const noDeparture = sh({ id: "e3", stage: "delivered", deliveredOn: "2026-10-21", receivedBy: "x" });
  check(summarizeShipments([a, b, noDeparture], "2026-10-28").avgDaysToDeliver === 15, "average of 10 and 20 days is 15 (no-departure one is left out)");
  check(summarizeShipments([sh({ id: "e4" })], "2026-10-28").avgDaysToDeliver === null, "no timed deliveries gives null, not zero");
}

// 9. Day counting across a month boundary
check(daysBetween("2026-10-28", "2026-11-02") === 5, "28 Oct to 2 Nov is 5 days");

// 10. Next stage
check(nextStage("booked") === "shipped", "after booked comes on its way");
check(nextStage("cleared") === "delivered", "after cleared comes delivered");
check(nextStage("delivered") === null, "delivered has no next stage");

// 11. Open list order: overdue first, then expected day, none last, delivered excluded
{
  const today = "2026-10-28";
  const overdueOld = sh({ id: "f1", reference: "B", stage: "shipped", etaDate: "2026-10-20" });
  const overdueNew = sh({ id: "f2", reference: "A", stage: "shipped", etaDate: "2026-10-27" });
  const soon = sh({ id: "f3", reference: "C", stage: "arrived", etaDate: "2026-11-01" });
  const noEta = sh({ id: "f4", reference: "D", stage: "booked" });
  const done = sh({ id: "f5", reference: "E", stage: "delivered", receivedBy: "x", deliveredOn: "2026-10-01" });
  const order = sortOpenShipments([noEta, soon, overdueNew, done, overdueOld], today).map((s) => s.id).join(",");
  check(order === "f1,f2,f3,f4", `open order is overdue oldest-first, then ahead by day, no-day last (got ${order})`);
}

console.log(`${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exitCode = 1;
