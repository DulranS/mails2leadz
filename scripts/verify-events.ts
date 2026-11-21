// Checks ticketed events: input rules, seat and revenue counts, sold-out and cancelled blocks, the delete guard, and the ticket sale.
// Pure functions only. Run: npx tsx scripts/verify-events.ts
import { validateEventInput, summarizeEvent, ticketSaleProblem, eventDeleteProblem, ticketSaleDraft, type GameEventInput } from "../lib/events";

let failed = false;
function check(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed = true; } else console.log("OK:", msg);
}

const good: GameEventInput = { name: "Friday Catan", date: "2026-11-06", startTime: "19:00", capacity: 20, ticketPrice: 500, ticketProductId: "svc1", status: "scheduled" };
check(validateEventInput(good) === null, "a complete event is accepted");
check(validateEventInput({ ...good, name: "A" }) !== null, "a one-letter name is refused");
check(validateEventInput({ ...good, capacity: 0 }) !== null, "zero seats are refused");
check(validateEventInput({ ...good, capacity: 2.5 }) !== null, "fractional seats are refused");
check(validateEventInput({ ...good, ticketPrice: 0 }) !== null, "a free ticket is refused (no sale can be recorded for zero)");
check(validateEventInput({ ...good, ticketProductId: "" }) !== null, "an event with no service to sell tickets under is refused");
check(validateEventInput({ ...good, startTime: "25:00" }) !== null, "an impossible start time is refused");
check(validateEventInput({ ...good, otherCosts: -5 }) !== null, "negative other costs are refused");

const sales = [
  { eventId: "e1", qty: 3, unitPrice: 500 },
  { eventId: "e1", qty: 2, unitPrice: 500 },
  { eventId: "e2", qty: 9, unitPrice: 100 },
  { qty: 4, unitPrice: 50 },
];
const s = summarizeEvent({ capacity: 20, otherCosts: 800 }, "e1", sales);
check(s.sold === 5 && s.remaining === 15, "seats sold count only this event's ticket sales");
check(s.ticketRevenue === 2500, "ticket revenue is what this event's sales add up to");
check(s.net === 1700, "the night's net is ticket revenue less other costs");
check(s.fillPct === 25, "fill is seats sold over capacity");
check(summarizeEvent({ capacity: 5 }, "e9", sales).remaining === 5, "an event with no sales has all its seats left");

check(ticketSaleProblem(2, "scheduled", 15) === null, "two seats are sold when they fit");
check(ticketSaleProblem(16, "scheduled", 15) !== null, "more seats than are left are refused");
check(ticketSaleProblem(1, "scheduled", 0) === "This event is sold out.", "a sold-out event says so");
check(ticketSaleProblem(1, "cancelled", 10) !== null, "a cancelled event sells no tickets");
check(ticketSaleProblem(0, "scheduled", 10) !== null, "zero seats are refused");

check(eventDeleteProblem("e1", sales) !== null, "an event with ticket sales cannot be deleted");
check(eventDeleteProblem("e3", sales) === null, "an event with no ticket sales can be deleted");

const draft = ticketSaleDraft({ event: { ...good, id: "e1" }, seats: 2, buyer: "  Amal ", contact: "", paymentMethod: "cash", date: "2026-11-02" });
check(draft.eventId === "e1" && draft.qty === 2 && draft.unitPrice === 500 && draft.productId === "svc1", "a ticket sale carries its event, seats, price and service");
check(draft.customer === "Amal" && !("customerContact" in draft), "the buyer's name is trimmed and an empty contact is left out");

if (failed) process.exitCode = 1; else console.log("\nALL CHECKS PASSED");
