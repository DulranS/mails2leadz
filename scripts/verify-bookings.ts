// Bookings (lib/bookings.ts, app/bookings/page.tsx, the bookings rules and data layer). Hand-worked against today = 2026-10-27
// (a Tuesday; that week runs Mon 26 Oct to Sun 1 Nov). Run: npx tsx scripts/verify-bookings.ts
import fs from "node:fs";
import {
  clashes, cleanBookingInput, demandByMonth, demandByWeekday, monthsOfHistory, seasonalReady, summarizeBookings, toMinutes,
  validateBookingInput, weekPlan, type BookingInput,
} from "../lib/bookings";
import type { Booking } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-10-27";

const B = (p: Partial<Booking> & Pick<Booking, "id" | "date" | "startTime" | "durationMin" | "status">): Booking =>
  ({ customerName: "Kamal", service: "Haircut", createdAt: 0, updatedAt: 0, ...p } as Booking);
const bookings: Booking[] = [
  B({ id: "a", date: "2026-10-28", startTime: "09:00", durationMin: 60, status: "booked", customerName: "Kamal", depositAmount: 500 }),
  B({ id: "b", date: "2026-10-28", startTime: "10:00", durationMin: 60, status: "booked", resource: "Chair 2", depositAmount: 250.5 }),
  B({ id: "c", date: "2026-10-28", startTime: "09:30", durationMin: 30, status: "cancelled" }),
  B({ id: "d", date: "2026-10-28", startTime: "11:00", durationMin: 30, status: "booked" }),
  B({ id: "e", date: "2026-10-26", startTime: "08:00", durationMin: 30, status: "done" }),
  B({ id: "f", date: "2026-10-20", startTime: "08:00", durationMin: 30, status: "no_show" }),
  B({ id: "g", date: "2026-09-01", startTime: "08:00", durationMin: 30, status: "cancelled" }),
];

// ---- time and validation --------------------------------------------------------------------------------------------------
ok(toMinutes("09:30") === 570 && toMinutes("00:00") === 0 && toMinutes("23:59") === 1439, "24-hour times convert to minutes");
ok(toMinutes("24:00") === null && toMinutes("9:30") === null && toMinutes("09:60") === null && toMinutes(undefined) === null, "bad times are refused, not guessed");

const good: BookingInput = { customerName: "Kamal", service: "Haircut", date: "2026-10-28", startTime: "09:00", durationMin: 60, status: "booked" };
ok(validateBookingInput(good) === null, "a complete booking is accepted");
ok(validateBookingInput({ ...good, customerName: " " }) !== null, "a booking with nobody named is refused");
ok(validateBookingInput({ ...good, service: "" }) !== null, "a booking with no service is refused");
ok(validateBookingInput({ ...good, date: "28/10/2026" }) !== null, "a booking with a bad day is refused");
ok(validateBookingInput({ ...good, startTime: "25:00" }) !== null, "a booking with a bad start time is refused");
ok(validateBookingInput({ ...good, durationMin: 3 }) !== null, "a booking shorter than 5 minutes is refused");
ok(validateBookingInput({ ...good, durationMin: 1441 }) !== null, "a booking longer than a day is refused");
ok(validateBookingInput({ ...good, startTime: "23:30", durationMin: 60 }) !== null, "a booking that runs past midnight is refused");
ok(validateBookingInput({ ...good, depositAmount: -5 }) !== null, "a negative deposit is refused");
ok(validateBookingInput({ ...good, status: "paid" as any }) !== null, "an unknown status is refused");
ok(validateBookingInput({ ...good, startTime: "22:00", durationMin: 120 }) === null, "a booking ending exactly at midnight is fine");

const cleaned = cleanBookingInput({ ...good, resource: "   ", depositAmount: 0, contact: " 0771234567 ", notes: "  " });
ok(!("resource" in cleaned) && !("depositAmount" in cleaned) && !("notes" in cleaned), "blank resource, zero deposit and blank notes are not saved");
ok(cleaned.contact === "0771234567", "contact is trimmed and kept");
ok(cleanBookingInput({ ...good, depositAmount: 10.5 }).depositAmount === 10.5, "a deposit is kept to the cent");

