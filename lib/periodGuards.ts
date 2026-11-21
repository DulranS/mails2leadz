// Which dates does each DataContext write touch? See lib/periodLock.ts for
// what the period lock is and is not.
//
// This is a table, not scattered `if`s, so that (a) every locked write path
// is visible in one place, and (b) scripts/verify-period-lock.ts can drive
// the exact same code the app runs. When you add a new write method to
// DataContext that creates, edits or deletes a dated one-off record, add it
// here too — otherwise the lock silently doesn't cover it. (The verify
// script fails if a name below no longer exists in DataContext.tsx.)

import { assertPeriodOpen } from "./periodLock";
import { periodEnd } from "./monthClose";
import { firstOfNextMonth } from "./accruals";
import { localIsoDate } from "./localDate";

type Dated = { id: string; date: string };

// Only the slices of app state the table needs. Deliberately structural
// (not the full record types) so tests can pass tiny fixtures.
export interface PeriodGuardState {
  sales: Dated[];
  purchases: Dated[];
  expenses: { id: string; startDate: string; isRecurring?: boolean }[];
  // v209: an accrual touches the month it is incurred and the month it reverses in
  accruals?: { id: string; accrualDate: string; reversalDate: string }[];
  receivablePayments: (Dated & { saleId: string })[];
  receivableWriteOffs: (Dated & { saleId: string })[];
  payablePayments: (Dated & { purchaseId: string })[];
  billPayments: (Dated & { expenseId: string })[];
  saleReturns: (Dated & { saleId: string })[];
  supplierReturns?: (Dated & { purchaseId: string })[];
  supplierCredits?: (Dated & { purchaseId?: string })[];
  customerDeposits?: (Dated & { saleId?: string })[];
  rentals?: { id: string; outDate: string; deposit?: number; depositEntryId?: string }[];
  consignments?: Dated[];
  businessRecords?: { id: string; date?: string; kind?: string }[];
  discounts: (Dated & { saleId: string })[];
  stockAdjustments: Dated[];
  capitalEntries: Dated[];
  // v289: shareholder dividends (the split of a dividend across the cap table, and the capital entry its cash went out in).
  shareholderDividends?: { id: string; date: string; capitalEntryId?: string }[];
  investmentTxns?: Dated[];
  tillPayouts?: Dated[]; // v292: cash taken out of the till, dated by the day it left
  lentLoans?: { id: string; startDate: string }[];
  lentLoanTxns?: Dated[];
  taxPayments: Dated[];
  recurringExpenseOccurrences: { id: string; period: string }[];
  openingBalances: Dated[];
}

type MaybeDate = string | undefined;
type Rule = (args: any[], s: PeriodGuardState) => MaybeDate[];

const byId = <T extends { id: string }>(list: T[], id: string): T | undefined => list.find((x) => x.id === id);
const dateOf = (x: { date: string } | undefined): MaybeDate => x?.date;

// Recurring expense/revenue schedules are not frozen (see periodLock.ts) —
// only one-off dated expenses are.
const expenseDate = (e: { startDate?: string; isRecurring?: boolean } | undefined): MaybeDate[] =>
  e && !e.isRecurring ? [e.startDate] : [];

// add / update / delete for a simple dated collection.
function simple(pick: (s: PeriodGuardState) => Dated[]): { add: Rule; update: Rule; remove: Rule } {
  return {
    add: (args) => [args[0]?.date],
    update: (args, s) => [dateOf(byId(pick(s), args[0])), args[1]?.date],
    remove: (args, s) => [dateOf(byId(pick(s), args[0]))],
  };
}

const receivablePayment = simple((s) => s.receivablePayments);
const receivableWriteOff = simple((s) => s.receivableWriteOffs);
const payablePayment = simple((s) => s.payablePayments);
const billPayment = simple((s) => s.billPayments);
const capital = simple((s) => s.capitalEntries);
const taxPayment = simple((s) => s.taxPayments);
const investmentTxn = simple((s) => s.investmentTxns ?? []);
const lentLoanTxn = simple((s) => s.lentLoanTxns ?? []);

// Terms that change what a lent loan earned or is owed. Editing only the borrower's name or the notes moves no
// money, so it stays allowed even after the loan's month is closed.
const LENT_MONEY_FIELDS = ["principal", "annualInterestRatePct", "termMonths", "repaymentStyle", "startDate"];

