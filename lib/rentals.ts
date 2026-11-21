// Rentals: things you lend or hire out for a while (equipment, vehicles, rooms, tools) and get back. Each rental has the day
// it went out, the day it is due back, a rate per day and, optionally, a deposit taken up front.
//
// The rent is charged on the day it comes back: days out (counting both the day it left and the day it came back) times the
// daily rate, so a late return costs more automatically. Damage found on return is a separate charge. Both are posted as
// ordinary sales under the service you choose for rentals, so they reach the P&L, reports and receivables like any other
// sale. The rented item itself is not stock: nothing is taken off the shelf and nothing is costed out.
//
// The deposit is money a customer paid you up front, so it is recorded as a customer deposit (lib/customerDeposits.ts), not
// as income. On return you refund what you choose; whatever you keep stays a customer deposit balance until you apply it
// to the damage invoice, so it is counted once.
import { addDays, isIsoDate } from "./playbook";
import { daysBetween } from "./shipments";
import type { PaymentMethod, Rental } from "./types";

export const MAX_RENTAL_ITEM = 100;
export const MAX_RENTAL_PERSON = 100;
export const MAX_RENTAL_NOTES = 500;
export const DUE_SOON_DAYS = 7;

export interface RentalInput {
  item: string;
  customer: string;
  customerContact?: string;
  outDate: string;
  dueBackDate: string;
  dailyRate: number;
  deposit?: number;
  incomeProductId: string;
  notes?: string;
}

export interface RentalReturnInput {
  returnedDate: string;
  damageCharge?: number;
  damageNotes?: string;
  depositRefund?: number;
  paymentMethod?: Exclude<PaymentMethod, "credit">;
}

const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const money = (n: unknown) => (typeof n === "number" ? n : Number(n));

// Null when fine, otherwise the sentence to show the person.
export function validateRentalInput(i: RentalInput): string | null {
  if (!text(i.item, MAX_RENTAL_ITEM)) return "Enter what you are renting out.";
  if (!text(i.customer, MAX_RENTAL_PERSON)) return "Enter who is renting it.";
  if (!isIsoDate(i.outDate)) return "Enter the day it goes out.";
  if (!isIsoDate(i.dueBackDate)) return "Enter the day it is due back.";
  if (i.dueBackDate < i.outDate) return "The due-back day can't be before the day it goes out.";
  const rate = money(i.dailyRate);
  if (!Number.isFinite(rate) || rate <= 0) return "Enter the rate per day.";
  if (i.deposit !== undefined && (!Number.isFinite(money(i.deposit)) || money(i.deposit) < 0)) return "The deposit can't be negative.";
  if (!text(i.incomeProductId, 200)) return "Choose the service the rent is recorded under. Add one on the Products page if the list is empty.";
  if (typeof i.notes === "string" && i.notes.length > MAX_RENTAL_NOTES) return `Keep the notes to ${MAX_RENTAL_NOTES} characters.`;
  return null;
}

// Keeps only filled optional fields, so nothing is stored blank.
export function cleanRentalInput(i: RentalInput): RentalInput {
  const out: RentalInput = {
    item: text(i.item, MAX_RENTAL_ITEM),
    customer: text(i.customer, MAX_RENTAL_PERSON),
    outDate: i.outDate,
    dueBackDate: i.dueBackDate,
    dailyRate: money(i.dailyRate),
    incomeProductId: text(i.incomeProductId, 200),
  };
  const contact = text(i.customerContact, MAX_RENTAL_PERSON);
  if (contact) out.customerContact = contact;
  if (i.deposit !== undefined && money(i.deposit) > 0) out.deposit = money(i.deposit);
  const notes = text(i.notes, MAX_RENTAL_NOTES);
  if (notes) out.notes = notes;
  return out;
}

// Days out, counting the day it left and the day it came back. Never less than one day.
export function rentalDays(outDate: string, endDate: string): number {
  return Math.max(1, daysBetween(outDate, endDate) + 1);
}

