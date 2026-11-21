// Bookings recorded as sales (lib/bookings.ts), the transaction and guards in DataContext, the period lock, and the page.
// Hand-worked cases first, then the wiring that must exist. Run: /home/claude/.npm-global/bin/tsx scripts/verify-booking-sale.ts
import fs from "node:fs";
import {
  BOOKING_SALE_PAYMENTS, MAX_BOOKING_SALE_LIST, MAX_SALE_PRICE, bookingDeleteProblem, bookingSaleProblem, bookingStatusProblem,
  saleAmountProblem, saleDraftFor, saleOfferings,
} from "../lib/bookings";
import type { Booking, BookingStatus } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const booking = (o: Partial<Booking> = {}): Booking => ({
  id: "b1", customerName: "Ana Perera", contact: "+94 77 000 0000", service: "Haircut", date: "2026-10-30", startTime: "10:00",
  durationMin: 45, status: "done" as BookingStatus, createdAt: 0, updatedAt: 0, ...o,
});
const TODAY = "2026-11-01";

// 1. A Done booking that has happened can be recorded.
ok(bookingSaleProblem(booking(), TODAY) === null, "a Done booking from the past can be recorded");
ok(bookingSaleProblem(booking({ date: TODAY }), TODAY) === null, "a Done booking from today can be recorded");

// 2. Not Done: refused, with the reason.
for (const s of ["booked", "no_show", "cancelled"] as BookingStatus[]) {
  const p = bookingSaleProblem(booking({ status: s }), TODAY);
  ok(p !== null && p.includes("Mark the booking Done"), `a ${s} booking cannot be recorded`);
}

// 3. One sale per booking.
ok(bookingSaleProblem(booking({ saleId: "s9" }), TODAY)?.includes("already recorded") === true, "a booking with a sale cannot get a second");

// 4. A booking in the future cannot be recorded.
ok(bookingSaleProblem(booking({ date: "2026-11-02" }), TODAY)?.includes("future") === true, "a booking in the future cannot be recorded");

// 5. Amounts: above zero, within the cap, numbers only.
ok(saleAmountProblem(0) !== null, "a zero price is refused");
ok(saleAmountProblem(-5) !== null, "a negative price is refused");
ok(saleAmountProblem(NaN) !== null, "a price that is not a number is refused");
ok(saleAmountProblem(Infinity) !== null, "an infinite price is refused");
ok(saleAmountProblem(MAX_SALE_PRICE + 1) !== null, "a price above the cap is refused");
ok(saleAmountProblem(MAX_SALE_PRICE) === null, "a price at the cap is allowed");
ok(saleAmountProblem(45.5) === null, "a normal price is allowed");

// 6. Status: a booking with a sale stays Done.
ok(bookingStatusProblem({ saleId: "s1" }, "booked") !== null, "a booking with a sale cannot go back to booked");
ok(bookingStatusProblem({ saleId: "s1" }, "cancelled") !== null, "a booking with a sale cannot be cancelled");
ok(bookingStatusProblem({ saleId: "s1" }, "done") === null, "a booking with a sale can stay Done");
ok(bookingStatusProblem({}, "cancelled") === null, "a booking without a sale can change status");

// 7. Delete: a booking with a sale cannot be deleted.
ok(bookingDeleteProblem({ saleId: "s1" }) !== null, "a booking with a sale cannot be deleted");
ok(bookingDeleteProblem({}) === null, "a booking without a sale can be deleted");

// 8. Services only, active only, sorted by name.
const products = [
  { id: "p1", name: "Shampoo", type: "product", active: true, defaultSellPrice: 300 },
  { id: "s2", name: "Trim", type: "service", active: true, defaultSellPrice: 500 },
  { id: "s1", name: "Colour", type: "service", active: true, defaultSellPrice: 2000 },
  { id: "s3", name: "Old service", type: "service", active: false },
];
const offers = saleOfferings(products);
ok(offers.map((o) => o.id).join(",") === "s1,s2", "only active services are offered, by name");