// ---- clashes --------------------------------------------------------------------------------------------------------------
// On the 28th: a (09:00-10:00, no resource), b (10:00-11:00, Chair 2), c (cancelled, ignored), d (11:00-11:30, no resource).
const ids = (c: Parameters<typeof clashes>[0], self?: string) => clashes(c, bookings, self).map((x) => x.id).sort().join(",");
ok(ids({ date: "2026-10-28", startTime: "09:30", durationMin: 60, resource: "" }) === "a", "an overlapping time on the default lane clashes with that booking");
ok(ids({ date: "2026-10-28", startTime: "10:00", durationMin: 60, resource: "Chair 2" }) === "b", "the same time with the same resource clashes");
ok(ids({ date: "2026-10-28", startTime: "10:00", durationMin: 60, resource: "chair 2" }) === "b", "resource names are matched without caring about case or spaces");
ok(ids({ date: "2026-10-28", startTime: "10:00", durationMin: 60, resource: "" }) === "", "back to back is fine: 10:00 to 11:00 touches a (ends at 10:00) and d (starts at 11:00) without overlapping");
ok(ids({ date: "2026-10-28", startTime: "09:00", durationMin: 60, resource: "" }, "a") === "", "a booking never clashes with itself when being edited");
ok(ids({ date: "2026-10-28", startTime: "08:30", durationMin: 60, resource: "" }) === "a", "starting before and running into a clashes");
ok(ids({ date: "2026-10-28", startTime: "09:30", durationMin: 30, resource: "Chair 9" }) === "", "a different resource at the same time does not clash");
ok(ids({ date: "2026-10-29", startTime: "09:00", durationMin: 60, resource: "" }) === "", "another day never clashes");
ok(ids({ date: "2026-10-28", startTime: "09:30", durationMin: 30, resource: "" }) === "a", "cancelled bookings never block a slot (c is ignored)");
// Finished and no-show bookings are history, never a clash: they must not block a slot.
const history = [
  ...bookings,
  B({ id: "h", date: "2026-10-28", startTime: "13:00", durationMin: 60, status: "no_show" }),
  B({ id: "k", date: "2026-10-28", startTime: "14:00", durationMin: 60, status: "done" }),
];
ok(clashes({ date: "2026-10-28", startTime: "13:00", durationMin: 60, resource: "" }, history).length === 0, "a no-show never blocks a slot");
ok(clashes({ date: "2026-10-28", startTime: "14:00", durationMin: 60, resource: "" }, history).length === 0, "a finished booking never blocks a slot");

// ---- the week -------------------------------------------------------------------------------------------------------------
// The week from Mon 26 Oct: Monday has e (done, 30 min). Wednesday the 28th has a (60), b (60), d (30) booked; c is cancelled.
const plan = weekPlan(bookings, TODAY);
ok(plan.length === 7 && plan[0].date === "2026-10-26" && plan[6].date === "2026-11-01", "the week runs Monday to Sunday");
ok(plan[0].count === 1 && plan[0].minutes === 30, "Monday counts a finished booking");
ok(plan[2].count === 3 && plan[2].minutes === 150, "Wednesday counts 3 booked, 150 minutes, and skips the cancelled one");

// Only bookings still to happen are "still to come": a booked one on an earlier day is not.
ok(summarizeBookings([B({ id: "p", date: "2026-10-10", startTime: "09:00", durationMin: 30, status: "booked" }), B({ id: "q", date: "2026-11-02", startTime: "09:00", durationMin: 30, status: "booked" })], TODAY).upcomingBooked === 1, "a booking still marked booked on an earlier day is not 'still to come'");
// The 90-day window: a cancellation on the 30th of July is inside it, the 29th is not (1 cancellation of 2 counted = one half).
const window = [B({ id: "w1", date: "2026-07-29", startTime: "09:00", durationMin: 30, status: "cancelled" }), B({ id: "w2", date: "2026-07-30", startTime: "09:00", durationMin: 30, status: "cancelled" }), B({ id: "w3", date: "2026-10-26", startTime: "09:00", durationMin: 30, status: "done" })];
ok(summarizeBookings(window, TODAY).cancelledRate === 0.5, `90-day window: a cancellation on the 30th of July counts, on the 29th does not (got ${summarizeBookings(window, TODAY).cancelledRate})`);

const s = summarizeBookings(bookings, TODAY);
ok(s.thisWeekCount === 4 && s.thisWeekHours === 3, `this week: 4 bookings, 3 hours (got ${s.thisWeekCount}, ${s.thisWeekHours})`);
ok(s.upcomingBooked === 3, "three bookings are still to come");
ok(s.depositsHeld === 750.5, "deposits on bookings still to come add up (500 + 250.5)");
ok(s.noShowRate === 0.5, "no-show rate: 1 no-show out of 1 finished and 1 missed");
// Last 90 days, not still to happen: e (done 26th), f (no-show 20th), g (cancelled 1st Sept). One of three cancelled = 1/3.
ok(s.cancelledRate !== null && Math.abs(s.cancelledRate - 1 / 3) < 1e-9, `cancelled rate over 90 days is 1 in 3 (got ${s.cancelledRate})`);
ok(summarizeBookings([], TODAY).noShowRate === null && summarizeBookings([], TODAY).cancelledRate === null, "no history: rates are empty, not zero");

