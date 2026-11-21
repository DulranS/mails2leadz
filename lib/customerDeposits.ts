// Customer deposits held as a liability (CustomerDepositEntry in lib/types.ts). Pure functions, no I/O
// (see scripts/verify-customer-deposits.ts). The mirror image of lib/supplierCredit.ts.
//
// The balance with one customer has one way in and two ways out:
//   in : deposits received
//   out: applied to one of their open invoices, and refunded to them
// A balance may never be negative on any date, so every save and every delete is checked against the full timeline.
import type { CustomerDepositEntry } from "./types";

const EPS = 0.005;

// The same name matching the rest of the app uses for customers (ignore case and spaces at either end), kept
// identical on purpose so a customer's deposit and their invoices can never disagree about who is who.
export function customerDepositKey(name?: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

interface Ev {
  date: string;
  delta: number;
}

function eventsFor(key: string, entries: CustomerDepositEntry[]): Ev[] {
  const ev: Ev[] = [];
  for (const e of entries) {
    if (customerDepositKey(e.customer) !== key) continue;
    ev.push({ date: e.date, delta: e.kind === "received" ? e.amount : -e.amount });
  }
  return ev;
}

// True when, walking the dates in order (money in before money out on the same day), the balance never dips below zero.
export function depositTimelineStaysNonNegative(events: Ev[]): boolean {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.delta - a.delta));
  let bal = 0;
  for (const e of sorted) {
    bal += e.delta;
    if (bal < -EPS) return false;
  }
  return true;
}

export interface CustomerDepositBalance {
  key: string;
  customer: string;
  received: number;
  applied: number;
  refunded: number;
  balance: number;
  oldestOpenDate: string | null; // date of the earliest deposit still (partly) held, for "held for N days"
}

export interface CustomerDepositSummary {
  asOf: string;
  byCustomer: CustomerDepositBalance[]; // customers with any history, biggest balance first
  total: number; // everything you hold for customers: the balance sheet liability
}

export function computeCustomerDeposits(entries: CustomerDepositEntry[], asOfISO: string): CustomerDepositSummary {
  const by = new Map<string, CustomerDepositBalance>();
  const row = (name: string): CustomerDepositBalance => {
    const key = customerDepositKey(name);
    let r = by.get(key);
    if (!r) {
      r = { key, customer: name.trim(), received: 0, applied: 0, refunded: 0, balance: 0, oldestOpenDate: null };
      by.set(key, r);
    }
    return r;
  };
  for (const e of entries) {
    if (e.date > asOfISO || !customerDepositKey(e.customer)) continue;
    const x = row(e.customer);
    if (e.kind === "received") x.received += e.amount;
    else if (e.kind === "applied") x.applied += e.amount;
    else x.refunded += e.amount;
  }
  const list = [...by.values()];
  for (const x of list) x.balance = x.received - x.applied - x.refunded;
  // Oldest money first: what has been used or refunded is taken off the earliest deposits, so the date shown is the
  // earliest deposit that still has something left in it.
  for (const x of list) {
    let used = x.applied + x.refunded;
    const deposits = entries
      .filter((e) => e.kind === "received" && e.date <= asOfISO && customerDepositKey(e.customer) === x.key)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
    for (const d of deposits) {
      if (used + EPS >= d.amount) {
        used -= d.amount;
        continue;
      }
      x.oldestOpenDate = d.date;
      break;
    }
  }
  list.sort((a, b) => b.balance - a.balance || a.customer.localeCompare(b.customer));
  // A fully used deposit still lists (history), but the liability only counts what is left.
  const total = list.reduce((s, x) => s + Math.max(0, x.balance), 0);
  return { asOf: asOfISO, byCustomer: list, total };
}

export function depositBalanceFor(customer: string | undefined, entries: CustomerDepositEntry[], asOfISO: string): number {
  const key = customerDepositKey(customer);
  return computeCustomerDeposits(entries, asOfISO).byCustomer.find((b) => b.key === key)?.balance ?? 0;
}

// Only the "applied" rows, shaped like payments, so receivables aging can treat them as money against the invoice
// line without any cash having moved.
export function depositApplications(entries: CustomerDepositEntry[]): { saleId: string; amount: number }[] {
  const out: { saleId: string; amount: number }[] = [];
  for (const e of entries) if (e.kind === "applied" && e.saleId) out.push({ saleId: e.saleId, amount: e.amount });
  return out;
}

// Cash that actually moved because of customer deposits, by month: deposits received, deposits refunded.
// Applying a deposit to an invoice moves no cash.
export function monthlyDepositCash(entries: CustomerDepositEntry[]): Map<string, { received: number; refunds: number }> {
  const m = new Map<string, { received: number; refunds: number }>();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    const cur = m.get(k) ?? { received: 0, refunds: 0 };
    if (e.kind === "received") cur.received += e.amount;
    else if (e.kind === "refunded") cur.refunds += e.amount;
    m.set(k, cur);
  }
  return m;
}

export interface NewDepositCheck {
  customer: string;
  kind: CustomerDepositEntry["kind"];
  amount: number;
  date: string;
  // applied only: the invoice line, what is still owed on it, and whose invoice it is
  saleId?: string;
  invoiceOutstanding?: number;
  invoiceCustomer?: string;
  // true for a gift card's balance (lib/giftCards.ts): a bearer card may pay any customer's invoice.
  bearer?: boolean;
}

// null = fine to save; otherwise a message for the person.
export function validateNewDepositEntry(n: NewDepositCheck, entries: CustomerDepositEntry[]): string | null {
  const key = customerDepositKey(n.customer);
  if (!key) return "Choose which customer this is for.";
  if (!Number.isFinite(n.amount) || n.amount <= 0) return "Enter an amount above zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) return "Enter a valid date.";
  if (n.kind === "applied") {
    if (!n.saleId) return "Choose which invoice to use the deposit on.";
    if (!n.bearer && customerDepositKey(n.invoiceCustomer) !== key) return "That invoice belongs to a different customer.";
    if (n.amount > (n.invoiceOutstanding ?? 0) + EPS) return "That is more than is still owed on the invoice.";
  }
  const delta = n.kind === "received" ? n.amount : -n.amount;
  if (!depositTimelineStaysNonNegative([...eventsFor(key, entries), { date: n.date, delta }])) {
    return n.kind === "received" ? "Could not save that." : "That is more than this customer has on deposit with you on that date.";
  }
  return null;
}

// Deleting a received deposit takes money away from the balance; refuse if it has already been used or refunded.
// Several at once, judged as one change.
export function validateDepositRemovals(entryIds: string[], entries: CustomerDepositEntry[]): string | null {
  const ids = new Set(entryIds);
  const keys = new Set<string>();
  for (const e of entries) if (ids.has(e.id) && e.kind === "received") keys.add(customerDepositKey(e.customer));
  if (keys.size === 0) return null; // removing applied/refunded rows only puts the deposit back
  const rest = entries.filter((x) => !ids.has(x.id));
  for (const key of keys) {
    if (!depositTimelineStaysNonNegative(eventsFor(key, rest))) return "Some of that deposit has already been used or refunded. Delete those entries first.";
  }
  return null;
}
