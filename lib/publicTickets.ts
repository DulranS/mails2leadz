// Online seat requests for ticketed events (app/tickets/[businessId], app/api/tickets). Pure: no I/O.
// A request is not a sale and holds no seat. It reaches the owner as a notification; the owner confirms with the customer and sells
// the seats on the Events page as usual. The public page shows only what a customer needs: name, day, time, price, seats left.
import type { GameEvent, Sale } from "./types";

export const MAX_SEATS_PER_REQUEST = 10;
export const PUBLIC_EVENT_DAYS_AHEAD = 180;

export interface PublicEvent { id: string; name: string; date: string; startTime: string; ticketPrice: number; remaining: number }

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Scheduled events the owner opened to online requests, from today to six months ahead, soonest first, with seats left.
export function publicEvents(events: GameEvent[], sales: Pick<Sale, "eventId" | "qty">[], today: string): PublicEvent[] {
  const last = addDaysIso(today, PUBLIC_EVENT_DAYS_AHEAD);
  return events
    .filter((e) => e.status === "scheduled" && e.onlineRequests === true && e.date >= today && e.date <= last)
    .map((e) => {
      const sold = sales.filter((s) => s.eventId === e.id).reduce((n, s) => n + s.qty, 0);
      return { id: e.id, name: e.name, date: e.date, startTime: e.startTime, ticketPrice: e.ticketPrice, remaining: Math.max(0, e.capacity - sold) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export interface TicketRequestInput { eventId: string; seats: number; name: string; contact: string; notes?: string }

export function validateTicketRequest(i: TicketRequestInput, visible: PublicEvent[]): { ok: true; event: PublicEvent } | { ok: false; error: string } {
  const event = visible.find((e) => e.id === i.eventId);
  if (!event) return { ok: false, error: "That event is not taking seat requests right now." };
  const name = (i.name ?? "").trim();
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Enter your name." };
  const contact = (i.contact ?? "").trim();
  if (contact.length < 5 || contact.length > 200 || !(/@/.test(contact) || /\d{7,}/.test(contact.replace(/\D/g, "")))) return { ok: false, error: "Enter a phone number or email so the business can reach you." };
  if (!Number.isInteger(i.seats) || i.seats < 1) return { ok: false, error: "Enter how many seats you want." };
  if (i.seats > MAX_SEATS_PER_REQUEST) return { ok: false, error: `Request up to ${MAX_SEATS_PER_REQUEST} seats at a time.` };
  if (event.remaining === 0) return { ok: false, error: "This event is sold out." };
  if (i.seats > event.remaining) return { ok: false, error: `Only ${event.remaining} seat${event.remaining === 1 ? "" : "s"} left.` };
  if ((i.notes ?? "").length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  return { ok: true, event };
}
