// The customer's view of an invoice: the balance, the payment record and the claim rule. Pure, no I/O.
// The balance uses the same arithmetic as the Invoices page: net revenue (after returns and discounts) plus tax, less the
// receivable payments recorded in Balancr. It deliberately leaves out anything Balancr does not hold: a customer deposit or
// credit, a write-off, and money the business has not yet entered. Those are shown to the owner, not the customer.
import { computeSaleEconomics } from "./calculations";
import type { Discount, ReceivablePayment, Sale, SaleReturn } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Same short reference the Invoices page prints, so the customer and the owner see one number.
export function invoiceRefFor(key: string): string {
  return `INV-${key.slice(-6).toUpperCase()}`;
}

export interface InvoiceSummary {
  isCredit: boolean; // false for an invoice paid up front (cash, card or bank): nothing is owed
  gross: number; // quantity x price, before any return or discount
  adjustments: number; // returns and discounts (zero or negative)
  net: number; // gross + adjustments
  tax: number;
  total: number; // net + tax: the amount the customer owes in total
  paid: number; // receivable payments recorded against these sales
  balance: number; // total - paid, never negative; zero when not a credit invoice
  status: "paid" | "overdue" | "outstanding";
  dueDate: string | null; // earliest due date across the lines
  firstDate: string; // earliest sale date
}

export function summariseInvoice(params: {
  sales: Sale[];
  returns: SaleReturn[];
  discounts: Discount[];
  payments: ReceivablePayment[];
  today: string;
}): InvoiceSummary {
  const { sales, returns, discounts, payments, today } = params;
  const saleIds = new Set(sales.map((s) => s.id));
  const isCredit = sales.some((s) => (s.paymentMethod ?? "cash") === "credit");
  // No product ledgers: this view needs revenue, not cost. computeSaleEconomics reads ledgers only for cost.
  const econ = computeSaleEconomics(sales, new Map(), [], returns, discounts);
  const gross = round2(sales.reduce((sum, s) => sum + s.qty * s.unitPrice, 0));
  const net = round2(econ.reduce((sum, e) => sum + e.revenue, 0));
  const tax = round2(sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0));
  const total = round2(net + tax);
  const paid = round2(payments.filter((p) => saleIds.has(p.saleId)).reduce((sum, p) => sum + p.amount, 0));
  const balance = isCredit ? Math.max(round2(total - paid), 0) : 0;
  const dues = sales.map((s) => s.dueDate).filter((d): d is string => !!d).sort();
  const dueDate = dues[0] ?? null;
  const status: InvoiceSummary["status"] = balance <= 0.005 ? "paid" : dueDate && dueDate < today ? "overdue" : "outstanding";
  const firstDate = sales.map((s) => s.date).sort()[0] ?? today;
  return { isCredit, gross, adjustments: round2(net - gross), net, tax, total, paid, balance, status, dueDate, firstDate };
}

// The rule for a payment claim: only an invoice that is still owed can be claimed against, and not for more than is owed.
export function claimProblem(amount: number, summary: InvoiceSummary): string | null {
  if (!summary.isCredit) return "This sale was paid when it was made, so there is nothing to claim.";
  if (summary.balance <= 0.005) return "This invoice is already paid in full.";
  if (!(amount > 0)) return "Enter the amount you paid.";
  if (amount > summary.balance + 0.5) return "That is more than the balance on this invoice.";
  return null;
}
