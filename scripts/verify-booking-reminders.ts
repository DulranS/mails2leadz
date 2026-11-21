// Booking reminders (lib/bookingReminders.ts) and their wiring into Notifications. Hand-worked cases, all local time.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-booking-reminders.ts
import fs from "node:fs";
import { generateBookingReminders, bookingStartMs } from "../lib/bookingReminders";
import type { Booking, BookingStatus } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const booking = (o: Partial<Booking> & { customerName: string; date: string; startTime: string }): Booking => ({
  id: o.customerName.toLowerCase(),
  service: "Haircut",
  durationMin: 30,
  status: "booked" as BookingStatus,
  createdAt: 0,
  updatedAt: 0,
  ...o,
});

const now = new Date(2026, 10, 1, 9, 0); // 1 Nov 2026, 09:00 local

// 1. A booking in 3 hours is reminded, at high priority only when within 2 hours.
const soon = booking({ customerName: "Ana", date: "2026-11-01", startTime: "12:00" });
const r1 = generateBookingReminders([soon], now);
ok(r1.length === 1, "a booking 3h ahead gets one reminder");
ok(r1[0]?.type === "booking_soon", "reminder type is booking_soon");
ok(r1[0]?.priority === "medium", "3h ahead is medium priority");
ok(r1[0]?.entityId === soon.id && r1[0]?.entityType === "booking", "reminder points at the booking");
ok(r1[0]?.dueDate === "2026-11-01T12:00", "dueDate carries the date and start time");
ok(r1[0]?.isRead === false, "a new reminder is unread");
ok(r1[0]?.title === "Booking at 12:00: Ana", "title names the time and customer");

// 2. Within two hours is high priority.
const urgent = booking({ customerName: "Ben", date: "2026-11-01", startTime: "10:30" });
const r2 = generateBookingReminders([urgent], now);
ok(r2[0]?.priority === "high", "1.5h ahead is high priority");

// 3. Not 'booked' (done, cancelled, no-show) gets no reminder.
const statuses: BookingStatus[] = ["done", "cancelled", "no_show"];
for (const s of statuses) {
  const r = generateBookingReminders([booking({ customerName: "Cy", date: "2026-11-01", startTime: "11:00", status: s })], now);
  ok(r.length === 0, `a ${s} booking gets no reminder`);
}

// 4. Past bookings and bookings more than 24 hours away get none.
const past = booking({ customerName: "Dee", date: "2026-11-01", startTime: "08:00" });
const far = booking({ customerName: "Eli", date: "2026-11-03", startTime: "10:00" });
ok(generateBookingReminders([past], now).length === 0, "a booking already started gets no reminder");
ok(generateBookingReminders([far], now).length === 0, "a booking two days away gets no reminder yet");

// 5. Exactly 24 hours ahead is included; one minute beyond is not.
const edge = booking({ customerName: "Fay", date: "2026-11-02", startTime: "09:00" });
const beyond = booking({ customerName: "Gus", date: "2026-11-02", startTime: "09:01" });
ok(generateBookingReminders([edge], now).length === 1, "a booking exactly 24h ahead is included");
ok(generateBookingReminders([beyond], now).length === 0, "a booking a minute past 24h is not");

// 6. Sorted by start time, soonest first.
const many = generateBookingReminders(
  [booking({ customerName: "Late", date: "2026-11-01", startTime: "15:00" }), booking({ customerName: "Early", date: "2026-11-01", startTime: "10:00" })],
  now,
);
ok(many.map((n) => n.entityId).join(",") === "early,late", "reminders run soonest first");

// 7. Resource and deposit appear in the message only when recorded.
const withExtras = generateBookingReminders(
  [booking({ customerName: "Hal", date: "2026-11-01", startTime: "13:00", resource: "Chair 2", depositAmount: 50 })],
  now,
)[0];
ok(withExtras?.message.includes("with Chair 2") === true, "resource is named when set");
ok(withExtras?.message.includes("A deposit was recorded.") === true, "a recorded deposit is mentioned");
const plain = generateBookingReminders([soon], now)[0];
ok(plain?.message.includes("with ") === false, "no resource text when none is set");

// 8. An unreadable date or time is skipped, never thrown on.
ok(bookingStartMs({ date: "", startTime: "10:00" }) === null, "blank date gives no start");
ok(bookingStartMs({ date: "2026-11-01", startTime: "xx" }) === null, "bad time gives no start");
const broken = generateBookingReminders([booking({ customerName: "Ivy", date: "bad", startTime: "10:00" })], now);
ok(broken.length === 0, "a broken booking is skipped");

// 9. Wiring: the type exists, Notifications label it, and the context creates and de-duplicates them.
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(types.includes('| "booking_soon"'), "NotificationType includes booking_soon");
const page = fs.readFileSync("app/notifications/page.tsx", "utf8");
ok(page.includes('booking_soon: "Booking coming up"'), "Notifications page labels booking_soon");
const ctx = fs.readFileSync("contexts/NotificationsContext.tsx", "utf8");
ok(ctx.includes("generateBookingReminders(bookings, new Date())"), "context generates booking reminders");
ok(ctx.includes('n.type === "booking_soon"'), "context keys booking reminders by date and time");
ok(/bookings,\n    notifications,\n  \]\);/.test(ctx), "bookings are in the effect's dependencies");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
