// Supplier statement of account: what YOUR books say you still owe ONE supplier, on one page, to send to them or to
// reconcile against the statement they sent you at month end.
//
// Built only from the payables lines the app already computes (supplier credit purchases and bills, after payments
// and credits), so it can never disagree with the Money owed screen. Read-only: it changes no figure.
import type { BillPayableLine, PayableLine } from "./calculations";

export interface SupplierStatementLine {
  date: string;
  description: string;
  dueDate: string;
  billed: number;
  settled: number; // paid or credited
  outstanding: number;
  daysOverdue: number;
  reference?: string;
}

const key = (s: string | undefined | null) => (s ?? "").trim().toLowerCase();

// Everything still owed to this supplier (matched by name, ignoring case and spaces), oldest first.
export function supplierStatementLines(payables: PayableLine[], bills: BillPayableLine[], supplier: string): SupplierStatementLine[] {
  const k = key(supplier);
  if (!k) return [];
  const out: SupplierStatementLine[] = [];
  for (const p of payables) {
    if (key(p.supplier) !== k || !(p.amountOutstanding > 0.005)) continue;
    out.push({
      date: p.date,
      description: p.productName,
      dueDate: p.dueDate,
      billed: p.amountDue,
      settled: p.amountPaid + (p.amountCredited ?? 0),
      outstanding: p.amountOutstanding,
      daysOverdue: p.daysOverdue,
      reference: p.isOpeningBalance ? "Opening balance" : undefined,
    });
  }
  for (const b of bills) {
    if (key(b.payee) !== k || !(b.amountOutstanding > 0.005)) continue;
    out.push({
      date: b.date,
      description: b.category || "Bill",
      dueDate: b.dueDate,
      billed: b.amountDue,
      settled: b.amountPaid,
      outstanding: b.amountOutstanding,
      daysOverdue: b.daysOverdue,
      reference: "Bill",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description));
}
