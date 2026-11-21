// Bookings: appointments and reservations for time or seats (a chair, a room, a person's hour). The rules here are the ones that
// stop a double booking and show the week's load; nothing is sent to the customer, and a deposit is only recorded.
//
// Clash rule: two bookings clash when they fall on the same day, overlap in time, and are for the same resource. A blank resource
// is one shared default lane, so two blank-resource bookings at the same time clash too. A cancelled, no-show or finished booking
// never blocks a slot.
import { addDays, isIsoDate } from "./playbook";
import { weekRange } from "./weeklyScorecard";
import type { Booking, BookingStatus, PaymentMethod, Sale } from "./types";
import { cleanSaleChannel } from "./salesChannels";

export const MAX_BOOKING_NAME = 120;
export const MAX_BOOKING_SERVICE = 120;
export const MAX_BOOKING_RESOURCE = 80;
export const MAX_BOOKING_NOTES = 1000;
export const MIN_DURATION = 5;
export const MAX_DURATION = 24 * 60;
export const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "done", label: "Done" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

export interface BookingInput {
  customerName: string;
  contact?: string;
  service: string;
  resource?: string;
  date: string;
  startTime: string;
  durationMin: number;
  status: BookingStatus;
  depositAmount?: number;
  partySize?: number;
  membershipId?: string;
  notes?: string;
}

export const MAX_PARTY_SIZE = 200;

const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

// "09:30" -> 570. Null for anything that is not a 24-hour time.
export function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function validateBookingInput(i: BookingInput): string | null {
  if (!text(i.customerName, MAX_BOOKING_NAME)) return "Who is the booking for?";
  if (!text(i.service, MAX_BOOKING_SERVICE)) return "What is being booked?";
  if (!isIsoDate(i.date)) return "Pick the day.";
  const start = toMinutes(i.startTime);
  if (start === null) return "Pick a start time.";
  if (!Number.isInteger(i.durationMin) || i.durationMin < MIN_DURATION || i.durationMin > MAX_DURATION) {
    return `The length has to be between ${MIN_DURATION} minutes and a whole day.`;
  }
  if (start + i.durationMin > 24 * 60) return "A booking has to finish on the same day.";
  if (!["booked", "done", "no_show", "cancelled"].includes(i.status)) return "Choose a status.";
  if (i.depositAmount !== undefined && (!Number.isFinite(i.depositAmount) || i.depositAmount < 0)) return "The deposit can't be negative.";
  if (i.partySize !== undefined && (!Number.isInteger(i.partySize) || i.partySize < 1 || i.partySize > MAX_PARTY_SIZE)) return `The number of people has to be a whole number from 1 to ${MAX_PARTY_SIZE}.`;
  if (typeof i.notes === "string" && i.notes.length > MAX_BOOKING_NOTES) return `Keep the notes to ${MAX_BOOKING_NOTES} characters.`;
  return null;
}

export function cleanBookingInput(i: BookingInput): BookingInput {
  const out: BookingInput = {
    customerName: text(i.customerName, MAX_BOOKING_NAME),
    service: text(i.service, MAX_BOOKING_SERVICE),
    date: i.date,
    startTime: i.startTime,
    durationMin: i.durationMin,
    status: i.status,
  };
  const contact = text(i.contact, 120);
  if (contact) out.contact = contact;
  const resource = text(i.resource, MAX_BOOKING_RESOURCE);
  if (resource) out.resource = resource;
  if (i.depositAmount !== undefined && i.depositAmount > 0) out.depositAmount = Math.round(i.depositAmount * 100) / 100;
  if (i.partySize !== undefined && Number.isInteger(i.partySize) && i.partySize >= 1) out.partySize = i.partySize;
  if (i.membershipId) out.membershipId = i.membershipId;
  const notes = text(i.notes, MAX_BOOKING_NOTES);
  if (notes) out.notes = notes;
  return out;
}

const resourceKey = (r: string | undefined) => (r ?? "").trim().toLowerCase();

// Bookings that would clash with this one. `ignoreId` is the booking being edited, so it never clashes with itself.
export function clashes(
  candidate: { date: string; startTime: string; durationMin: number; resource?: string },
  all: Booking[],
  ignoreId?: string
): Booking[] {
  const s = toMinutes(candidate.startTime);
  if (s === null) return [];
  const e = s + candidate.durationMin;
  const key = resourceKey(candidate.resource);
  return all.filter((b) => {
    if (b.id === ignoreId || b.status !== "booked" || b.date !== candidate.date || resourceKey(b.resource) !== key) return false;
    const bs = toMinutes(b.startTime);
    if (bs === null) return false;
    return bs < e && s < bs + b.durationMin;
  });
}

