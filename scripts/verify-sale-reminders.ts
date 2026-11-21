// Reminders for finished work with no sale yet (lib/salesReminders.ts), and their wiring into Notifications.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-sale-reminders.ts
import fs from "node:fs";
import { generateSaleReminders, MAX_SALE_REMINDERS } from "../lib/salesReminders";
import type { Booking, Lead } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const TODAY = "2026-11-01";
const booking = (o: Partial<Booking>): Booking => ({ id: "b", customerName: "Ana", service: "Cut", date: "2026-10-30", startTime: "10:00", durationMin: 30, status: "done", createdAt: 0, updatedAt: 0, ...o });
const lead = (o: Partial<Lead>): Lead => ({ id: "l", name: "Ruwan", stage: "won", createdAt: 0, ...o } as Lead);

// 1. A Done booking from the past with no sale is reminded.
const r1 = generateSaleReminders([booking({})], [], TODAY);
ok(r1.length === 1 && r1[0].type === "sale_due", "a Done booking with no sale gets a sale reminder");
ok(r1[0].entityType === "booking" && r1[0].entityId === "b", "the reminder points at the booking");
ok(r1[0].title === "Record the sale for Ana", "the title names the customer");

// 2. Not reminded: a booking that has a sale, one not Done, one in the future.
ok(generateSaleReminders([booking({ saleId: "s1" })], [], TODAY).length === 0, "a booking with a sale is not reminded");
ok(generateSaleReminders([booking({ status: "booked" })], [], TODAY).length === 0, "a booked booking is not reminded");
ok(generateSaleReminders([booking({ date: "2026-11-02" })], [], TODAY).length === 0, "a booking in the future is not reminded");

// 3. A Won lead with no sale is reminded; a Won lead with a sale, or any other stage, is not.
const r3 = generateSaleReminders([], [lead({}), lead({ id: "l2", saleId: "s2" }), lead({ id: "l3", stage: "contacted" })], TODAY);
ok(r3.length === 1 && r3[0].entityType === "lead" && r3[0].entityId === "l", "only the Won lead without a sale is reminded");

// 4. The list is capped, so a long backlog cannot flood Notifications.
const many = Array.from({ length: 40 }, (_, i) => booking({ id: `b${i}`, date: "2026-10-01" }));
ok(generateSaleReminders(many, [], TODAY).length === MAX_SALE_REMINDERS, "reminders are capped");

// 5. Wiring.
const ctx = fs.readFileSync("contexts/NotificationsContext.tsx", "utf8");
ok(ctx.includes("generateSaleReminders(bookings, leads, todayIso())"), "Notifications generates sale reminders");
ok(fs.readFileSync("lib/types.ts", "utf8").includes('| "sale_due"'), "NotificationType includes sale_due");
ok(fs.readFileSync("app/notifications/page.tsx", "utf8").includes('sale_due: "Sale not recorded yet"'), "Notifications page labels sale_due");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
