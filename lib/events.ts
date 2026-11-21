// Ticketed events and tournaments (game nights, tournaments, launch parties). Pure: no I/O.
// Seats are sold as ordinary sales linked to the event (Sale.eventId), so tickets reach the books, tax and reports like any sale.
// An event's ticket revenue is what its sales add up to; "other costs" (prizes, venue hire) are typed by the owner and are not posted.
import { isIsoDate } from "./playbook";
import { toMinutes } from "./bookings";
import type { PaymentMethod, Sale } from "./types";

export const MAX_EVENT_CAPACITY = 500;
export const MAX_TICKET_PRICE = 1_000_000;

export interface GameEventInput {
  name: string;
  date: string; // ISO
  startTime: string; // HH:MM
  capacity: number; // seats
  resource?: string; // room or stage; blank = the main lane
  durationMin?: number; // how long it runs, minutes (default 180)
  ticketPrice: number; // per seat, base currency; must be above zero
  ticketProductId: string; // the active service the ticket sale is posted under
  otherCosts?: number; // prizes, venue hire, staff for the night; entered, not posted
  notes?: string;
  status: "scheduled" | "cancelled";
  onlineRequests?: boolean;
}

export function validateEventInput(e: GameEventInput): string | null {
  if (e.durationMin !== undefined && (!Number.isInteger(e.durationMin) || e.durationMin < 15 || e.durationMin > 720)) return "How long it runs must be a whole number of minutes from 15 to 720.";
  if (e.resource !== undefined && e.resource.length > 60) return "The room or stage name is too long.";
  const name = (e.name ?? "").trim();
  if (name.length < 2 || name.length > 120) return "Give the event a name (2 to 120 characters).";
  if (!isIsoDate(e.date)) return "Choose the date of the event.";
  if (toMinutes(e.startTime) === null) return "Enter the start time as HH:MM.";
  if (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > MAX_EVENT_CAPACITY) return `Enter the number of seats, 1 to ${MAX_EVENT_CAPACITY}.`;
  if (!Number.isFinite(e.ticketPrice) || e.ticketPrice <= 0 || e.ticketPrice > MAX_TICKET_PRICE) return "Enter the ticket price, above zero.";
  if (!e.ticketProductId) return "Choose the service the tickets are sold under.";
  if (e.otherCosts !== undefined && (!Number.isFinite(e.otherCosts) || e.otherCosts < 0)) return "Other costs cannot be negative.";
  return null;
}

export interface EventSummary {
  sold: number; // seats sold across all its ticket sales
  remaining: number;
  ticketRevenue: number; // what those sales add up to, before any returns or discounts on them
  otherCosts: number;
  net: number; // ticket revenue less other costs: the night's result before food and drink
  fillPct: number; // 0 to 100
}

export function summarizeEvent(e: Pick<GameEventInput, "capacity" | "otherCosts">, eventId: string, sales: Pick<Sale, "eventId" | "qty" | "unitPrice">[]): EventSummary {
  const mine = sales.filter((s) => s.eventId === eventId);
  const sold = mine.reduce((sum, s) => sum + s.qty, 0);
  const ticketRevenue = Math.round(mine.reduce((sum, s) => sum + s.qty * s.unitPrice, 0) * 100) / 100;
  const otherCosts = e.otherCosts ?? 0;
  return {
    sold,
    remaining: Math.max(e.capacity - sold, 0),
    ticketRevenue,
    otherCosts,
    net: Math.round((ticketRevenue - otherCosts) * 100) / 100,
    fillPct: e.capacity > 0 ? Math.min(100, Math.round((sold / e.capacity) * 100)) : 0,
  };
}

export function ticketSaleProblem(seats: number, status: GameEventInput["status"], remaining: number): string | null {
  if (status === "cancelled") return "This event is cancelled, so no tickets can be sold for it.";
  if (!Number.isInteger(seats) || seats < 1) return "Enter how many seats.";
  if (seats > remaining) return remaining === 0 ? "This event is sold out." : `Only ${remaining} seat${remaining === 1 ? "" : "s"} left.`;
  return null;
}

// An event with ticket sales stays on the books: deleting it would orphan the money. Cancel it instead.
export function eventDeleteProblem(eventId: string, sales: Pick<Sale, "eventId">[]): string | null {
  return sales.some((s) => s.eventId === eventId)
    ? "This event has ticket sales recorded, so it can't be deleted. Cancel it instead; the sales stay in the books."
    : null;
}

export function ticketSaleDraft(params: {
  event: GameEventInput & { id: string };
  seats: number;
  buyer: string;
  contact?: string;
  paymentMethod: Exclude<PaymentMethod, "credit">;
  date: string;
}): Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> {
  const { event, seats, buyer, contact, paymentMethod, date } = params;
  const draft: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> = {
    productId: event.ticketProductId,
    qty: seats,
    unitPrice: Math.round(event.ticketPrice * 100) / 100,
    date,
    customer: buyer.trim(),
    paymentMethod,
    notes: `Ticket for ${event.name} on ${event.date}`,
    eventId: event.id,
  };
  if (contact && contact.trim()) draft.customerContact = contact.trim();
  return draft;
}

// v199b: bookings that would clash with this event on the same room or stage (the booking rule, applied to the event's own time).
import { clashes as bookingClashes } from "./bookings";
export function eventClashes(e: { date: string; startTime: string; durationMin?: number; resource?: string; status?: string }, bookings: import("./types").Booking[]): import("./types").Booking[] {
  if (e.status === "cancelled") return [];
  return bookingClashes({ date: e.date, startTime: e.startTime, durationMin: e.durationMin ?? 180, resource: e.resource }, bookings);
}