export interface WeekDay {
  date: string;
  count: number; // booked or done
  minutes: number; // booked or done, total length
}

// Seven days from the Monday of the given day's week.
export function weekPlan(bookings: Booking[], today: string): WeekDay[] {
  const from = weekRange(today).thisFrom;
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    const on = bookings.filter((b) => b.date === date && (b.status === "booked" || b.status === "done"));
    days.push({ date, count: on.length, minutes: on.reduce((a, b) => a + b.durationMin, 0) });
  }
  return days;
}

export interface BookingsSummary {
  thisWeekCount: number;
  thisWeekHours: number;
  upcomingBooked: number; // booked from today onward
  depositsHeld: number; // deposits on bookings still to happen
  noShowRate: number | null; // no-shows out of bookings that were either done or no-show
  cancelledRate: number | null; // cancelled out of all bookings in the last 90 days that are not still to happen
}

export function summarizeBookings(bookings: Booking[], today: string): BookingsSummary {
  const week = weekPlan(bookings, today);
  const thisWeekCount = week.reduce((a, d) => a + d.count, 0);
  const thisWeekHours = Math.round((week.reduce((a, d) => a + d.minutes, 0) / 60) * 10) / 10;
  const upcoming = bookings.filter((b) => b.status === "booked" && b.date >= today);
  const depositsHeld = Math.round(upcoming.reduce((a, b) => a + (b.depositAmount ?? 0), 0) * 100) / 100;
  const done = bookings.filter((b) => b.status === "done").length;
  const noShow = bookings.filter((b) => b.status === "no_show").length;
  const from = addDays(today, -89);
  const recent = bookings.filter((b) => b.date >= from && b.date < today && b.status !== "booked");
  const cancelled = recent.filter((b) => b.status === "cancelled").length;
  return {
    thisWeekCount,
    thisWeekHours,
    upcomingBooked: upcoming.length,
    depositsHeld,
    noShowRate: done + noShow > 0 ? noShow / (done + noShow) : null,
    cancelledRate: recent.length > 0 ? cancelled / recent.length : null,
  };
}

// Seasonal demand: how many bookings fell in each month of the year and each weekday, across all history except cancelled ones.
// It is only shown once there are twelve months of history, so one busy summer never looks like a pattern.
export function demandByMonth(bookings: Booking[]): number[] {
  const out = new Array(12).fill(0);
  for (const b of bookings) if (b.status !== "cancelled" && isIsoDate(b.date)) out[Number(b.date.slice(5, 7)) - 1]++;
  return out;
}

export function demandByWeekday(bookings: Booking[]): number[] {
  const out = new Array(7).fill(0);
  for (const b of bookings) {
    if (b.status === "cancelled" || !isIsoDate(b.date)) continue;
    out[new Date(b.date + "T00:00:00Z").getUTCDay()]++;
  }
  return out;
}

export function monthsOfHistory(bookings: Booking[]): number {
  const valid = bookings.filter((b) => isIsoDate(b.date));
  if (valid.length === 0) return 0;
  const dates = valid.map((b) => b.date).sort();
  const [y1, m1] = dates[0].split("-").map(Number);
  const [y2, m2] = dates[dates.length - 1].split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export const SEASONAL_MIN_MONTHS = 12;
export const seasonalReady = (bookings: Booking[]) => monthsOfHistory(bookings) >= SEASONAL_MIN_MONTHS;

// ---- Bookings to sales -------------------------------------------------------------------------------------------------
// A Done booking can be recorded as one sale: one unit of a service, at the price charged, paid in full. Bookings are not the
// books. The sale is what posts, and only when a person records it (DataContext recordBookingSale, one transaction).
//
// Limits, all stated in the manual: a sale is recorded once per booking; it cannot be for a booking still in the future; it is
// for a service (not a stocked product), so no stock moves; the amount must be above zero and within MAX_SALE_PRICE; credit
// sales are made on the Sales page; a deposit is not posted separately, so the sale records the full price; deleting the
// sale later on the Sales page does not clear the booking's link.
export const MAX_SALE_PRICE = 1_000_000_000;
export const BOOKING_SALE_PAYMENTS: { value: Exclude<PaymentMethod, "credit">; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];
export const MAX_BOOKING_SALE_LIST = 50;

export interface SaleOffering {
  id: string;
  name: string;
  type: string;
  active: boolean;
  defaultSellPrice?: number;
  baseUnit?: string; // e.g. "hour": the price is then a rate per hour, so the booking's length sets the price
}

// Table time is charged by the hour. When the service's unit is an hour, the price suggested for a booking is the hourly rate
// times the booking's length. The owner sees the working and can change the figure: it is a suggestion, never a posted price.
const HOUR_UNITS = new Set(["hour", "hours", "hr", "hrs", "h"]);
export interface TablePricingRules { minMinutes?: number; blockMinutes?: number; perPerson?: boolean }

export function cleanPricingRules(r: TablePricingRules | undefined): TablePricingRules {
  const whole = (n: unknown, max: number) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max ? n : undefined);
  return { minMinutes: whole(r?.minMinutes, 1440), blockMinutes: whole(r?.blockMinutes, 240), perPerson: r?.perPerson === true };
}

