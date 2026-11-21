// Journal entries from the records (v271): credit and cash sales (with their tax), paid and unpaid expenses, and capital entries (investment, reinvestment,
// withdrawals; an outside investor's pool money is kept in its own account). Each entry is checked as it is made. Receivable and payable payments,
// purchases of stock, loans and depreciation are not mapped yet and are listed as such, rather than guessed. Pure.
import { makeEntry, type JEntry, type JLine } from "./journal";

export const NOT_MAPPED_YET = ["Sales returns and purchase returns in the journal", "Customer deposits and supplier credit", "Prepaid expenses"];

export function journalFromRecords(input: {
  sales: { id: string; date: string; qty: number; unitPrice: number; taxAmount?: number; paymentMethod?: string; productId?: string }[];
  expenses: { id: string; name: string; amount: number; category: string; kind: string; startDate: string; paymentStatus?: string; isRecurring?: boolean }[];
  capital: { id: string; kind: string; amount: number; date: string; poolOwned: boolean }[];
}): { entries: JEntry[]; errors: string[] } {
  const entries: JEntry[] = [];
  const errors: string[] = [];
  const add = (e: JEntry | { error: string }) => { if ("error" in e) errors.push(e.error); else entries.push(e); };
  for (const s of input.sales) {
    const net = Math.round(s.qty * s.unitPrice * 100) / 100;
    const tax = Math.round((s.taxAmount ?? 0) * 100) / 100;
    const debitAccount = s.paymentMethod === "credit" ? "Accounts receivable" : "Cash";
    const lines: JLine[] = [{ account: debitAccount, debit: net + tax, credit: 0 }, { account: "Sales revenue", debit: 0, credit: net }];
    if (tax > 0) lines.push({ account: "Sales tax payable", debit: 0, credit: tax });
    add(makeEntry(`sale:${s.id}`, s.date, "Sale", lines));
  }
  for (const e of input.expenses) {
    if (e.kind !== "expense") continue;
    const debitAccount = `Expense: ${e.category}`;
    const creditAccount = e.paymentStatus === "unpaid" ? "Accounts payable" : "Cash";
    add(makeEntry(`expense:${e.id}`, e.startDate, e.name || "Expense", [{ account: debitAccount, debit: e.amount, credit: 0 }, { account: creditAccount, debit: 0, credit: e.amount }]));
  }
  for (const c of input.capital) {
    const pool = c.poolOwned ? "Outside investors (pool)" : "Owners' capital";
    if (c.kind === "investment" || c.kind === "reinvestment") {
      add(makeEntry(`capital:${c.id}`, c.date, "Money put in", [{ account: "Cash", debit: c.amount, credit: 0 }, { account: pool, debit: 0, credit: c.amount }]));
    } else if (c.kind === "withdrawal") {
      add(makeEntry(`capital:${c.id}`, c.date, "Money taken out", [{ account: pool, debit: c.amount, credit: 0 }, { account: "Cash", debit: 0, credit: c.amount }]));
    }
  }
  return { entries, errors };
}
