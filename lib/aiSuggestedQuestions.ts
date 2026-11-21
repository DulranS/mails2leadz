// Auto-suggested questions for the AI Assistant composer.
//
// Deliberately NOT a model call. Every business already has its sales,
// purchases, expenses, products, and payments loaded live in DataContext
// (Firestore listeners) — so "what's worth asking the assistant right now"
// can be answered by running the exact same pure, local calculators the
// assistant itself uses as tools (lib/aiAnomalyDetection.ts,
// lib/aiSmartReminders.ts, lib/stockTracking.ts, lib/aiCashFlowPrediction.ts)
// and turning their output into plain-English questions. Zero extra tokens,
// zero extra latency, zero extra load on the daily AI usage cap
// (lib/aiUsageLimit.ts) — this runs entirely in the browser, as often as the
// underlying data changes, at no marginal cost.
//
// Each suggestion mirrors the phrasing a tool description in
// app/api/ai/chat/route.ts is listening for (e.g. "overdue", "unusual",
// "cash flow"), so tapping one and hitting send reliably routes the
// assistant to the right tool rather than a generic reply.
//
// Suggestions fill the composer rather than auto-sending, same as
// lib/aiQuickExamples.ts — consistent with the rest of the assistant UI,
// and it keeps a person from accidentally spending an AI turn (and a slot
// against their daily cap) on a suggestion they didn't actually want to ask.
//
// generateSuggestedQuestions() below is a plain, pure function — no React,
// no Firestore reads of its own, just the arrays a caller already has. It's
// called client-side today (app/assistant/page.tsx, fed by DataContext),
// but nothing here is browser-specific: the same function would work
// unchanged from a server context (e.g. a scheduled digest or push
// notification) given the same data arrays, no rework needed.

import type { Expense, PayablePayment, BillPayment, Product, Purchase, ReceivablePayment, ReceivableWriteOff, Sale, SaleReturn, Settings, StockAdjustment, OpeningBalance, SupplierCreditEntry, SupplierReturn, CustomerDepositEntry } from "./types";
import { generateAnomalyReport } from "./aiAnomalyDetection";
import { generateSmartReminders } from "./aiSmartReminders";
import { computeAllStockLevels, generateLowStockAlerts } from "./stockTracking";
import { formatMoney } from "./format";
import { localIsoDate } from "./localDate";

export interface SuggestedQuestion {
  id: string;
  text: string;
  // Higher runs first. Lets "money going out the door" (overdue payables/
  // receivables) outrank a merely-interesting anomaly, which outranks a
  // generic monthly comparison — roughly, urgency order.
  priority: number;
}

interface SuggestionInputs {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  receivablePayments: ReceivablePayment[];
  payablePayments: PayablePayment[];
  // Optional for the same reason as saleReturns/stockAdjustments below — a
  // written-off receivable simply won't be excluded from the overdue count
  // without it.
  receivableWriteOffs?: ReceivableWriteOff[];
  settings: Settings;
  // Unpaid one-off expenses ("bills") and payments against them — optional
  // for the same reason as receivableWriteOffs above: a caller built before
  // bills payable existed keeps compiling, just without bill reminders
  // folded into the "overdue payables" suggestion.
  billPayments?: BillPayment[];
  // Money customers/suppliers already owed on the day the app was adopted —
  // optional so older callers keep compiling (see OpeningBalance).
  openingBalances?: OpeningBalance[];
  // Restocked returns and stock adjustments — optional so any caller built
  // before these existed keeps compiling; low-stock suggestions below are
  // simply less precise (purchases - sales only) without them.
  saleReturns?: SaleReturn[];
  stockAdjustments?: StockAdjustment[];
  // Goods sent back to suppliers — optional for the same reason; without it a bill that was credited down
  // still looks overdue for its full amount and stock counts ignore the units that left.
  supplierReturns?: SupplierReturn[];
  // Supplier credit used on bills, for the same reason as supplierReturns.
  supplierCredits?: SupplierCreditEntry[];
  // Customer deposits used on invoices, for the same reason: an invoice settled by a deposit is not overdue.
  customerDeposits?: CustomerDepositEntry[];
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

// A same-signature-as-dashboard revenue/expense comparison for the current
// vs previous calendar month — cheap enough to just inline here rather than
// pulling in the full P&L engine for a one-line prompt.
function monthOverMonthQuestion(sales: Sale[], _expenses: Expense[]): SuggestedQuestion | null {
  // Built from the person's own calendar month. The old `toISOString()` versions
  // read the UTC month, and the "previous month" was local midnight converted to
  // UTC, which in Colombo (UTC+5:30) is the 31st of the month BEFORE: it compared
  // this month with the one two back.
  const now = new Date();
  const thisMonth = localIsoDate(now).slice(0, 7);
  const prevMonth = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);

