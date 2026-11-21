// Verifies the recurring-expense-template scheduling math (lib/
// recurringExpenses.ts): which templates are due, and how a template's
// nextDueDate catches up after being missed for a while — without ever
// silently backfilling every missed period as its own occurrence. This
// mirrors lib/recurringInvoices.ts exactly (see that file's own comments),
// but had no test of its own before this.
//
// Run: npx tsx scripts/verify-recurring-expense-schedule.ts

import { dueRecurringExpenseTemplates, catchUpNextDueDate, calculateNextDueDate } from "../lib/recurringExpenses";
import type { RecurringExpenseTemplate } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

let seq = 0;
function template(overrides: Partial<RecurringExpenseTemplate>): RecurringExpenseTemplate {
  seq += 1;
  return {
    id: `t${seq}`,
    name: "Operations",
    category: "Operations",
    lines: [{ label: "Electricity", amount: 100 }],
    recurrence: "monthly",
    startDate: "2026-01-01",
    active: true,
    nextDueDate: "2026-09-01",
    createdAt: 0,
    ...overrides,
  };
}

// --- dueRecurringExpenseTemplates ---------------------------------------
{
  const due = template({ nextDueDate: "2026-09-01" });
  const notYet = template({ nextDueDate: "2026-10-01" });
  const paused = template({ nextDueDate: "2026-09-01", active: false });
  const ended = template({ nextDueDate: "2026-09-01", endDate: "2026-08-01" });

  const result = dueRecurringExpenseTemplates([due, notYet, paused, ended], "2026-09-25");
  const ids = result.map((t) => t.id);
  assert(ids.includes(due.id), "a due, active, non-ended template is returned");
  assert(!ids.includes(notYet.id), "a template not due yet is excluded");
  assert(!ids.includes(paused.id), "a paused (active: false) template is excluded even if due");
  assert(!ids.includes(ended.id), "a template whose endDate is before its own nextDueDate is excluded");
  assert(result.length === 1, "exactly one of the four templates is due");
}

{
  // exactly on the boundary — due date equal to asOfDate counts as due
  const dueToday = template({ nextDueDate: "2026-09-25" });
  const result = dueRecurringExpenseTemplates([dueToday], "2026-09-25");
  assert(result.length === 1, "nextDueDate === asOfDate counts as due, not just strictly before");
}

// --- catchUpNextDueDate: normal single-step case ------------------------
{
  const next = catchUpNextDueDate("monthly", "2026-08-01", "2026-08-15");
  assert(next === calculateNextDueDate("monthly", "2026-08-01"), "one missed month advances exactly one step");
  assert(next === "2026-09-01", "monthly from Aug 1, asOf Aug 15 => Sep 1");
}

// --- catchUpNextDueDate: several missed periods, no backfilling ---------
{
  // Template last generated Jan 1, monthly, but nobody opened the app
  // until September — should land on the first due date still in the
  // future relative to asOf, not generate (or need to loop through) an
  // occurrence for every missed month in between.
  const next = catchUpNextDueDate("monthly", "2026-01-01", "2026-09-25");
  assert(next > "2026-09-25", "catch-up always lands strictly after asOfDate");
  assert(next === "2026-10-01", "5+ missed monthly periods still resolve to a single forward jump, to Oct 1");
}

{
  const next = catchUpNextDueDate("weekly", "2026-09-01", "2026-09-25");
  assert(next > "2026-09-25", "weekly catch-up also lands strictly after asOfDate");
}

{
  const next = catchUpNextDueDate("yearly", "2023-09-25", "2026-09-25");
  assert(next === "2027-09-25", "yearly catch-up from 3 years back lands one year past asOf, not several");
}

// --- dueRecurringExpenseTemplates + catchUpNextDueDate together --------
// mirrors how DataContext actually uses these: generate one occurrence for
// what's due, then immediately move nextDueDate past asOf so the same
// template isn't re-offered next render.
{
  const t = template({ nextDueDate: "2026-01-01" });
  const due = dueRecurringExpenseTemplates([t], "2026-09-25");
  assert(due.length === 1, "a long-overdue template is still only offered once per call");
  const advanced = catchUpNextDueDate(t.recurrence, t.nextDueDate, "2026-09-25");
  const stillDue = dueRecurringExpenseTemplates([{ ...t, nextDueDate: advanced }], "2026-09-25");
  assert(stillDue.length === 0, "after catching up, the same template is no longer due today");
}

if (process.exitCode === 1) {
  console.error("\nSOME CHECKS FAILED");
} else {
  console.log("\nALL CHECKS PASSED");
}
