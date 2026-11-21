// Payment tracking and aging for accounts receivable and payable — the
// shape /api/aging/report exposes to external callers (e.g. an
// accountant's own tooling, via an API key — see requireAiContext).
//
// FIX: the row-level math here used to be hand-rolled (qty*unitPrice with
// no tax, one row per Sale/Purchase with no invoice grouping, local-time
// `new Date()` diffing). That could disagree with what the Receivables &
// Payables page itself shows for the same customer. It now delegates to
// computeReceivablesAging/computePayablesAging in lib/calculations.ts —
// the same functions the app's own UI uses — and just reshapes their
// output into this file's public types, so this report can never drift
// from what a person sees in the app.
import type { Sale, Purchase, ReceivablePayment, PayablePayment, ReceivableWriteOff, Expense, BillPayment, OpeningBalance, SupplierCreditEntry, SupplierReturn, CustomerDepositEntry } from "./types";
import { computeReceivablesAging, computePayablesAging, computeBillsPayable } from "./calculations";
import { todayIso } from "./format";

export interface AgingBucket {
  label: string;
  days: number;
  amount: number;
  count: number;
}

export interface ReceivableAging {
  saleId: string;
  customerName?: string;
  customerContact?: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  daysOverdue: number;
  status: "current" | "overdue" | "critical";
}

export interface PayableAging {
  purchaseId: string;
  supplier?: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  daysOverdue: number;
  status: "current" | "overdue" | "critical";
  // "supplier" = credit inventory purchase; "bill" = a general unpaid
  // Expense (rent, utilities, a contractor or employee bill). Both are
  // real accounts payable — kept in one list so an accountant's tooling
  // sees total AP in one place, distinguished by this field.
  source: "supplier" | "bill";
}

export interface AgingReport {
  totalOutstanding: number;
  totalOverdue: number;
  totalCritical: number;
  buckets: AgingBucket[];
  receivables: ReceivableAging[];
  payables: PayableAging[];
}

/**
 * Get status based on days overdue
 */
function getStatus(daysOverdue: number): "current" | "overdue" | "critical" {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 60) return "overdue";
  return "critical";
}

function bucketLabelFor(daysOverdue: number): string {
  if (daysOverdue <= 0) return "0-30 days (current)";
  if (daysOverdue <= 30) return "1-30 days overdue";
  if (daysOverdue <= 60) return "31-60 days overdue";
  if (daysOverdue <= 90) return "61-90 days overdue";
  return "90+ days overdue";
}

/**
 * Generate aging buckets from a list of aging records
 */
function generateAgingBuckets(records: { daysOverdue: number; balance: number }[]): AgingBucket[] {
  const buckets: Map<string, { amount: number; count: number }> = new Map([
    ["0-30 days (current)", { amount: 0, count: 0 }],
    ["1-30 days overdue", { amount: 0, count: 0 }],
    ["31-60 days overdue", { amount: 0, count: 0 }],
    ["61-90 days overdue", { amount: 0, count: 0 }],
    ["90+ days overdue", { amount: 0, count: 0 }],
  ]);

  records.forEach(record => {
    const bucketLabel = bucketLabelFor(record.daysOverdue);
    const bucket = buckets.get(bucketLabel);
    if (bucket) {
      bucket.amount += record.balance;
      bucket.count += 1;
    }
  });

  return Array.from(buckets.entries()).map(([label, data]) => ({
    label,
    days: 0, // Not used in display
    amount: data.amount,
    count: data.count,
  }));
}

/**
 * Generate complete aging report
 */
export function generateAgingReport(
  sales: Sale[],
  purchases: Purchase[],
  receivablePayments: ReceivablePayment[],
  payablePayments: PayablePayment[],
  receivableWriteOffs: ReceivableWriteOff[] = [],
  asOfISO: string = todayIso(),
  expenses: Expense[] = [],
  billPayments: BillPayment[] = [],
  openingBalances: OpeningBalance[] = [],
  supplierReturns: SupplierReturn[] = [],
  // Supplier credit used on bills: like credit from a return, it is no longer owed.
  supplierCredits: SupplierCreditEntry[] = [],
  // Customer deposits used on invoices: like a payment, they are no longer owed.
  customerDeposits: CustomerDepositEntry[] = []
): AgingReport {
  const receivablesAging = computeReceivablesAging([], sales, [], receivablePayments, asOfISO, receivableWriteOffs, openingBalances, customerDeposits);
  const payablesAging = computePayablesAging([], purchases, payablePayments, asOfISO, openingBalances, supplierReturns, supplierCredits);
  const billsPayable = computeBillsPayable(expenses, billPayments, asOfISO);

  const receivables: ReceivableAging[] = receivablesAging.lines.map((l) => ({
    saleId: l.saleId,
    customerName: l.customer,
    invoiceDate: l.date,
    dueDate: l.dueDate,
    totalAmount: l.amountDue,
    amountPaid: l.amountPaid + l.amountWrittenOff,
    balance: l.amountOutstanding,
    daysOverdue: l.daysOverdue,
    status: getStatus(l.daysOverdue),
  }));

  const payables: PayableAging[] = [
    ...payablesAging.lines.map((l) => ({
      purchaseId: l.purchaseId,
      supplier: l.supplier,
      invoiceDate: l.date,
      dueDate: l.dueDate,
      totalAmount: l.amountDue,
      amountPaid: l.amountPaid,
      balance: l.amountOutstanding,
      daysOverdue: l.daysOverdue,
      status: getStatus(l.daysOverdue),
      source: "supplier" as const,
    })),
    ...billsPayable.lines.map((l) => ({
      purchaseId: l.expenseId,
      supplier: l.payee,
      invoiceDate: l.date,
      dueDate: l.dueDate,
      totalAmount: l.amountDue,
      amountPaid: l.amountPaid,
      balance: l.amountOutstanding,
      daysOverdue: l.daysOverdue,
      status: getStatus(l.daysOverdue),
      source: "bill" as const,
    })),
  ];

  const receivableBuckets = generateAgingBuckets(receivables);

  const totalOutstanding = receivables.reduce((sum, r) => sum + r.balance, 0);
  const totalOverdue = receivables.filter(r => r.daysOverdue > 0).reduce((sum, r) => sum + r.balance, 0);
  const totalCritical = receivables.filter(r => r.status === "critical").reduce((sum, r) => sum + r.balance, 0);

  return {
    totalOutstanding,
    totalOverdue,
    totalCritical,
    buckets: receivableBuckets,
    receivables,
    payables,
  };
}

/**
 * Get overdue alerts for receivables
 */
export function getOverdueAlerts(receivables: ReceivableAging[]): ReceivableAging[] {
  return receivables
    .filter(r => r.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
