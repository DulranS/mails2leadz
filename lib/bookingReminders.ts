// Reminders for bookings that start soon (Notifications). Pure: no I/O. Local time, as the owner sees the clock.
//
// A reminder is made for every booking still marked "booked" that starts within the next 24 hours. The booking's own id is the
// entity, and its start time is part of the key, so a booking moved to another time gets a fresh reminder while a read one stays
// read. See scripts/verify-booking-reminders.ts.
import type { Booking, Notification, NotificationPriority, NotificationType } from "./types";

export const BOOKING_REMINDER_WINDOW_MIN = 24 * 60;
const URGENT_WITHIN_MS = 2 * 60 * 60 * 1000;

// The start of a booking as a timestamp, or null when its date or time is not readable.
export function bookingStartMs(b: Pick<Booking, "date" | "startTime">): number | null {
  const [y, m, d] = (b.date ?? "").split("-").map(Number);
  const [hh, mm] = (b.startTime ?? "").split(":").map(Number);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export function generateBookingReminders(bookings: Booking[], now: Date): Omit<Notification, "id" | "createdAt">[] {
  const nowMs = now.getTime();
  const horizon = nowMs + BOOKING_REMINDER_WINDOW_MIN * 60_000;
  return bookings
    .filter((b) => b.status === "booked")
    .map((b) => ({ b, start: bookingStartMs(b) }))
    .filter((x): x is { b: Booking; start: number } => x.start !== null && x.start >= nowMs && x.start <= horizon)
    .sort((x, y) => x.start - y.start)
    .map(({ b, start }) => {
      const priority: NotificationPriority = start - nowMs <= URGENT_WITHIN_MS ? "high" : "medium";
      return {
        type: "booking_soon" as NotificationType,
        priority,
        title: `Booking at ${b.startTime}: ${b.customerName}`,
        message: `${b.service}, ${b.durationMin} min${b.resource ? ` with ${b.resource}` : ""}, on ${b.date}.${b.depositAmount ? " A deposit was recorded." : ""}`,
        entityId: b.id,
        entityType: "booking",
        dueDate: `${b.date}T${b.startTime}`,
        isRead: false,
      };
    });
}