// Days planned out (out day to due-back day, both counted).
export const plannedDays = (r: Pick<Rental, "outDate" | "dueBackDate">) => rentalDays(r.outDate, r.dueBackDate);

// What the rent comes to when it is returned on `returnedDate`.
export function rentalCharge(r: Pick<Rental, "outDate" | "dailyRate">, returnedDate: string): number {
  return Math.round(rentalDays(r.outDate, returnedDate) * r.dailyRate * 100) / 100;
}

// Days past the due-back day that the rent was charged for (0 when it came back on time or early).
export function lateDays(r: Pick<Rental, "outDate" | "dueBackDate">, returnedDate: string): number {
  return Math.max(0, rentalDays(r.outDate, returnedDate) - plannedDays(r));
}

// Null when the return is fine, otherwise the sentence to show the person.
export function validateReturnInput(r: Rental, i: RentalReturnInput, today: string): string | null {
  if (!isIsoDate(i.returnedDate)) return "Enter the day it came back.";
  if (i.returnedDate < r.outDate) return "It can't come back before the day it went out.";
  if (i.returnedDate > today) return "The day it came back can't be in the future.";
  if (i.damageCharge !== undefined && (!Number.isFinite(money(i.damageCharge)) || money(i.damageCharge) < 0)) {
    return "The damage charge can't be negative.";
  }
  if (i.depositRefund !== undefined) {
    const refund = money(i.depositRefund);
    if (!Number.isFinite(refund) || refund < 0) return "The deposit refund can't be negative.";
    if (refund > depositHeld(r) + 0.005) return "The refund is more than the deposit you are holding for this rental.";
  }
  if (typeof i.damageNotes === "string" && i.damageNotes.length > MAX_RENTAL_NOTES) return `Keep the damage notes to ${MAX_RENTAL_NOTES} characters.`;
  return null;
}

export const isRentalOpen = (r: Rental) => !r.returnedDate;

export function isRentalOverdue(r: Rental, today: string): boolean {
  return isRentalOpen(r) && r.dueBackDate < today;
}

// Deposit still with you for this rental: what was taken, less what has been refunded. A kept part counts here until
// it is applied to an invoice.
export function depositHeld(r: Pick<Rental, "deposit" | "depositRefunded">): number {
  return Math.max(0, Math.round(((r.deposit ?? 0) - (r.depositRefunded ?? 0)) * 100) / 100);
}

export interface RentalsSummary {
  out: number; // rentals not yet back
  overdue: number;
  dueSoon: number; // due back in the next DUE_SOON_DAYS days, not yet overdue
  returnedLast30: number;
  chargedLast30: number; // rent charged on returns in the last 30 days (not the damage charges)
  depositsHeld: number;
}

export function summarizeRentals(list: Rental[], today: string): RentalsSummary {
  const from = addDays(today, -29);
  const soon = addDays(today, DUE_SOON_DAYS);
  const open = list.filter(isRentalOpen);
  const back = list.filter((r) => r.returnedDate && r.returnedDate >= from && r.returnedDate <= today);
  return {
    out: open.length,
    overdue: open.filter((r) => isRentalOverdue(r, today)).length,
    dueSoon: open.filter((r) => r.dueBackDate >= today && r.dueBackDate <= soon).length,
    returnedLast30: back.length,
    chargedLast30: Math.round(back.reduce((a, r) => a + (r.charged ?? 0), 0) * 100) / 100,
    depositsHeld: Math.round(list.reduce((a, r) => a + depositHeld(r), 0) * 100) / 100,
  };
}

// Rentals still out: overdue first (oldest due day first), then by due day, then by item name.
export function sortOpenRentals(list: Rental[], today: string): Rental[] {
  return list.filter(isRentalOpen).sort((a, b) => {
    const ao = isRentalOverdue(a, today) ? 0 : 1;
    const bo = isRentalOverdue(b, today) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.dueBackDate !== b.dueBackDate) return a.dueBackDate < b.dueBackDate ? -1 : 1;
    return a.item.localeCompare(b.item);
  });
}
