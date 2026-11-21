// AI smart reminders for overdue payments and other business events.
//
// FIX: this used to recompute "what's outstanding on this sale/purchase"
// from scratch with its own qty*unitPrice math. That drifted from the real
// numbers in two ways: it didn't include sales tax in a credit sale's
// amount due, and it didn't group a multi-line invoice's Sale rows
// together, so a single invoice could show up as several separate
// "overdue" reminders instead of one. It now delegates to
// computeReceivablesAging/computePayablesAging — the same functions the
// Receivables & Payables page itself uses — so a reminder always matches
// what the page shows. Passing `products: []` and `saleEconomics: []` is
// deliberate, not a shortcut: computeReceivablesAging already falls back to
// qty*unitPrice for revenue when no SaleEconomics entry exists for a sale,
// which is exactly the level of detail a reminder needs (product name and
// COGS aren't part of the Reminder shape below).
import type { Sale, Purchase, ReceivablePayment, PayablePayment, ReceivableWriteOff, Expense, BillPayment, OpeningBalance, SupplierCreditEntry, SupplierReturn, CustomerDepositEntry } from "./types";
import { computeReceivablesAging, computePayablesAging, computeBillsPayable } from "./calculations";
import { todayIso } from "./format";

export interface Reminder {
  id: string;
  type: "overdue_receivable" | "overdue_payable" | "overdue_bill" | "low_stock" | "recurring_due";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  entityId: string;
  entityName?: string;
  amount?: number;
  daysOverdue?: number;
  actionUrl?: string;
}

function priorityFor(daysOverdue: number): "low" | "medium" | "high" {
  return daysOverdue > 60 ? "high" : daysOverdue > 30 ? "medium" : "low";
}

/**
 * Generate reminders for overdue receivables
 */
export function generateReceivableReminders(
  sales: Sale[],
  payments: ReceivablePayment[],
  writeOffs: ReceivableWriteOff[] = [],
  asOfISO: string = todayIso(),
  openingBalances: OpeningBalance[] = [],
  customerDeposits: CustomerDepositEntry[] = []
): Reminder[] {
  const { lines } = computeReceivablesAging([], sales, [], payments, asOfISO, writeOffs, openingBalances, customerDeposits);
  return lines
    .filter((l) => l.daysOverdue > 0)
    .map((l) => ({
      id: `receivable-${l.saleId}`,
      type: "overdue_receivable" as const,
      title: `Overdue payment from ${l.customer || "customer"}`,
      description: `${l.customer || "Customer"} owes ${l.amountOutstanding.toFixed(2)} - ${l.daysOverdue} days overdue`,
      priority: priorityFor(l.daysOverdue),
      entityId: l.saleId,
      entityName: l.customer,
      amount: l.amountOutstanding,
      daysOverdue: l.daysOverdue,
      actionUrl: `/receivables-payables`,
    }));
}

/**
 * Generate reminders for overdue payables
 */
export function generatePayableReminders(
  purchases: Purchase[],
  payments: PayablePayment[],
  asOfISO: string = todayIso(),
  openingBalances: OpeningBalance[] = [],
  supplierReturns: SupplierReturn[] = [],
  supplierCredits: SupplierCreditEntry[] = []
): Reminder[] {
  const { lines } = computePayablesAging([], purchases, payments, asOfISO, openingBalances, supplierReturns, supplierCredits);
  return lines
    .filter((l) => l.daysOverdue > 0)
    .map((l) => ({
      id: `payable-${l.purchaseId}`,
      type: "overdue_payable" as const,
      title: `Overdue payment to ${l.supplier || "supplier"}`,
      description: `Pay ${l.supplier || "supplier"} ${l.amountOutstanding.toFixed(2)} - ${l.daysOverdue} days overdue`,
      priority: priorityFor(l.daysOverdue),
      entityId: l.purchaseId,
      entityName: l.supplier,
      amount: l.amountOutstanding,
      daysOverdue: l.daysOverdue,
      actionUrl: `/receivables-payables`,
    }));
}

/**
 * Generate reminders for overdue bills — general one-off expenses marked
 * "owed — not paid yet" (rent, contractor invoices, an employee's pay run,
 * utility bills). Same shape as generatePayableReminders above, for the
 * general-bills counterpart to a credit Purchase.
 */
export function generateBillReminders(
  expenses: Expense[],
  billPayments: BillPayment[],
  asOfISO: string = todayIso()
): Reminder[] {
  const { lines } = computeBillsPayable(expenses, billPayments, asOfISO);
  return lines
    .filter((l) => l.daysOverdue > 0)
    .map((l) => ({
      id: `bill-${l.expenseId}`,
      type: "overdue_bill" as const,
      title: `Overdue bill: ${l.payee}`,
      description: `Pay ${l.payee} ${l.amountOutstanding.toFixed(2)} for ${l.category} - ${l.daysOverdue} days overdue`,
      priority: priorityFor(l.daysOverdue),
      entityId: l.expenseId,
      entityName: l.payee,
      amount: l.amountOutstanding,
      daysOverdue: l.daysOverdue,
      actionUrl: `/receivables-payables`,
    }));
}

/**
 * Generate all smart reminders
 */
export function generateSmartReminders(
  sales: Sale[],
  purchases: Purchase[],
  receivablePayments: ReceivablePayment[],
  payablePayments: PayablePayment[],
  receivableWriteOffs: ReceivableWriteOff[] = [],
  expenses: Expense[] = [],
  billPayments: BillPayment[] = [],
  openingBalances: OpeningBalance[] = [],
  supplierReturns: SupplierReturn[] = [],
  supplierCredits: SupplierCreditEntry[] = [],
  customerDeposits: CustomerDepositEntry[] = []
): Reminder[] {
  const receivableReminders = generateReceivableReminders(sales, receivablePayments, receivableWriteOffs, undefined, openingBalances, customerDeposits);
  const payableReminders = generatePayableReminders(purchases, payablePayments, undefined, openingBalances, supplierReturns, supplierCredits);
  const billReminders = generateBillReminders(expenses, billPayments);

  return [...receivableReminders, ...payableReminders, ...billReminders].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