export const PERIOD_GUARDED_METHODS: Record<string, Rule> = {
  // Sales. Deleting a sale also deletes its payments, write-offs, returns
  // and discounts (see cascadeDelete), so their dates count too — otherwise
  // the batch would be half-refused halfway through.
  addSale: (args) => [args[0]?.date],
  // A sale recorded from a booking (args: bookingId, sale). Its sale date must be in an open period, like any sale.
  recordBookingSale: (args) => [args[1]?.date],
  // A sale recorded from a Won lead (args: leadId, sale).
  recordLeadSale: (args) => [args[1]?.date],
  // Several sale lines saved together (goods plus a delivery line): every line's date has to be in an open period.
  addSales: (args) => (args[0] as { date?: string }[]).map((r) => r?.date),
  updateSale: (args, s) => [dateOf(byId(s.sales, args[0])), args[1]?.date],
  deleteSale: (args, s) => [
    dateOf(byId(s.sales, args[0])),
    ...s.receivablePayments.filter((p) => p.saleId === args[0]).map(dateOf),
    ...s.receivableWriteOffs.filter((w) => w.saleId === args[0]).map(dateOf),
    ...s.saleReturns.filter((r) => r.saleId === args[0]).map(dateOf),
    ...s.discounts.filter((d) => d.saleId === args[0]).map(dateOf),
    // A customer deposit used on this invoice goes with it.
    ...(s.customerDeposits ?? []).filter((c) => c.saleId === args[0]).map(dateOf),
  ],
  bulkAddSales: (args) => (args[0] as { date?: string }[]).map((r) => r.date),
  // Converting an accepted estimate writes Sale rows dated today, so a
  // closed current month must refuse it like any other new sale.
  convertEstimateToInvoice: () => [localIsoDate()],
  // Recording a milestone as a sale writes a sale (and, for a paid milestone, a payment) dated today.
  recordMilestoneAsSale: () => [localIsoDate()],
  // Billing a late charge writes a sale dated today.
  recordLateFee: () => [localIsoDate()],
  // Recording a milestone as a sale writes a sale (and, for a paid milestone, a payment) dated today.

  // Purchases and orders received into stock.
  addPurchase: (args) => [args[0]?.date],
  updatePurchase: (args, s) => [dateOf(byId(s.purchases, args[0])), args[1]?.date],
  deletePurchase: (args, s) => [
    dateOf(byId(s.purchases, args[0])),
    ...s.payablePayments.filter((p) => p.purchaseId === args[0]).map(dateOf),
    ...(s.supplierReturns ?? []).filter((r) => r.purchaseId === args[0]).map(dateOf),
    // Supplier credit used on this bill goes with it.
    ...(s.supplierCredits ?? []).filter((c) => c.purchaseId === args[0]).map(dateOf),
  ],
  bulkAddPurchases: (args) => (args[0] as { date?: string }[]).map((r) => r.date),
  receivePurchaseOrder: (args) => [args[1]?.receivedDate],

  // One-off expenses only; recurring schedules are not frozen.
  addExpense: (args) => expenseDate(args[0]),
  // Till payouts (v292): dated cash out; recording one as an expense books it in the payout's own month.
  addTillPayout: (args) => [args[0]?.date],
  recordTillPayoutAsExpense: (args) => [args[0]?.date],
  deleteTillPayout: (args, s) => [dateOf(byId(s.tillPayouts ?? [], args[0]))],
  // Accruals: the cost lands in its month and reverses in the next; both months must be open.
  addAccrual: (args) => {
    const p = args[0]?.periodMonth as string | undefined;
    return p ? [periodEnd(p), firstOfNextMonth(p)] : [];
  },
  deleteAccrual: (args, s) => {
    const a = byId(s.accruals ?? [], args[0]);
    return a ? [a.accrualDate, a.reversalDate] : [];
  },
  updateExpense: (args, s) => {
    const before = byId(s.expenses, args[0]);
    return [...expenseDate(before), ...expenseDate({ ...before, ...args[1] })];
  },
  deleteExpense: (args, s) => [
    ...expenseDate(byId(s.expenses, args[0])),
    ...s.billPayments.filter((p) => p.expenseId === args[0]).map(dateOf),
  ],
  bulkAddExpenses: (args) => (args[0] as { startDate?: string; isRecurring?: boolean }[]).flatMap(expenseDate),
  // A drafted recurring-expense occurrence becomes a real dated expense on
  // its period start when posted.
  postExpenseOccurrence: (args, s) => [byId(s.recurringExpenseOccurrences, args[0])?.period],

  // Money movements against a sale/purchase/bill. What matters is the date
  // of the movement itself: collecting cash today against last quarter's
  // invoice lands in today's (open) month and is fine.
  addReceivablePayment: receivablePayment.add,
  updateReceivablePayment: receivablePayment.update,
  deleteReceivablePayment: receivablePayment.remove,
  addReceivableWriteOff: receivableWriteOff.add,
  updateReceivableWriteOff: receivableWriteOff.update,
  deleteReceivableWriteOff: receivableWriteOff.remove,
  addPayablePayment: payablePayment.add,
  updatePayablePayment: payablePayment.update,
  deletePayablePayment: payablePayment.remove,
  addBillPayment: billPayment.add,
  updateBillPayment: billPayment.update,
  deleteBillPayment: billPayment.remove,

  // Adjustments against a sale or stock.
  addSaleReturn: (args) => [args[0]?.date],
  deleteSaleReturn: (args, s) => [dateOf(byId(s.saleReturns, args[0]))],
  // Goods sent back to a supplier move stock, cash/what you owe and profit in
  // the month of the return, so a closed month refuses them like any other.
  addSupplierReturn: (args) => [args[0]?.date],
  deleteSupplierReturn: (args, s) => [dateOf(byId(s.supplierReturns ?? [], args[0]))],
  // Supplier credit (a deposit, credit used on a bill, credit refunded) moves cash, what you owe and the balance
  // sheet in its own month, so a closed month refuses it like any other money movement.
  addSupplierCredit: (args) => [args[0]?.date],
  // Customer deposits (received, used on an invoice, refunded) move cash, what you owe and the balance sheet in their own
  // month, so a closed month refuses them like any other money movement.
  addCustomerDeposit: (args) => [args[0]?.date],
  // Rentals. Renting out is dated money only when a deposit is taken (received that day). Returning one posts the rent and
  // any damage as sales, and any refund, all dated the day it came back. Deleting an open rental that holds a deposit also
  // removes that deposit, dated the day it was taken.
  addRental: (args) => (args[0]?.deposit ? [localIsoDate()] : []),
  // Closing a tab writes its sales, so it is dated like a sale on the day it is closed.
  closeTab: (args) => [args[1]?.date],
  returnRental: (args) => [args[1]?.returnedDate],
  deleteRental: (args, s) => {
    const r = byId(s.rentals ?? [], args[0]);
    return r?.depositEntryId ? [dateOf(byId(s.customerDeposits ?? [], r.depositEntryId))] : [];
  },
  deleteCustomerDeposit: (args, s) => [dateOf(byId(s.customerDeposits ?? [], args[0]))],
  deleteSupplierCredit: (args, s) => [dateOf(byId(s.supplierCredits ?? [], args[0]))],
  addDiscount: (args) => [args[0]?.date],
  addConsignmentEntry: (args) => [args[0]?.date],
  deleteConsignmentEntry: (args, s) => [dateOf(byId(s.consignments ?? [], args[0]))],
  addElectronicsRecord: (args) => [args[0]?.kind === "licence" || args[0]?.kind === "project" ? undefined : (args[0] as { date?: string } | undefined)?.date],
  updateElectronicsStatus: (args, s) => {
    const rec = byId(s.businessRecords ?? [], args[0]);
    return [rec?.kind === "licence" || rec?.kind === "project" ? undefined : rec?.date];
  },
  deleteElectronicsRecord: (args, s) => {
    const rec = byId(s.businessRecords ?? [], args[0]);
    return [rec?.kind === "licence" || rec?.kind === "project" ? undefined : rec?.date];
  },
  deleteDiscount: (args, s) => [dateOf(byId(s.discounts, args[0]))],
  addStockAdjustment: (args) => [args[0]?.date],
  // A stock count writes its adjustments dated today.
  recordStockCount: () => [localIsoDate()],
  deleteStockAdjustment: (args, s) => [dateOf(byId(s.stockAdjustments, args[0]))],

  // Owner capital and remittances to a tax authority (self-reported).
  addCapitalEntry: capital.add,
  // An equity raise that also records the cash: the cash entry's date has to be in an open period.
  recordEquityRaise: (args) => [(args[0] as { capitalEntry?: { date?: string } })?.capitalEntry?.date],
  // A batch of investor entries: every date in it has to be in an open period, or none are saved.
  addCapitalEntries: (args) => (args[0] as { date?: string }[]).map((e) => e?.date),
  updateCapitalEntry: capital.update,
  deleteCapitalEntry: capital.remove,
  // Securities trades and income move cash and profit in their month, so a closed month refuses them.
  addInvestmentTxn: investmentTxn.add,
  deleteInvestmentTxn: investmentTxn.remove,
  // Money lent out. A loan's money starts the day it was handed over, and every repayment is on or after that
  // day, so guarding the start date also guards everything that follows from it.
  addLentLoan: (args) => [args[0]?.startDate],
  updateLentLoan: (args, s) => {
    const patch = args[1] ?? {};
    if (!LENT_MONEY_FIELDS.some((f) => f in patch)) return [];
    return [byId(s.lentLoans ?? [], args[0])?.startDate, patch.startDate];
  },
  deleteLentLoan: (args, s) => [byId(s.lentLoans ?? [], args[0])?.startDate],
  addLentLoanTxn: lentLoanTxn.add,
  deleteLentLoanTxn: lentLoanTxn.remove,
  addTaxPayment: taxPayment.add,
  updateTaxPayment: taxPayment.update,
  deleteTaxPayment: taxPayment.remove,

  // Production/fulfilment runs create dated purchase + sale rows.
  // An opening balance moves owner's capital on the Balance Sheet, so a closed
  // month can't gain or lose one. Deleting one also removes the collections /
  // supplier payments / write-offs recorded against it (same as deleteSale).
  addOpeningBalance: (args) => [args[0]?.date],
  deleteOpeningBalance: (args, s) => [
    dateOf(byId(s.openingBalances, args[0])),
    ...s.receivablePayments.filter((p) => p.saleId === args[0]).map(dateOf),
    ...s.receivableWriteOffs.filter((w) => w.saleId === args[0]).map(dateOf),
    ...s.payablePayments.filter((p) => p.purchaseId === args[0]).map(dateOf),
    // Supplier credit used on an opening-balance payable goes with it.
    ...(s.supplierCredits ?? []).filter((c) => c.purchaseId === args[0]).map(dateOf),
    // A customer deposit used on an opening-balance receivable goes with it.
    ...(s.customerDeposits ?? []).filter((c) => c.saleId === args[0]).map(dateOf),
  ],

  // v289 shareholder dividends: the split is a payment record and its cash is a capital withdrawal. Both dates count on delete,
  // because the cash entry is removed with the dividend.
  recordShareholderDividend: (args) => [(args[0] as { dividend?: { date?: string } } | undefined)?.dividend?.date],
  deleteShareholderDividend: (args, s) => {
    const d = byId(s.shareholderDividends ?? [], args[0]);
    return [d?.date, d?.capitalEntryId ? dateOf(byId(s.capitalEntries, d.capitalEntryId)) : undefined];
  },

  fulfillOffer: (args) => [args[1]?.date],
  recordProduction: (args) => [args[1]?.date],
};

export function datesTouchedBy(method: string, args: unknown[], state: PeriodGuardState): MaybeDate[] {
  const rule = PERIOD_GUARDED_METHODS[method];
  return rule ? rule(args as any[], state) : [];
}

// Wraps every guarded method on `value` so it first checks the period lock.
// Non-guarded members (data arrays, reads, everything else) pass through
// untouched. The check runs inside the returned async function, so a locked
// period surfaces as a rejected promise — exactly how requirePermission
// failures already reach the forms' catch blocks and toasts.
export function withPeriodGuards<T extends Record<string, any>>(
  value: T,
  getClosedThrough: () => string | undefined,
  getState: () => PeriodGuardState
): T {
  const wrapped: Record<string, any> = { ...value };
  for (const name of Object.keys(PERIOD_GUARDED_METHODS)) {
    const original = value[name];
    if (typeof original !== "function") continue;
    wrapped[name] = async (...args: unknown[]) => {
      assertPeriodOpen(getClosedThrough(), datesTouchedBy(name, args, getState()));
      return original(...args);
    };
  }
  return wrapped as T;
}
