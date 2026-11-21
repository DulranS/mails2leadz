// Reminders for finished work that has no sale yet: a Done booking, or a Won lead. Pure: no I/O. A reminder only tells the owner
// what is waiting; it records nothing. The sale itself is still recorded by a person (Record as sale on the Bookings or Leads page).
import type { Booking, Lead, Notification, NotificationType } from "./types";

export const MAX_SALE_REMINDERS = 20;

export function generateSaleReminders(bookings: Booking[], leads: Lead[], today: string): Omit<Notification, "id" | "createdAt">[] {
  const fromBookings = bookings
    .filter((b) => b.status === "done" && !b.saleId && !b.membershipId && b.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((b) => ({
      type: "sale_due" as NotificationType,
      priority: "medium" as const,
      title: `Record the sale for ${b.customerName}`,
      message: `${b.service} on ${b.date} is Done but has no sale yet.`,
      entityId: b.id,
      entityType: "booking",
      isRead: false,
    }));
  const fromLeads = leads
    .filter((l) => l.stage === "won" && !l.saleId)
    .map((l) => ({
      type: "sale_due" as NotificationType,
      priority: "medium" as const,
      title: `Record the sale for ${l.name}`,
      message: "This lead is Won but has no sale yet.",
      entityId: l.id,
      entityType: "lead",
      isRead: false,
    }));
  return [...fromBookings, ...fromLeads].slice(0, MAX_SALE_REMINDERS);
}
