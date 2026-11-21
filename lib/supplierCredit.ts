// Supplier credit held as a balance (SupplierCreditEntry and SupplierReturn "hold_credit" in lib/types.ts).
// Pure functions, no I/O (see scripts/verify-supplier-credit.ts).
//
// The balance with one supplier is built from two sources and two ways out:
//   in : returns settled "hold_credit" (goods + tax, read straight from the SupplierReturn), and deposits
//   out: applied to one of their open bills, and refunded by them
// A balance may never be negative on any date, so every save and every delete is checked against the full timeline.
import type { SupplierCreditEntry, SupplierReturn } from "./types";

const EPS = 0.005;

// The same matching the rest of the app uses for supplier names (lib/supplierDelivery.ts, the Suppliers page):
// ignore case and spaces at either end. Kept identical on purpose, so a supplier's credit and its bills can never
// disagree about who is who.
export function supplierKey(name?: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

export function returnCredit(r: Pick<SupplierReturn, "creditAmount" | "taxAmount">): number {
  return (r.creditAmount || 0) + (r.taxAmount ?? 0);
}

interface Ev {
  date: string;
  delta: number;
}

function eventsFor(key: string, returns: SupplierReturn[], entries: SupplierCreditEntry[]): Ev[] {
  const ev: Ev[] = [];
  for (const r of returns) {
    if (r.settlement === "hold_credit" && supplierKey(r.supplier) === key) ev.push({ date: r.date, delta: returnCredit(r) });
  }
  for (const e of entries) {
    if (supplierKey(e.supplier) !== key) continue;
    ev.push({ date: e.date, delta: e.kind === "deposit" ? e.amount : -e.amount });
  }
  return ev;
}

// True when, walking the dates in order (money in before money out on the same day), the balance never dips below zero.
export function timelineStaysNonNegative(events: Ev[]): boolean {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.delta - a.delta));
  let bal = 0;
  for (const e of sorted) {
    bal += e.delta;
    if (bal < -EPS) return false;
  }
  return true;
}

export interface SupplierCreditBalance {
  key: string;
  supplier: string;
  fromReturns: number;
  deposits: number;
  applied: number;
  refunded: number;
  balance: number;
}

export interface SupplierCreditSummary {
  asOf: string;
  bySupplier: SupplierCreditBalance[]; // suppliers with any history, biggest balance first
  total: number; // everything suppliers hold for you: the balance sheet asset
}

export function computeSupplierCredit(returns: SupplierReturn[], entries: SupplierCreditEntry[], asOfISO: string): SupplierCreditSummary {
  const by = new Map<string, SupplierCreditBalance>();
  const row = (name: string): SupplierCreditBalance => {
    const key = supplierKey(name);
    let r = by.get(key);
    if (!r) {
      r = { key, supplier: name.trim(), fromReturns: 0, deposits: 0, applied: 0, refunded: 0, balance: 0 };
      by.set(key, r);
    }
    return r;
  };
  for (const r of returns) {
    if (r.settlement !== "hold_credit" || r.date > asOfISO || !supplierKey(r.supplier)) continue;
    row(r.supplier!).fromReturns += returnCredit(r);
  }
  for (const e of entries) {
    if (e.date > asOfISO || !supplierKey(e.supplier)) continue;
    const x = row(e.supplier);
    if (e.kind === "deposit") x.deposits += e.amount;
    else if (e.kind === "applied") x.applied += e.amount;
    else x.refunded += e.amount;
  }
  const list = [...by.values()];
  for (const x of list) x.balance = x.fromReturns + x.deposits - x.applied - x.refunded;
  list.sort((a, b) => b.balance - a.balance || a.supplier.localeCompare(b.supplier));
  // A balance that has been fully used still lists (history), but the asset only counts what is left.
  const total = list.reduce((s, x) => s + Math.max(0, x.balance), 0);
  return { asOf: asOfISO, bySupplier: list, total };
}

