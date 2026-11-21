// Autopay for recurring bills (v286). A recurring expense template can be set to post each occurrence by itself when it falls due,
// instead of waiting in the Pending list for an owner or manager to check it and post it. The amounts start from the last posted
// bill (the same starting point a pending occurrence uses), so when a bill changes, the posted expense is edited afterwards.
// Both the autopay path and the manual "post" path build the Expense with postedExpenseFields, so they cannot drift apart. Pure: no I/O.
import type { RecurringExpenseLine, RecurringExpenseTemplate } from "./types";

export function isAutopay(t: Pick<RecurringExpenseTemplate, "autopay">): boolean {
  return t.autopay === true;
}

// The cost of a set of lines, rounded to the cent, so the posted total is what the lines add up to on screen.
export function linesTotal(lines: RecurringExpenseLine[]): number {
  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  return Math.round(sum * 100) / 100;
}

// The fields of the Expense a posted occurrence creates: a real, discrete, dated entry with its breakdown.
export function postedExpenseFields(
  t: Pick<RecurringExpenseTemplate, "name" | "category">,
  period: string,
  lines: RecurringExpenseLine[],
) {
  return {
    name: t.name,
    amount: linesTotal(lines),
    category: t.category,
    kind: "expense" as const,
    isRecurring: false, // a real, discrete, dated entry, not a projected one
    recurrence: "none" as const,
    startDate: period,
    breakdown: lines,
  };
}