// 9. The sale draft: one unit, the price charged, the booking's day and customer, optional fields left out when blank.
const draft = saleDraftFor(booking({ contact: undefined }), "s1", 2000.456, "card");
ok(draft.qty === 1, "a booking sells one unit");
ok(draft.unitPrice === 2000.46, "the price is rounded to cents");
ok(draft.date === "2026-10-30" && draft.customer === "Ana Perera", "the sale carries the booking's day and customer");
ok(draft.paymentMethod === "card", "the payment method chosen is kept");
ok(!("customerContact" in draft), "a blank contact is left out, not set to undefined");
ok(draft.notes === "From booking 2026-10-30 10:00, 45 min.", "notes say which booking it came from");
const withDeposit = saleDraftFor(booking({ depositAmount: 500 }), "s1", 2000, "cash");
ok(withDeposit.notes?.includes("A deposit of 500 was taken earlier") === true, "a recorded deposit is mentioned in the notes");
ok(saleDraftFor(booking({ contact: "x" }), "s1", 10, "cash").customerContact === "x", "a contact is carried onto the sale");
ok(saleDraftFor(booking(), "s1", 10, "cash", "  Walk-in ").saleChannel === "Walk-in", "the channel the customer came in by is kept, trimmed");
ok(!("saleChannel" in saleDraftFor(booking(), "s1", 10, "cash", "Not recorded")), "'Not recorded' is not stored as a channel");
ok(!("saleChannel" in saleDraftFor(booking(), "s1", 10, "cash")), "a blank channel is left off the sale");
ok(fs.readFileSync("app/bookings/page.tsx", "utf8").includes("booking-sale-channels"), "the record form offers the channel presets");

// 10. Payments are the ones a sale can be paid by in full, never credit.
ok((BOOKING_SALE_PAYMENTS as { value: string }[]).every((m) => m.value !== "credit"), "credit is not offered on a booking sale");
ok(MAX_BOOKING_SALE_LIST === 50, "the to-record list is capped at 50");

// 11. Wiring.
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(ctx.includes("recordBookingSale: (bookingId: string"), "DataContext declares recordBookingSale");
ok(/recordBookingSale: async \(bookingId, sale\) => \{[\s\S]*?runTransaction\(db/.test(ctx), "recordBookingSale runs in one transaction");
ok(/recordBookingSale: async[\s\S]*?tx\.set\(saleRef[\s\S]*?tx\.update\(bookingRef, \{ saleId: saleRef\.id/.test(ctx), "the transaction saves the sale and links the booking together");
ok(/recordBookingSale: async[\s\S]*?if \(b\.saleId\) throw/.test(ctx), "the transaction refuses a second sale for the same booking");
ok(/updateBooking: async[\s\S]*?bookingStatusProblem\(old, b\.status\)/.test(ctx), "updateBooking refuses a status change away from a sale");
ok(/updateBooking: async[\s\S]*?\.\.\.\(old\.saleId \? \{ saleId: old\.saleId \} : \{\}\)/.test(ctx), "updateBooking keeps the sale link whatever the form sends");
ok(/deleteSale: async[\s\S]*?linkedBookings = bookings\.filter\(\(b\) => b\.saleId === docId\)[\s\S]*?cascadeDelete\("sales"[\s\S]*?linkedBookings, linkedLeads\);/.test(ctx), "deleting a sale clears the link on its booking, in the same batch");
ok(/deleteBooking: async[\s\S]*?bookingDeleteProblem\(snap\.data\(\) as Booking\)/.test(ctx), "deleteBooking refuses a booking with a sale");
const guards = fs.readFileSync("lib/periodGuards.ts", "utf8");
ok(guards.includes("recordBookingSale: (args) => [args[1]?.date]"), "the period lock covers the sale date of a booking sale");
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(types.includes("saleId?: string;"), "Booking has a saleId field");
const page = fs.readFileSync("app/bookings/page.tsx", "utf8");
ok(page.includes("Record as sale") && page.includes("Done, not yet a sale"), "the bookings page offers Record as sale");
ok(page.includes("await recordBookingSale(saleFor.id"), "the page records through the transaction, not two writes");
ok(page.includes("const canSell = can(role, \"manage:sales\") || can(role, \"create:sale\")"), "the button needs permission to make sales");
const manual = fs.readFileSync("USER-MANUAL.md", "utf8");
ok(manual.includes("Record as sale"), "the manual explains recording a sale from a booking");
ok(manual.includes("**Limits.**") && manual.includes("One sale per booking."), "the manual states the limits");
ok(manual.includes("puts its booking back under"), "the manual says a deleted sale returns its booking to Done");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
