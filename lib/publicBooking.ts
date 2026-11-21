// Online booking requests from a business's public page. Pure: the route does the reads and writes.
// A request is never a confirmed booking: it is saved as "booked" and the owner confirms or changes it. It uses the same rules
// as an internal booking (validateBookingInput, clashes), plus: only active services, a date within the next 90 days, and a
// contact number or email so the business can reply.
import { validateBookingInput, clashes, type BookingInput } from "./bookings";
import { isIsoDate } from "./playbook";
import type { Booking } from "./types";

export const PUBLIC_BOOKING_DAYS_AHEAD = 90;

export interface PublicBookingRequest {
  service: string;
  date: string;
  startTime: string;
  durationMin: number;
  name: string;
  contact: string;
  notes?: string;
}

export function validatePublicBooking(
  r: PublicBookingRequest,
  activeServices: string[],
  today: string
): { ok: true; input: BookingInput } | { ok: false; error: string } {
  if (!activeServices.includes(r.service)) return { ok: false, error: "Choose a service from the list." };
  if (!isIsoDate(r.date)) return { ok: false, error: "Choose a day." };
  const maxDay = addDaysIso(today, PUBLIC_BOOKING_DAYS_AHEAD);
  if (r.date < today || r.date > maxDay) return { ok: false, error: `Choose a day from today, up to ${PUBLIC_BOOKING_DAYS_AHEAD} days ahead.` };
  if (r.name.trim().length < 2) return { ok: false, error: "Tell us your name." };
  if ((r.contact ?? "").trim().length < 5) return { ok: false, error: "Add a phone number or email so we can confirm." };
  const input: BookingInput = {
    customerName: r.name.trim(),
    contact: r.contact.trim(),
    service: r.service,
    date: r.date,
    startTime: r.startTime,
    durationMin: r.durationMin,
    status: "booked",
    ...(r.notes?.trim() ? { notes: r.notes.trim().slice(0, 500) } : {}),
  };
  const problem = validateBookingInput(input);
  if (problem) return { ok: false, error: problem };
  return { ok: true, input };
}

// The times already taken on a day, with no names. Cancelled and no-show bookings take no time.
export function busySlots(bookings: Booking[], date: string): { startTime: string; durationMin: number }[] {
  return bookings
    .filter((b) => b.date === date && b.status === "booked")
    .map((b) => ({ startTime: b.startTime, durationMin: b.durationMin }))
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
}

export function slotProblem(input: BookingInput, bookings: Booking[]): string | null {
  return clashes(input, bookings).length > 0 ? "That time is already taken. Pick another time." : null;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