  const revenueFor = (m: string) =>
    sales.filter((s) => monthKey(s.date) === m).reduce((sum, s) => sum + s.qty * s.unitPrice, 0);

  const thisRevenue = revenueFor(thisMonth);
  const prevRevenue = revenueFor(prevMonth);
  if (prevRevenue <= 0 || thisRevenue <= 0) return null;

  const changePct = ((thisRevenue - prevRevenue) / prevRevenue) * 100;
  // Only worth surfacing once there's a real swing — a 3% wobble isn't a
  // question, it's noise.
  if (Math.abs(changePct) < 15) return null;

  return {
    id: "mom-revenue",
    text:
      changePct < 0
        ? "Why is revenue down compared to last month?"
        : "What's driving the jump in revenue this month?",
    priority: 40,
  };
}

export function generateSuggestedQuestions(inputs: SuggestionInputs): SuggestedQuestion[] {
  const { sales, purchases, expenses, products, receivablePayments, payablePayments, settings, saleReturns = [], stockAdjustments = [], receivableWriteOffs = [], billPayments = [], openingBalances = [], supplierReturns = [], supplierCredits = [], customerDeposits = [] } = inputs;
  const suggestions: SuggestedQuestion[] = [];

  // --- Overdue receivables / payables --------------------------------
  const reminders = generateSmartReminders(sales, purchases, receivablePayments, payablePayments, receivableWriteOffs, expenses, billPayments, openingBalances, supplierReturns, supplierCredits, customerDeposits);
  const overdueReceivables = reminders.filter((r) => r.type === "overdue_receivable");
  const overduePayables = reminders.filter((r) => r.type === "overdue_payable" || r.type === "overdue_bill");

  if (overdueReceivables.length > 0) {
    const total = overdueReceivables.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    suggestions.push({
      id: "overdue-receivables",
      text:
        overdueReceivables.length === 1
          ? `Who owes me money that's overdue?`
          : `Who owes me money that's overdue? (${overdueReceivables.length} customers, ${formatMoney(total, settings.currency)})`,
      priority: 90,
    });
  }

  if (overduePayables.length > 0) {
    const highPriority = overduePayables.filter((r) => r.priority === "high");
    suggestions.push({
      id: "overdue-payables",
      text:
        highPriority.length > 0
          ? `Which overdue bills should I pay first?`
          : `What do I still owe suppliers?`,
      priority: 85,
    });
  }

  // --- Low stock --------------------------------------------------------
  const stockLevels = computeAllStockLevels(products, purchases, sales, saleReturns, stockAdjustments, supplierReturns);
  const lowStock = generateLowStockAlerts(stockLevels);
  if (lowStock.length > 0) {
    suggestions.push({
      id: "low-stock",
      text:
        lowStock.length === 1
          ? `Should I reorder ${lowStock[0].productName}?`
          : `Which products are running low on stock?`,
      priority: 75,
    });
  }

  // --- Anomalies ----------------------------------------------------------
  const anomalyReport = generateAnomalyReport(expenses, purchases);
  if (anomalyReport.highSeverity > 0) {
    suggestions.push({
      id: "anomalies",
      text: "Any unusual spending I should know about?",
      priority: 70,
    });
  }

  // --- Cash flow risk -------------------------------------------------
  // Deliberately not calling generateCashFlowForecast here: it injects
  // random month-to-month variation intended for a forecast chart, which
  // would make a suggestion chip's wording change on every re-render for
  // no reason. A plain trailing-3-month average is stable and is exactly
  // what "is my cash flow healthy" is really asking.
  const recentExpenseTotal = expenses
    .filter((e) => {
      const monthsAgo = (Date.now() - new Date(e.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 3;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  const recentRevenueTotal = sales
    .filter((s) => {
      const monthsAgo = (Date.now() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 3;
    })
    .reduce((sum, s) => sum + s.qty * s.unitPrice, 0);
  if (recentRevenueTotal > 0 && recentExpenseTotal > recentRevenueTotal * 0.85) {
    suggestions.push({
      id: "cash-flow",
      text: "How does my cash flow look for the next few months?",
      priority: 65,
    });
  }

  // --- Month-over-month revenue swing --------------------------------
  const momQuestion = monthOverMonthQuestion(sales, expenses);
  if (momQuestion) suggestions.push(momQuestion);

  return suggestions.sort((a, b) => b.priority - a.priority);
}