// Minutes charged: the booked length rounded up to whole blocks, and never less than the minimum.
export function billableMinutes(durationMin: number, rules?: TablePricingRules): number {
  const r = cleanPricingRules(rules);
  let m = durationMin;
  if (r.blockMinutes) m = Math.ceil(m / r.blockMinutes) * r.blockMinutes;
  if (r.minMinutes && m < r.minMinutes) m = r.minMinutes;
  return m;
}

export function suggestBookingPrice(
  offering: { defaultSellPrice?: number; baseUnit?: string } | undefined,
  durationMin: number,
  rules?: TablePricingRules,
  partySize?: number
): { amount: number; basis: string } | null {
  if (!offering || offering.defaultSellPrice === undefined || !(offering.defaultSellPrice > 0)) return null;
  if (!offering.baseUnit || !HOUR_UNITS.has(offering.baseUnit.trim().toLowerCase())) return null;
  if (!Number.isInteger(durationMin) || durationMin <= 0) return null;
  const clean = cleanPricingRules(rules);
  const minutes = billableMinutes(durationMin, clean);
  const people = clean.perPerson ? Math.max(1, Math.floor(partySize ?? 1)) : 1;
  const hours = minutes / 60;
  const amount = Math.round(offering.defaultSellPrice * hours * people * 100) / 100;
  const hoursText = String(Math.round(hours * 100) / 100);
  const charged = minutes !== durationMin ? ` (booked ${durationMin} min, charged as ${minutes})` : "";
  const per = clean.perPerson ? ` for ${people} ${people === 1 ? "person" : "people"}` : "";
  return { amount, basis: `${hoursText} h at ${offering.defaultSellPrice} per hour${per}${charged}` };
}

// The services a booking can be recorded against: active services only, by name.
export function saleOfferings<T extends SaleOffering>(products: T[]): T[] {
  return products.filter((p) => p.active && p.type === "service").sort((a, b) => a.name.localeCompare(b.name));
}

// Why this booking cannot be recorded as a sale right now, or null when it can.
export function bookingSaleProblem(b: Pick<Booking, "status" | "saleId" | "date"> & { membershipId?: string }, today: string): string | null {
  if (b.saleId) return "A sale is already recorded for this booking.";
  if (b.membershipId) return "A membership covers this booking, so there is no sale to record. The money was recorded when the membership was sold.";
  if (b.status !== "done") return "Mark the booking Done first. A sale is recorded once the service has been given.";
  if (b.date > today) return "This booking is still in the future. A sale can be recorded on or after its day.";
  return null;
}

export function saleAmountProblem(unitPrice: number): string | null {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return "Enter the price charged, above zero.";
  if (unitPrice > MAX_SALE_PRICE) return "That price is too large to be right. Check it.";
  return null;
}

// A booking that is Done and has a sale stays Done; any other status is refused.
export function bookingStatusProblem(b: Pick<Booking, "saleId">, next: BookingStatus): string | null {
  if (b.saleId && next !== "done") return "This booking has a sale recorded, so it stays Done.";
  return null;
}

export function bookingDeleteProblem(b: Pick<Booking, "saleId">): string | null {
  return b.saleId ? "This booking has a sale recorded, so it can't be deleted. Its sale stays in the books." : null;
}

// The sale that a Done booking becomes: one unit, the price charged, on the booking's day, with the customer's name and contact.
// Optional fields are left out rather than set to undefined.
export function saleDraftFor(
  b: Booking,
  productId: string,
  unitPrice: number,
  paymentMethod: Exclude<PaymentMethod, "credit">,
  saleChannel?: string,
): Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> {
  const deposit = b.depositAmount ? ` A deposit of ${b.depositAmount} was taken earlier. Deposits are not posted, so this sale records the full price.` : "";
  const draft: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> = {
    productId,
    qty: 1,
    unitPrice: Math.round(unitPrice * 100) / 100,
    date: b.date,
    customer: b.customerName,
    paymentMethod,
    notes: `From booking ${b.date} ${b.startTime}, ${b.durationMin} min.${deposit}`,
  };
  if (b.contact) draft.customerContact = b.contact;
  // The channel the customer came in by, so Sales by channel and channel economics count the sale.
  const channel = cleanSaleChannel(saleChannel);
  if (channel) draft.saleChannel = channel;
  return draft;
}
