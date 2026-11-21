// Warranty on a sold item. An item can carry a warranty length in months (Product.warrantyMonths); a sale of it can
// carry the unit's serial number or IMEI (Sale.serialNo). The warranty ends the same day-of-month, that many months
// after the sale (clamped to the month's last day). Read-only: nothing here changes a figure.

import { addMonthsIso } from "./calculations";

export function warrantyEndDate(saleDate: string, months: number | null | undefined): string | null {
  if (typeof months !== "number" || !Number.isFinite(months) || months <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate ?? "")) return null;
  return addMonthsIso(saleDate, Math.round(months));
}

export interface WarrantyState {
  endsOn: string;
  active: boolean; // today is on or before the end date
  daysLeft: number; // negative once expired
}

export function warrantyState(saleDate: string, months: number | null | undefined, todayIso: string): WarrantyState | null {
  const endsOn = warrantyEndDate(saleDate, months);
  if (!endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso ?? "")) return null;
  const days = Math.round((Date.parse(endsOn + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86400000);
  return { endsOn, active: days >= 0, daysLeft: days };
}

// Serial numbers are matched ignoring case, spaces and dashes (an IMEI is often typed with spaces). A sale may list
// several, separated by commas, spaces or new lines when more than one unit was sold on the line.
const squash = (s: string) => s.toLowerCase().replace(/[\s\-]+/g, "");

export function serialMatches(stored: string | null | undefined, query: string): boolean {
  const q = squash(query ?? "");
  if (q.length < 3 || !stored) return false;
  return stored
    .split(/[,\n;]+/)
    .map(squash)
    .some((one) => one !== "" && (one === q || one.includes(q)));
}

export function cleanSerial(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim().replace(/\s*\n\s*/g, ", ").slice(0, 200);
  return v === "" ? undefined : v;
}

// One line for a receipt or invoice: "Serial X, warranty until D". Undefined when the sale has neither.
export function serialDetail(sale: { serialNo?: string | null; date: string }, warrantyMonths: number | null | undefined): string | undefined {
  const parts: string[] = [];
  if (sale.serialNo) parts.push(`Serial ${sale.serialNo}`);
  const end = warrantyEndDate(sale.date, warrantyMonths);
  if (end) parts.push(`warranty until ${end}`);
  return parts.length ? parts.join(", ") : undefined;
}
