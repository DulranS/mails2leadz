// Account portals (v177c): what a customer sees of their own account, and what a supplier sees of their own open orders, through a
// signed link the owner sends. Pure: no I/O. The server routes load the records and call these to shape what is returned, so
// nothing a portal shows can include cost prices, margins, stock levels or any other business record.
//
// A supplier can confirm a delivery date for an order. That is recorded as supplierAck and NEVER overwrites the order's expected
// date, so the owner's on-time record for that supplier cannot be changed by the supplier.
import { isIsoDay } from "./operations";
import type { InvoiceSummary } from "./invoicePortal";

export const PORTAL_LINK_DAYS = 60;
export const MAX_CONFIRM_NOTE = 300;
export const MAX_PORTAL_INVOICES = 200;

export interface PortalInvoiceInput {
  key: string;
  reference: string;
  issuedOn: string;
  summary: InvoiceSummary;
  link?: string;
}

export interface PortalInvoiceRow {
  key: string;
  reference: string;
  issuedOn: string;
  total: number;
  paid: number;
  balance: number;
  status: InvoiceSummary["status"];
  dueDate: string | null;
  link?: string;
}

// The customer's invoices: what is still owed first (earliest due date first), then the settled ones, newest first.
export function accountView(rows: PortalInvoiceInput[]): { invoices: PortalInvoiceRow[]; owed: number; overdue: number } {
  const shaped: PortalInvoiceRow[] = rows
    .slice(0, MAX_PORTAL_INVOICES)
    .map((r) => ({
      key: r.key,
      reference: r.reference,
      issuedOn: r.issuedOn,
      total: round2(r.summary.total),
      paid: round2(r.summary.paid),
      balance: round2(r.summary.balance),
      status: r.summary.status,
      dueDate: r.summary.dueDate,
      ...(r.link ? { link: r.link } : {}),
    }));
  shaped.sort((a, b) => {
    const aOpen = a.balance > 0 ? 0 : 1;
    const bOpen = b.balance > 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (aOpen === 0) return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    return b.issuedOn.localeCompare(a.issuedOn);
  });
  const owed = round2(shaped.reduce((t, i) => t + i.balance, 0));
  const overdue = round2(shaped.filter((i) => i.status === "overdue").reduce((t, i) => t + i.balance, 0));
  return { invoices: shaped, owed, overdue };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SupplierOrderLike {
  id: string;
  supplier?: string;
  status: string;
  orderDate: string;
  expectedDate?: string;
  supplierAck?: { confirmedDate: string; note?: string; at: number };
}

const same = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

// Orders for this supplier that have not yet arrived or been cancelled.
export function openOrdersFor<T extends SupplierOrderLike>(orders: T[], supplierName: string): T[] {
  return orders.filter((o) => same(o.supplier, supplierName) && (o.status === "ordered" || o.status === "in_transit"));
}

export type ConfirmPlan = { ok: true; patch: { supplierAck: { confirmedDate: string; note?: string; at: number } } } | { ok: false; error: string };

// A supplier confirms when an open order will be delivered. Only an open order of this supplier can be confirmed, the date must be
// a real day from the order date onward and within a year, and the expected date is left as the owner set it.
export function confirmOrderPlan(
  order: SupplierOrderLike | undefined,
  supplierName: string,
  input: { confirmedDate: string; note?: string },
  at: number,
): ConfirmPlan {
  if (!order) return { ok: false, error: "That order could not be found. Ask the business to send the link again." };
  if (!same(order.supplier, supplierName)) return { ok: false, error: "That order is not one of yours." };
  if (order.status !== "ordered" && order.status !== "in_transit") return { ok: false, error: "That order has already arrived or been cancelled." };
  if (!isIsoDay(input.confirmedDate)) return { ok: false, error: "Choose the day it will be delivered." };
  if (input.confirmedDate < order.orderDate) return { ok: false, error: "The delivery day can't be before the order date." };
  const max = new Date(Date.parse(`${order.orderDate}T00:00:00Z`) + 365 * 86400000).toISOString().slice(0, 10);
  if (input.confirmedDate > max) return { ok: false, error: "That delivery day is more than a year after the order." };
  const note = (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CONFIRM_NOTE);
  return { ok: true, patch: { supplierAck: { confirmedDate: input.confirmedDate, ...(note ? { note } : {}), at } } };
}