export function creditBalanceFor(supplier: string | undefined, returns: SupplierReturn[], entries: SupplierCreditEntry[], asOfISO: string): number {
  const key = supplierKey(supplier);
  return computeSupplierCredit(returns, entries, asOfISO).bySupplier.find((b) => b.key === key)?.balance ?? 0;
}

// Credit used on each bill (keyed by the bill's id: a credit Purchase or an opening-balance payable).
export function creditAppliedByBill(entries: SupplierCreditEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== "applied" || !e.purchaseId) continue;
    m.set(e.purchaseId, (m.get(e.purchaseId) ?? 0) + e.amount);
  }
  return m;
}

// Cash that actually moved because of supplier credit, by month: deposits paid out, credit refunded in.
// Applying credit to a bill and credit from a return move no cash.
export function monthlyCreditCash(entries: SupplierCreditEntry[]): Map<string, { deposits: number; refunds: number }> {
  const m = new Map<string, { deposits: number; refunds: number }>();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    const cur = m.get(k) ?? { deposits: 0, refunds: 0 };
    if (e.kind === "deposit") cur.deposits += e.amount;
    else if (e.kind === "refunded") cur.refunds += e.amount;
    m.set(k, cur);
  }
  return m;
}

export interface NewCreditCheck {
  supplier: string;
  kind: SupplierCreditEntry["kind"];
  amount: number;
  date: string;
  // applied only: the bill and what is still owed on it, and whose bill it is
  purchaseId?: string;
  billOutstanding?: number;
  billSupplier?: string;
}

// null = fine to save; otherwise a message for the person.
export function validateNewCreditEntry(n: NewCreditCheck, returns: SupplierReturn[], entries: SupplierCreditEntry[]): string | null {
  const key = supplierKey(n.supplier);
  if (!key) return "Choose which supplier this is for.";
  if (!Number.isFinite(n.amount) || n.amount <= 0) return "Enter an amount above zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) return "Enter a valid date.";
  if (n.kind === "applied") {
    if (!n.purchaseId) return "Choose which bill to use the credit on.";
    if (supplierKey(n.billSupplier) !== key) return "That bill belongs to a different supplier.";
    if (n.amount > (n.billOutstanding ?? 0) + EPS) return "That is more than is still owed on the bill.";
  }
  const delta = n.kind === "deposit" ? n.amount : -n.amount;
  if (!timelineStaysNonNegative([...eventsFor(key, returns, entries), { date: n.date, delta }])) {
    return n.kind === "deposit" ? "Could not save that." : "That is more credit than this supplier is holding for you on that date.";
  }
  return null;
}

// Deleting held-credit returns or deposits takes credit away; refuse if it has already been spent. Several at once
// (deleting a purchase takes its returns and the credit applied to it together), judged as one change.
export function validateRemovals(what: { returnIds?: string[]; entryIds?: string[] }, returns: SupplierReturn[], entries: SupplierCreditEntry[]): string | null {
  const rIds = new Set(what.returnIds ?? []);
  const eIds = new Set(what.entryIds ?? []);
  const keys = new Set<string>();
  for (const r of returns) if (rIds.has(r.id) && r.settlement === "hold_credit") keys.add(supplierKey(r.supplier));
  for (const e of entries) if (eIds.has(e.id) && e.kind === "deposit") keys.add(supplierKey(e.supplier));
  if (keys.size === 0) return null; // removing applied/refunded rows or non-credit returns only puts credit back
  const rs = returns.filter((x) => !rIds.has(x.id));
  const es = entries.filter((x) => !eIds.has(x.id));
  for (const key of keys) {
    if (!timelineStaysNonNegative(eventsFor(key, rs, es))) return "Some of that credit has already been used or refunded. Delete those entries first.";
  }
  return null;
}

export function validateRemoval(what: { returnId?: string; entryId?: string }, returns: SupplierReturn[], entries: SupplierCreditEntry[]): string | null {
  return validateRemovals({ returnIds: what.returnId ? [what.returnId] : [], entryIds: what.entryId ? [what.entryId] : [] }, returns, entries);
}
