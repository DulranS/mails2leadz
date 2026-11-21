// Cost behaviour (v260): how each cost moves with activity. Fixed costs stay the same whatever you sell (rent, salaries, software, insurance). Variable
// costs rise and fall with sales (transport, card and payment fees). Semi-variable costs have a base plus a part that moves (utilities, marketing,
// sales pay with commission, repairs). Each expense category has a default behaviour; the owner can read the split for any months. Pure.
import { EXPENSE_CATEGORIES } from "./types";

export type CostBehaviour = "fixed" | "variable" | "semi_variable";

export const CATEGORY_BEHAVIOUR: Record<(typeof EXPENSE_CATEGORIES)[number], CostBehaviour> = {
  "Marketing": "semi_variable",
  "Rent & utilities": "semi_variable",
  "Payroll & labor": "fixed",
  "Sales payroll": "semi_variable",
  "Software & tools": "fixed",
  "Transport & logistics": "variable",
  "Professional fees": "fixed",
  "Insurance": "fixed",
  "Bank & payment fees": "variable",
  "Other overhead": "semi_variable",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// A recurring monthly cost is recorded once, with the day it starts; it counts in every month from its start to the end of the period.
export interface CostRecord { amount: number; category: string; startDate: string; kind?: string; isRecurring?: boolean; recurrence?: string }

export function splitCosts(expenses: CostRecord[], period: { from: string; to: string }) {
  const out = { fixed: 0, variable: 0, semi_variable: 0, total: 0 };
  const monthsIn = (from: string, to: string) => {
    const list: string[] = [];
    let [y, mo] = from.split("-").map(Number);
    const [ty, tmo] = to.split("-").map(Number);
    while (y < ty || (y === ty && mo <= tmo)) { list.push(`${y}-${String(mo).padStart(2, "0")}`); mo++; if (mo > 12) { mo = 1; y++; } }
    return list;
  };
  for (const e of expenses) {
    if (e.kind && e.kind !== "expense") continue;
    const b = CATEGORY_BEHAVIOUR[e.category as keyof typeof CATEGORY_BEHAVIOUR];
    if (!b) continue;
    const recurringMonthly = e.isRecurring && e.recurrence === "monthly";
    const occurrences = recurringMonthly
      ? monthsIn(period.from, period.to).filter((m) => m >= e.startDate.slice(0, 7))
      : [e.startDate.slice(0, 7)].filter((m) => m >= period.from && m <= period.to);
    for (const _m of occurrences) {
      out[b] += e.amount;
      out.total += e.amount;
    }
  }
  const pct = (n: number) => (out.total > 0 ? Math.round((n / out.total) * 1000) / 10 : null);
  return {
    fixed: r2(out.fixed), variable: r2(out.variable), semiVariable: r2(out.semi_variable), total: r2(out.total),
    fixedPct: pct(out.fixed), variablePct: pct(out.variable), semiVariablePct: pct(out.semi_variable),
  };
}
