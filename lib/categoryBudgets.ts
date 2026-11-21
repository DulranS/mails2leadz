// Monthly budget per expense category, set against what was actually spent that month.
//
// Read-only and derived. Actual spend is worked out with the same month rules as the P&L (expenseTotalsForMonth: a
// recurring cost counts in every month it is active, a one-off in the month it is dated), one category at a time, so
// the category rows always add up to the month's total expenses. The budget itself is a standing figure per category
// kept on the settings document; it changes no expense, profit or cash number anywhere.
import { expenseTotalsForMonth } from "./calculations";
import { EXPENSE_CATEGORIES, type Expense } from "./types";

export type BudgetStatus = "none" | "ok" | "watch" | "over";

export const BUDGET_WATCH_PCT = 80; // at or above this share of the budget: "watch"

export interface CategoryBudgetRow {
  category: string;
  budget: number | null; // null = no budget set for this category
  actual: number;
  remaining: number | null; // budget - actual: negative = over
  usedPct: number | null; // actual as % of budget
  status: BudgetStatus;
}

export interface CategoryBudgetSummary {
  month: string;
  rows: CategoryBudgetRow[]; // budgeted rows first (most used first), then unbudgeted spend
  totalActual: number; // every expense in the month, budgeted or not (equals the P&L's expense total)
  totalBudget: number; // sum of the budgets that are set
  budgetedActual: number; // spend in categories that have a budget
  unbudgetedActual: number; // spend in categories with no budget
  overCount: number;
}

const UNCATEGORISED = "Uncategorised";
const catOf = (e: Expense) => e.category?.trim() || UNCATEGORISED;

// Keeps only usable budgets: a positive, finite number per non-blank category name.
export function cleanBudgets(raw: Record<string, number> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    const name = k.trim();
    if (name && typeof v === "number" && Number.isFinite(v) && v > 0) out[name] = v;
  }
  return out;
}

export function computeCategoryBudgets(expenses: Expense[], budgets: Record<string, number> | undefined | null, month: string): CategoryBudgetSummary {
  const clean = cleanBudgets(budgets);
  const spend = expenses.filter((e) => e.kind === "expense");
  const byCat = new Map<string, Expense[]>();
  for (const e of spend) {
    const c = catOf(e);
    const list = byCat.get(c);
    if (list) list.push(e);
    else byCat.set(c, [e]);
  }
  const names = new Set<string>([...Object.keys(clean), ...byCat.keys()]);

  const rows: CategoryBudgetRow[] = [];
  for (const category of names) {
    const actual = expenseTotalsForMonth(byCat.get(category) ?? [], month).expenseTotal;
    const budget = clean[category] ?? null;
    if (budget === null && actual <= 0.005) continue; // nothing budgeted and nothing spent: not worth a row
    const usedPct = budget !== null ? (actual / budget) * 100 : null;
    const status: BudgetStatus = budget === null ? "none" : actual > budget + 0.005 ? "over" : usedPct! >= BUDGET_WATCH_PCT ? "watch" : "ok";
    rows.push({ category, budget, actual, remaining: budget !== null ? budget - actual : null, usedPct, status });
  }
  const order = (c: string) => {
    const i = (EXPENSE_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? 999 : i;
  };
  rows.sort((a, b) => {
    if ((a.budget === null) !== (b.budget === null)) return a.budget === null ? 1 : -1;
    if (a.budget !== null && b.budget !== null) return (b.usedPct ?? 0) - (a.usedPct ?? 0) || order(a.category) - order(b.category);
    return b.actual - a.actual || a.category.localeCompare(b.category);
  });

  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const budgetedActual = rows.filter((r) => r.budget !== null).reduce((s, r) => s + r.actual, 0);
  return {
    month,
    rows,
    totalActual,
    totalBudget: rows.reduce((s, r) => s + (r.budget ?? 0), 0),
    budgetedActual,
    unbudgetedActual: totalActual - budgetedActual,
    overCount: rows.filter((r) => r.status === "over").length,
  };
}
