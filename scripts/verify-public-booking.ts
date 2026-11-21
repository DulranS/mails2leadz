// Checks online booking requests: which requests are accepted, the times already taken, and clashes. Pure functions only.
// Run: npx tsx scripts/verify-public-booking.ts
import { validatePublicBooking, busySlots, slotProblem, addDaysIso, PUBLIC_BOOKING_DAYS_AHEAD } from "../lib/publicBooking";
import type { Booking } from "../lib/types";

let failed = false;
function check(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed = true; } else console.log("OK:", msg);
}

const today = "2026-11-02";
const base = { service: "Haircut", date: "2026-11-05", startTime: "10:00", durationMin: 60, name: "Amal", contact: "0771234567" };
const services = ["Haircut", "Colour"];

const ok = validatePublicBooking(base, services, today);
check(ok.ok && ok.input.status === "booked", "a valid request is accepted as a booked slot, not a confirmed booking");
check(!validatePublicBooking({ ...base, service: "Massage" }, services, today).ok, "a service that is not active is refused");
check(!validatePublicBooking({ ...base, date: "2026-10-30" }, services, today).ok, "a past day is refused");
check(!validatePublicBooking({ ...base, date: addDaysIso(today, PUBLIC_BOOKING_DAYS_AHEAD + 1) }, services, today).ok, "a day beyond the booking window is refused");
check(validatePublicBooking({ ...base, date: today }, services, today).ok, "today is allowed");
check(!validatePublicBooking({ ...base, contact: "12" }, services, today).ok, "a request with no usable contact is refused");
check(!validatePublicBooking({ ...base, name: "A" }, services, today).ok, "a one-letter name is refused by the shared booking rules");
check(!validatePublicBooking({ ...base, startTime: "25:00" }, services, today).ok, "an impossible start time is refused");

const b = (id: string, startTime: string, durationMin: number, status: Booking["status"], date = "2026-11-05") =>
  ({ id, customerName: "X", service: "Haircut", date, startTime, durationMin, status, createdAt: 1, updatedAt: 1 }) as Booking;
const existing = [b("1", "11:00", 60, "booked"), b("2", "09:00", 30, "cancelled"), b("3", "08:00", 30, "booked", "2026-11-06")];
const busy = busySlots(existing, "2026-11-05");
check(busy.length === 1 && busy[0].startTime === "11:00", "only booked times on that day are shown as busy; cancelled ones free the time");
check(busy.every((x) => !("customerName" in x)), "the busy list carries times only, never names");

const overlapping = validatePublicBooking({ ...base, startTime: "10:30" }, services, today);
if (overlapping.ok) {
  check(slotProblem(overlapping.input, existing) !== null, "a request overlapping a booked time is refused");
}
const clear = validatePublicBooking({ ...base, startTime: "12:00" }, services, today);
if (clear.ok) {
  check(slotProblem(clear.input, existing) === null, "a request in a free time is accepted");
}

if (failed) process.exitCode = 1; else console.log("\nALL CHECKS PASSED");
