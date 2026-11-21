// Venue clashes (lib/events.ts eventClashes, validateEventInput, the events form and the Capacity view). An event that shares a room or
// stage, and a time, with a booking clashes; a different room does not. Run: npx tsx scripts/verify-venue-clash.ts
import fs from "node:fs";
import { eventClashes, validateEventInput } from "../lib/events";
import type { Booking } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const D = "2026-11-20";
const bookings = [
  { id: "b1", customerName: "Wedding party", service: "Hall hire", resource: "Stage", date: D, startTime: "18:00", durationMin: 120, status: "booked" },
  { id: "b2", customerName: "Yoga class", service: "Class", resource: "Studio", date: D, startTime: "18:00", durationMin: 60, status: "booked" },
  { id: "b3", customerName: "Cancelled gig", service: "Hall hire", resource: "Stage", date: D, startTime: "19:00", durationMin: 60, status: "cancelled" },
  { id: "b4", customerName: "Default lane", service: "Hall hire", date: D, startTime: "20:00", durationMin: 60, status: "booked" },
] as unknown as Booking[];

const onStage = eventClashes({ date: D, startTime: "19:00", durationMin: 180, resource: "Stage" }, bookings);
ok(onStage.length === 1 && onStage[0].customerName === "Wedding party", "an event on the same stage, overlapping in time, clashes with that booking");
ok(eventClashes({ date: D, startTime: "19:00", durationMin: 60, resource: "Studio" }, bookings).length === 0, "an event in a different room does not clash with a booking in another room");
ok(eventClashes({ date: D, startTime: "19:00", durationMin: 60, resource: "Stage" }, bookings).every((b) => b.status === "booked"), "a cancelled booking never clashes");
ok(eventClashes({ date: D, startTime: "19:00", resource: "Stage" }, bookings).length === 1, "without a run length, an event is taken as three hours");
ok(eventClashes({ date: D, startTime: "20:30", durationMin: 60, status: "cancelled", resource: "Stage" }, bookings).length === 0, "a cancelled event does not clash with anything");
ok(eventClashes({ date: D, startTime: "20:00", durationMin: 60 }, bookings).length === 1, "an event with no room is in the main lane, the same lane as a blank-room booking");
ok(eventClashes({ date: "2026-11-21", startTime: "19:00", durationMin: 60, resource: "Stage" }, bookings).length === 0, "a different day does not clash");

const base = { name: "Open mic", date: D, startTime: "19:00", capacity: 40, ticketPrice: 500, ticketProductId: "svc1", status: "scheduled" as const };
ok(validateEventInput({ ...base, durationMin: 180, resource: "Stage" }) === null, "a normal room and run length pass");
ok(validateEventInput({ ...base, durationMin: 5 }) !== null && validateEventInput({ ...base, durationMin: 1000 }) !== null, "a run length must be from 15 to 720 minutes");
ok(validateEventInput({ ...base, resource: "x".repeat(61) }) !== null, "a room name is limited to 60 characters");
ok(read("app/events/page.tsx").includes("Room or stage (blank = main lane)") && read("app/events/page.tsx").includes("Runs for (minutes)"), "the event form asks for the room and how long it runs");
ok(read("components/ops/CapacityPanel.tsx").includes("Venue clashes:") && read("components/ops/CapacityPanel.tsx").includes("eventClashes(e, bookings)"), "the Capacity view lists events that clash with a booking");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
