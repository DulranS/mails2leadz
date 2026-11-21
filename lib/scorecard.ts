// The quick scorecard (pass 305): nine checks over the trailing 12 months, from figures this app already keeps.
// Targets (the "Quick Scorecard" reference): gross margin above 40%; SG&A below 30%; R&D below 30%; depreciation below 10%;
// interest below 15%; net margin above 20%; cash above debt; debt-to-equity below 0.80; capex below 25% of revenue.
// Two are worked out here rather than read off the P&L:
//   - R&D: the app has no R&D account. A cost counts as R&D when its category name says R&D, research or development.
//   - SG&A: selling plus admin costs (lib/sga.ts), less that R&D, because the reference lists the two apart.
// Debt-to-equity uses loans on the books (interest-bearing debt), the same as the health page. Pure.
import { monthlyNormalizedAmount } from "./calculations";
import type { Expense } from "./types";

export function isRdCategory(name: string): boolean {
  return /\br\s*&\s*d\b|\bresearch\b|\bdevelopment\b/i.test(name || "");
}

/** R&D spent in the given months (YYYY-MM), counted the way the P&L counts expenses: recurring ones land every active month. */
export function rdExpenseFor(expenses: Expense[], monthKeys: string[]): number {
  let total = 0;
  for (const mk of monthKeys) {
    const [y, m] = mk.split("-").map(Number);
    const monthStart = `${mk}-01`;
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    for (const e of expenses) {
      if (e.kind === "revenue" || !isRdCategory(e.category)) continue;
      if (e.isRecurring) {
        const started = e.startDate < nextMonth;
        const notEnded = !e.endDate || e.endDate >= monthStart;
        if (started && notEnded) total += monthlyNormalizedAmount(e.amount, e.recurrence);
      } else if (e.startDate >= monthStart && e.startDate < nextMonth) {
        total += e.amount;
      }
    }
  }
  return Math.round(total * 100) / 100;
}

export interface ScorecardMonth {
  totalRevenue: number;
  grossProfit: number;
  sellingExpenses: number;
  adminExpenses: number;
  depreciationExpense: number;
  interestExpense: number;
  netProfitAfterTax: number;
  fixedAssetPurchases: number;
}

export interface ScorecardInput {
  months: ScorecardMonth[]; // the trailing 12 months
  rdExpense: number; // from rdExpenseFor over the same months
  cash: number;
  loansPayable: number;
  totalEquity: number;
}

export interface ScorecardRow {
  id: string;
  label: string;
  target: string;
  value: number | null;
  unit: "%" | "x" | "money";
  pass: boolean | null; // null when there is nothing to judge (no revenue, no equity)
}

const pctOf = (amount: number, revenue: number): number | null =>
  revenue > 0 ? Math.round((amount / revenue) * 1000) / 10 : null;

export function scorecard(i: ScorecardInput): ScorecardRow[] {
  const sum = (k: keyof ScorecardMonth) => i.months.reduce((t, m) => t + (Number(m[k]) || 0), 0);
  const revenue = sum("totalRevenue");
  const sga = sum("sellingExpenses") + sum("adminExpenses") - i.rdExpense;
  const debtToEquity = i.totalEquity > 0 ? Math.round((i.loansPayable / i.totalEquity) * 100) / 100 : null;
  const percentRow = (id: string, label: string, target: string, value: number | null, pass: (v: number) => boolean): ScorecardRow => ({
    id, label, target, value, unit: "%", pass: value === null ? null : pass(value),
  });
  return [
    percentRow("gross", "Gross margin", "above 40%", pctOf(sum("grossProfit"), revenue), (v) => v > 40),
    percentRow("sga", "SG&A (selling and admin, excluding R&D)", "below 30%", pctOf(sga, revenue), (v) => v < 30),
    percentRow("rd", "R&D", "below 30%", pctOf(i.rdExpense, revenue), (v) => v < 30),
    percentRow("depreciation", "Depreciation", "below 10%", pctOf(sum("depreciationExpense"), revenue), (v) => v < 10),
    percentRow("interest", "Interest", "below 15%", pctOf(sum("interestExpense"), revenue), (v) => v < 15),
    percentRow("net", "Net margin", "above 20%", pctOf(sum("netProfitAfterTax"), revenue), (v) => v > 20),
    {
      id: "cash-debt", label: "Cash over debt", target: "cash above loans",
      value: Math.round((i.cash - i.loansPayable) * 100) / 100, unit: "money", pass: i.cash > i.loansPayable,
    },
    {
      id: "de", label: "Debt-to-equity", target: "below 0.80",
      value: debtToEquity, unit: "x", pass: debtToEquity === null ? null : debtToEquity < 0.8,
    },
    percentRow("capex", "Capex (fixed asset purchases)", "below 25%", pctOf(sum("fixedAssetPurchases"), revenue), (v) => v < 25),
  ];
}
