// Tabs: open orders for a table, a bar seat or a takeaway. Items are added as they are ordered, and the tab is charged in one go
// when it is paid. Closing a tab writes its items as ordinary sales, all in one batch, so stock, the P&L, reports and receivables
// treat them like any other sale. A service charge, if you add one, is its own line on a service item you choose.
//
// Pure: no I/O. See scripts/verify-tabs.ts.
import { taxFor, type TaxSettings } from "./tax";
import type { PaymentMethod, TabLine } from "./types";

const cents = (n: number) => Math.round(n * 100) / 100;

export const MAX_TAB_NAME = 40;
export const MAX_TAB_LINES = 100;
export const MAX_TAB_QTY = 9999;

export function cleanTabName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAB_NAME) : "";
}

// null when the name can be used; otherwise the sentence to show the person.
export function validateTabName(raw: unknown, openNames: string[]): string | null {
  const name = cleanTabName(raw);
  if (!name) return "Name the table or order, for example Table 4.";
  if (openNames.some((o) => o.trim().toLowerCase() === name.toLowerCase())) return "That table already has an open tab.";
  return null;
}

// Adds `qty` of an item. The same item at the same price is one line with a bigger quantity.
export function addToTab(lines: TabLine[], item: { productId: string; name: string; unitPrice: number; taxRatePct?: number | null }, qty = 1): TabLine[] {
  const next = lines.map((l) => ({ ...l }));
  const hit = next.find((l) => l.productId === item.productId && l.unitPrice === item.unitPrice);
  if (hit) {
    hit.qty = Math.min(MAX_TAB_QTY, hit.qty + qty);
    return next;
  }
  if (next.length >= MAX_TAB_LINES) return next;
  next.push({ productId: item.productId, name: item.name, qty: Math.min(MAX_TAB_QTY, qty), unitPrice: item.unitPrice, taxRatePct: item.taxRatePct ?? null });
  return next;
}

// Changes the quantity of one line by `delta`. A line that reaches zero is taken off the tab.
export function changeTabQty(lines: TabLine[], productId: string, unitPrice: number, delta: number): TabLine[] {
  return lines
    .map((l) => (l.productId === productId && l.unitPrice === unitPrice ? { ...l, qty: Math.min(MAX_TAB_QTY, l.qty + delta) } : l))
    .filter((l) => l.qty > 0);
}

export const tabTotal = (lines: TabLine[]) => Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;

export interface CloseOptions {
  date: string;
  paymentMethod: PaymentMethod;
  customer?: string;
  serviceChargePct?: number;
  serviceProductId?: string;
}

export interface TabSaleLine {
  productId: string;
  qty: number;
  unitPrice: number;
  taxAmount?: number; // sales tax on the line, added on top of the price, as the sale form does
  date: string;
  paymentMethod: PaymentMethod;
  customer?: string;
  notes?: string;
}

// The sales a closed tab becomes: one per item, plus a service charge line when one is set. Null sales with an error when the
// tab cannot be closed yet.
export function closingSales(tab: { table: string; lines: TabLine[] }, o: CloseOptions, settings: TaxSettings): { sales: TabSaleLine[] | null; error: string | null } {
  if (tab.lines.length === 0) return { sales: null, error: "Nothing has been ordered on this tab yet." };
  const customer = cleanTabName(o.customer) || undefined;
  if (o.paymentMethod === "credit" && !customer) return { sales: null, error: "A tab paid on credit needs the customer's name." };
  const pct = Number(o.serviceChargePct ?? 0);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { sales: null, error: "The service charge must be between 0 and 100 percent." };
  if (pct > 0 && !o.serviceProductId) return { sales: null, error: "Choose the service item the service charge is recorded under." };
  const taxOf = (amount: number, rate: number | null | undefined) => {
    const t = cents(taxFor(amount, { taxRatePct: rate }, settings));
    return t > 0 ? t : undefined;
  };
  const base: TabSaleLine[] = tab.lines.map((l) => ({
    productId: l.productId,
    qty: l.qty,
    unitPrice: l.unitPrice,
    taxAmount: taxOf(l.qty * l.unitPrice, l.taxRatePct),
    date: o.date,
    paymentMethod: o.paymentMethod,
    customer,
    notes: tab.table,
  }));
  if (pct > 0) {
    const charge = Math.round(tabTotal(tab.lines) * pct) / 100;
    if (charge > 0) {
      base.push({
        productId: o.serviceProductId as string,
        qty: 1,
        unitPrice: charge,
        taxAmount: taxOf(charge, null), // a service charge is taxed at the shop rate, like a delivery charge
        date: o.date,
        paymentMethod: o.paymentMethod,
        customer,
        notes: `${tab.table}, service charge ${pct}%`,
      });
    }
  }
  return { sales: base, error: null };
}

// Equal shares of a bill for a group of people: each share is rounded down to the cent, and the last person pays whatever cents
// are left, so the shares always add up to the bill exactly. Null when the number of people is not a whole number from 1 to 20.
export const MAX_SHARE_PEOPLE = 20;
export function equalShares(total: number, people: number): number[] | null {
  if (!Number.isInteger(people) || people < 1 || people > MAX_SHARE_PEOPLE) return null;
  if (!Number.isFinite(total) || total < 0) return null;
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / people);
  const shares = Array.from({ length: people - 1 }, () => base / 100);
  shares.push((cents - base * (people - 1)) / 100);
  return shares;
}
