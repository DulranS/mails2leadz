// AI cash flow predictions
import type { Sale, Expense, Purchase, Settings } from "./types";
import { addMonthsIso } from "./calculations";
import { localIsoDate } from "./localDate";

export interface CashFlowPrediction {
  date: string;
  projectedInflow: number;
  projectedOutflow: number;
  netCashFlow: number;
  cumulativeBalance: number;
}

export interface CashFlowForecast {
  predictions: CashFlowPrediction[];
  startingBalance: number;
  endingBalance: number;
  averageMonthlyCashFlow: number;
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  // Plain-language caveat handed to the assistant so it doesn't present the
  // projection as a bank balance. Always present.
  note: string;
  // Money already owed to / by the business right now (from the aging report,
  // opening balances included). NOT part of `predictions` — the projection above
  // is a simple sales/expense average. Present only when the caller passes it.
  pending?: { receivablesOutstanding: number; receivablesOverdue: number; payablesOutstanding: number; payablesOverdue: number };
}

/**
 * Calculate average monthly revenue from sales
 */
function calculateAverageMonthlyRevenue(sales: Sale[]): number {
  if (sales.length === 0) return 0;
  
  const monthlyTotals = new Map<string, number>();
  sales.forEach(sale => {
    const month = sale.date.substring(0, 7); // YYYY-MM
    const amount = sale.qty * sale.unitPrice;
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + amount);
  });

  const totals = Array.from(monthlyTotals.values());
  return totals.reduce((sum, val) => sum + val, 0) / totals.length;
}

/**
 * Calculate average monthly expenses
 */
function calculateAverageMonthlyExpenses(
  expenses: Expense[],
  purchases: Purchase[]
): number {
  let total = 0;
  let months = new Set<string>();

  expenses.forEach(expense => {
    if (expense.isRecurring) {
      const month = expense.startDate.substring(0, 7);
      months.add(month);
      total += expense.amount;
    }
  });

  purchases.forEach(purchase => {
    const month = purchase.date.substring(0, 7);
    months.add(month);
    total += purchase.qty * purchase.unitCost;
  });

  return months.size > 0 ? total / months.size : 0;
}

/**
 * Generate cash flow predictions for future months
 *
 * NOTE on `deterministic`: the per-month ±10% variation below (default,
 * `deterministic = false`) is meant to make a *chart* feeding off this
 * look like a plausible range rather than a single suspiciously-smooth
 * line — it is not noise to be fixed, for that use case. That does mean
 * two calls with identical inputs return different numbers by design, so
 * `deterministic: true` exists for exactly the one caller that can't
 * tolerate that: the AI assistant's forecast_cash_flow tool
 * (app/api/ai/chat/route.ts) hands this straight to the model as a
 * number to state in a chat reply, and a chat reply is not a chart — a
 * user asking the same cash-flow question twice in a row (or the model
 * calling this tool twice in one conversation) getting two different
 * numbers back, with nothing about their actual business having changed,
 * reads as the assistant being unreliable rather than as intentional
 * chart variety. Don't reuse the non-deterministic default anywhere else
 * that needs a stable result across renders either (a summary line, a
 * suggestion chip, anything memoized on the input data rather than
 * recomputed every call) — compute a plain average from
 * `sales`/`expenses`/`purchases` directly instead, the way
 * lib/aiSuggestedQuestions.ts does for its cash-flow-risk check.
 */
export function generateCashFlowForecast(
  sales: Sale[],
  expenses: Expense[],
  purchases: Purchase[],
  settings: Settings,
  months: number = 3,
  deterministic: boolean = false,
  pending?: CashFlowForecast["pending"]
): CashFlowForecast {
  const avgRevenue = calculateAverageMonthlyRevenue(sales);
  const avgExpenses = calculateAverageMonthlyExpenses(expenses, purchases);
  const avgNetCashFlow = avgRevenue - avgExpenses;

  const predictions: CashFlowPrediction[] = [];
  let cumulativeBalance = 0;
  // Calendar-safe: `setMonth` spilled over short months (31 Oct + 1 month = 1 Dec,
  // so the "next month" label skipped November), and `toISOString` read the UTC date.
  const todayIso = localIsoDate();

  for (let i = 1; i <= months; i++) {
    const dateStr = addMonthsIso(todayIso, i);

    // Add some randomness to simulate real-world variation — skipped
    // entirely (variation = 1, i.e. exactly the average) when
    // `deterministic` is true. See this function's own doc comment above.
    const revenueVariation = deterministic ? 1 : 0.9 + Math.random() * 0.2; // ±10%
    const expenseVariation = deterministic ? 1 : 0.9 + Math.random() * 0.2; // ±10%

    const projectedInflow = avgRevenue * revenueVariation;
    const projectedOutflow = avgExpenses * expenseVariation;
    const netCashFlow = projectedInflow - projectedOutflow;
    cumulativeBalance += netCashFlow;

    predictions.push({
      date: dateStr,
      projectedInflow,
      projectedOutflow,
      netCashFlow,
      cumulativeBalance,
    });
  }

  // Determine risk level
  const endingBalance = cumulativeBalance;
  const rentAmount = settings.rentAmount || 0;
  const riskLevel = endingBalance < rentAmount * 2 ? "high" : endingBalance < rentAmount * 4 ? "medium" : "low";

  // Generate recommendations
  const recommendations: string[] = [];
  if (riskLevel === "high") {
    recommendations.push("Cash flow is tight. Consider delaying non-essential purchases.");
    recommendations.push("Follow up on overdue receivables immediately.");
  } else if (riskLevel === "medium") {
    recommendations.push("Monitor cash flow closely over the next few months.");
    recommendations.push("Build a small cash buffer if possible.");
  } else {
    recommendations.push("Cash flow looks healthy. Consider investing in growth.");
  }

  if (avgNetCashFlow < 0) {
    recommendations.push("Average monthly cash flow is negative. Review expenses and pricing.");
  }
  if (pending && pending.receivablesOverdue > 0) {
    recommendations.push(
      `Customers are already ${Math.round(pending.receivablesOverdue)} overdue (${Math.round(pending.receivablesOutstanding)} owed in total): collecting it is cash the average above does not count.`
    );
  }
  if (pending && pending.payablesOverdue > 0) {
    recommendations.push(
      `${Math.round(pending.payablesOverdue)} to suppliers is already overdue (${Math.round(pending.payablesOutstanding)} owed in total): plan for it or agree new dates.`
    );
  }

  return {
    predictions,
    startingBalance: 0,
    endingBalance,
    averageMonthlyCashFlow: avgNetCashFlow,
    riskLevel,
    recommendations,
    note:
      "A rough projection from average monthly sales versus average expenses and purchases. Amounts are changes from today, not a cash balance, and it ignores when customers and suppliers actually pay. The Cash flow page has the dated forecast from real cash, invoices and bills.",
    ...(pending ? { pending } : {}),
  };
}
