// Month-end close checklist (v207b): the steps a month needs before its books are locked, each with a status worked out from the records.
// Nothing is changed here; locking the books is a separate, deliberate step the owner takes. Pure: the caller passes the records and the
// month. The month is a calendar month, "YYYY-MM".

export type CloseStatus = "done" | "attention";

export interface CloseStep {
  key: string;
  title: string;
  status: CloseStatus;
  detail: string;
}

export interface CloseInput {
  period: string; // YYYY-MM
  bankLines: { date: string; status: string }[];
  cashCountDates: string[];
  stockCountDates: string[];
  hasStock: boolean;
  overdueReceivables: number; // invoices overdue by more than 60 days
  overduePayables: number;
  expenseDates: string[];
  saleDates: string[];
  closedThrough?: string; // ISO date the books are locked through, if any
  accrualsForPeriod: number; // accruals recorded for the month (lib/accruals.ts)
  accrualsReviewed: boolean; // the owner confirmed the month needs no accruals
}

export const OVERDUE_RECEIVABLE_DAYS = 60;

const inMonth = (date: string, period: string) => typeof date === "string" && date.startsWith(`${period}-`);
export const periodEnd = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function buildCloseChecklist(i: CloseInput): { steps: CloseStep[]; readyToClose: boolean; lockThrough: string; alreadyLocked: boolean } {
  const unmatched = i.bankLines.filter((l) => inMonth(l.date, i.period) && l.status === "unmatched").length;
  const bankInMonth = i.bankLines.filter((l) => inMonth(l.date, i.period)).length;
  const counts = i.cashCountDates.filter((d) => inMonth(d, i.period)).length;
  const stockCounts = i.stockCountDates.filter((d) => inMonth(d, i.period)).length;
  const expenses = i.expenseDates.filter((d) => inMonth(d, i.period)).length;
  const sales = i.saleDates.filter((d) => inMonth(d, i.period)).length;
  const end = periodEnd(i.period);
  const alreadyLocked = !!i.closedThrough && i.closedThrough >= end;
  const steps: CloseStep[] = [
    { key: "bank", title: "Bank statement matched", status: unmatched === 0 ? "done" : "attention", detail: bankInMonth === 0 ? "No bank lines recorded for this month." : unmatched === 0 ? "Every bank line for the month is matched." : `${unmatched} bank line${unmatched === 1 ? "" : "s"} still unmatched.` },
    { key: "cash", title: "Cash counted", status: counts > 0 ? "done" : "attention", detail: counts > 0 ? `${counts} cash count${counts === 1 ? "" : "s"} recorded.` : "No cash count recorded this month." },
    { key: "stock", title: "Stock counted", status: !i.hasStock || stockCounts > 0 ? "done" : "attention", detail: !i.hasStock ? "No stock on hand, so nothing to count." : stockCounts > 0 ? "Stock was counted this month." : "No stock count recorded this month." },
    { key: "receivables", title: "Overdue customers chased", status: i.overdueReceivables === 0 ? "done" : "attention", detail: i.overdueReceivables === 0 ? `Nothing is more than ${OVERDUE_RECEIVABLE_DAYS} days overdue.` : `${i.overdueReceivables} invoice${i.overdueReceivables === 1 ? "" : "s"} more than ${OVERDUE_RECEIVABLE_DAYS} days overdue.` },
    { key: "payables", title: "Overdue bills paid or agreed", status: i.overduePayables === 0 ? "done" : "attention", detail: i.overduePayables === 0 ? "No bill is overdue." : `${i.overduePayables} bill${i.overduePayables === 1 ? "" : "s"} overdue.` },
    { key: "expenses", title: "Expenses recorded", status: expenses > 0 ? "done" : "attention", detail: expenses > 0 ? `${expenses} expense${expenses === 1 ? "" : "s"} recorded for the month.` : "No expenses recorded for this month." },
    { key: "accruals", title: "Unbilled costs accrued", status: i.accrualsForPeriod > 0 || i.accrualsReviewed ? "done" : "attention", detail: i.accrualsForPeriod > 0 ? `${i.accrualsForPeriod} accrual${i.accrualsForPeriod === 1 ? "" : "s"} recorded for costs used this month but not yet billed.` : i.accrualsReviewed ? "Confirmed: no unbilled costs to accrue this month." : "Add any costs used this month but not yet billed, or confirm there are none." },
    { key: "sales", title: "Sales recorded", status: sales > 0 ? "done" : "attention", detail: sales > 0 ? `${sales} sale${sales === 1 ? "" : "s"} recorded for the month.` : "No sales recorded for this month." },
  ];
  const readyToClose = steps.every((s) => s.status === "done");
  return { steps, readyToClose, lockThrough: end, alreadyLocked };
}