// ---- seasonal demand ------------------------------------------------------------------------------------------------------
// October (not cancelled): a, b, d, e, f = 5. Weekdays: Wed the 28th x3 (a, b, d); Mon the 26th x1 (e); Tue the 20th x1 (f).
const month = demandByMonth(bookings);
ok(month[9] === 5 && month.reduce((x, y) => x + y, 0) === 5, "October has 5 bookings, cancelled ones left out");
const wd = demandByWeekday(bookings);
ok(wd[3] === 3 && wd[1] === 1 && wd[2] === 1 && wd.reduce((x, y) => x + y, 0) === 5, "Wednesday 3, Monday 1, Tuesday 1");
ok(monthsOfHistory(bookings) === 2, "history from 1 Sept to 28 Oct spans two calendar months (September and October)");
ok(!seasonalReady(bookings), "a few months of history does not show a seasonal pattern");
const sixMonths = [B({ id: "s1", date: "2026-01-05", startTime: "09:00", durationMin: 30, status: "done" }), B({ id: "s2", date: "2026-06-20", startTime: "09:00", durationMin: 30, status: "done" })];
ok(monthsOfHistory(sixMonths) === 6 && !seasonalReady(sixMonths), "six months of history is not yet a seasonal pattern");
const year = [B({ id: "y1", date: "2025-01-05", startTime: "09:00", durationMin: 30, status: "done" }), B({ id: "y2", date: "2025-12-20", startTime: "09:00", durationMin: 30, status: "done" })];
ok(monthsOfHistory(year) === 12 && seasonalReady(year), "a full calendar year of history shows the seasonal pattern");

// ---- wiring ---------------------------------------------------------------------------------------------------------------
const rules = read("firestore.rules");
ok(/match \/bookings\/\{docId\} \{\s*allow read: if isOwnerOrActiveMember\(businessId\);\s*allow create, update: if isOwnerOrOperatingMember\(businessId\);\s*allow delete: if isOwnerOrManager\(businessId\) && !isPublicDemo\(businessId\);/.test(rules), "bookings rules: any active member reads, owner/manager/staff write, owner/manager delete, never in the demo");
ok(!/match \/bookings[\s\S]{0,200}isAccountant/.test(rules), "the accountant cannot write bookings");
const dc = read("contexts/DataContext.tsx");
ok(/(?:onSnapshot|trackedSnapshot)\(query\(collection\(db, "users", businessId, "bookings"\), orderBy\("createdAt", "desc"\)\)/.test(dc), "bookings listener is ordered by createdAt");
ok(/"locations", "bookings", "shipments"/.test(dc), "staff load bookings (the front desk needs them) and shipments");
// Every role that waits on bookings must have a listener that runs for it: the bookings listener sits outside the owner/manager block.
{
  const listenerAt = dc.indexOf('collection(db, "users", businessId, "bookings")');
  const ownerBlockAt = dc.indexOf("if (isOwnerOrManager) {");
  const ownerBlockEnd = dc.indexOf("if (role === \"staff\") {");
  ok(listenerAt > 0 && !(listenerAt > ownerBlockAt && listenerAt < ownerBlockEnd), "the bookings listener is not inside the owner/manager-only block, so staff get it too");
}
ok(/requirePermission\("manage:bookings"\)/.test(dc), "booking writes are gated by permission");
const perms = read("lib/permissions.ts");
ok(/staff: \[[\s\S]*?"manage:bookings",[\s\S]*?\]/.test(perms), "staff may manage bookings");
ok(/OWNER_MANAGER_SHARED: Permission\[\] = \[[\s\S]*?"manage:tasks"[\s\S]*?\];/.test(perms), "owner and manager may manage tasks");
const page = read("app/bookings/page.tsx");
ok(/const clash = clashes\(clean, bookings, editing\?\.id\)\[0\];/.test(page), "saving a booking is refused when it clashes");
ok(/if \(clean\.status === "booked"\)/.test(page), "only bookings still to happen block a slot");
ok(/seasonalReady\(bookings\)/.test(page) && /The seasonal view appears once you have a full year/.test(page), "the seasonal view waits for a full year of history");
ok(!/updateSettings|addSale|addPurchase|addTimeEntry/.test(page), "the bookings page changes no books");
// Stat takes a string value (components/ui.tsx). A bare number would fail the production type check, so every value is converted.
ok(!/<Stat[^>]*value=\{(?!String\(|formatMoney\(|`|[^}]*\?)[^}]*\}/.test(page), "every Stat value on the bookings page is a string");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
