// Customer history: one newest-first list of what has happened with a customer, drawn from the records the app already keeps:
// sales, deposits (paid in, used, refunded), rentals out and back, bookings, support cases and collection contacts. Customers
// are matched by name, the same way the rest of the app matches them. Nothing is stored or written here.
//
// Pure: no I/O. See scripts/verify-agenda.ts.
import { customerDepositKey } from "./customerDeposits";
import type { Booking, CollectionNote, CustomerDepositEntry, Rental, Sale, SupportCase } from "./types";

export type HistoryKind = "sale" | "deposit" | "rental" | "booking" | "support" | "collection";

export interface HistoryEvent {
  date: string;
  kind: HistoryKind;
  label: string;
  amount?: number;
}

export interface HistoryInputs {
  name: string;
  sales: Sale[];
  deposits: CustomerDepositEntry[];
  rentals: Rental[];
  bookings: Booking[];
  supportCases: SupportCase[];
  collectionNotes: CollectionNote[];
  productName: (productId: string) => string;
}

export function customerHistory(i: HistoryInputs): HistoryEvent[] {
  const key = customerDepositKey(i.name);
  if (!key) return [];
  const out: HistoryEvent[] = [];
  const same = (name?: string) => customerDepositKey(name) === key;

  for (const s of i.sales) {
    if (!same(s.customer)) continue;
    const what = s.isDelivery ? "Delivery" : i.productName(s.productId) || "Sale";
    out.push({ date: s.date, kind: "sale", label: `${what} × ${s.qty}`, amount: Math.round(s.qty * s.unitPrice * 100) / 100 });
  }
  for (const d of i.deposits) {
    if (!same(d.customer)) continue;
    const label =
      d.kind === "received"
        ? d.giftCardCode
          ? `Gift card ${d.giftCardCode} sold`
          : "Paid in advance"
        : d.kind === "applied"
          ? "Deposit used on an invoice"
          : "Deposit refunded";
    out.push({ date: d.date, kind: "deposit", label, amount: d.amount });
  }
  for (const r of i.rentals) {
    if (!same(r.customer)) continue;
    out.push({ date: r.outDate, kind: "rental", label: `Rented out: ${r.item}` });
    if (r.returnedDate) out.push({ date: r.returnedDate, kind: "rental", label: `Returned: ${r.item}`, amount: r.charged });
  }
  for (const b of i.bookings) {
    if (!same(b.customerName)) continue;
    out.push({ date: b.date, kind: "booking", label: `Booking at ${b.startTime} (${b.status})` });
  }
  for (const c of i.supportCases) {
    if (!same(c.customerName)) continue;
    out.push({ date: c.openedOn, kind: "support", label: `Support: ${c.subject}` });
    if (c.resolvedOn) out.push({ date: c.resolvedOn, kind: "support", label: `Resolved: ${c.subject}` });
  }
  for (const n of i.collectionNotes) {
    if (n.subjectKey !== key) continue;
    const promise = n.promisedDate ? ` · promised ${n.promisedAmount ? `${n.promisedAmount} ` : ""}by ${n.promisedDate}` : "";
    out.push({ date: n.date, kind: "collection", label: `Payment contact: ${n.outcome}${promise}` });
  }

  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}
