// Shipment reminders: one notification per shipment that is still on the way past its expected day. Hand-worked against
// today = 2026-10-28. Run: npx tsx scripts/verify-shipment-notifications.ts

import { generateShipmentNotifications } from "../lib/notification-automation";
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

const today = "2026-10-28";
const sh = (over: Partial<Shipment>): Shipment => ({ id: "s", reference: "AWB-1", stage: "shipped", createdAt: 0, updatedAt: 0, ...over });

// 1. Overdue and still on the way: one notification, pointing at the shipment
{
  const n = generateShipmentNotifications([sh({ id: "a", reference: "BL-9", etaDate: "2026-10-20" })], today);
  check(n.length === 1, `one overdue shipment gives one notification (got ${n.length})`);
  check(n[0]?.type === "shipment_overdue", "the notification type is shipment_overdue");
  check(n[0]?.entityId === "a" && n[0]?.entityType === "shipment", "it points at the shipment");
  check(n[0]?.dueDate === "2026-10-20", "its due date is the expected day");
  check(n[0]?.title === "Shipment overdue: BL-9", "the title names the reference");
  check(n[0]?.message === "Expected 2026-10-20, 8 days ago. Still at: On its way.", `the message says how late it is (got "${n[0]?.message}")`);
  check(n[0]?.isRead === false, "it starts unread");
}

// 2. Priority rises with lateness, using the same scale as lead follow-ups
{
  const days3 = generateShipmentNotifications([sh({ etaDate: "2026-10-25" })], today)[0];
  const days20 = generateShipmentNotifications([sh({ etaDate: "2026-10-08" })], today)[0];
  check(days3?.priority === "medium", "3 days late is medium priority");
  check(days20?.priority === "high", "20 days late is high priority");
}

// 3. Not raised: delivered, not yet due, or no expected day
check(generateShipmentNotifications([sh({ stage: "delivered", etaDate: "2026-10-20", deliveredOn: "2026-10-22", receivedBy: "x" })], today).length === 0, "a delivered shipment raises nothing");
check(generateShipmentNotifications([sh({ etaDate: "2026-11-02" })], today).length === 0, "a shipment not yet due raises nothing");
check(generateShipmentNotifications([sh({ etaDate: undefined })], today).length === 0, "a shipment with no expected day raises nothing");
check(generateShipmentNotifications([sh({ etaDate: "2026-10-28" })], today).length === 0, "due today is not late yet");

// 4. Several shipments: one each, the others left out
{
  const n = generateShipmentNotifications(
    [sh({ id: "x", etaDate: "2026-10-01" }), sh({ id: "y", etaDate: "2026-11-30" }), sh({ id: "z", etaDate: "2026-10-27" })],
    today
  );
  check(n.map((r) => r.entityId).join(",") === "x,z", `only the late ones, in order (got ${n.map((r) => r.entityId).join(",")})`);
}

console.log(`${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exitCode = 1;
