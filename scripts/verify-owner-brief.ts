// Checks the weekly brief: the week windows, the figure check that refuses invented numbers, and the input shape check.
// Pure functions only. Run: npx tsx scripts/verify-owner-brief.ts
import { buildBriefFacts, briefUsesOnlyGivenFigures, validateBriefFacts, finalizeBrief, addDaysIso, type BriefFacts } from "../lib/ownerBrief";
import type { Sale, Expense, Lead, ReceivablePayment } from "../lib/types";

let failed = false;
function check(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed = true; } else console.log("OK:", msg);
}

const today = "2026-11-02";
check(addDaysIso(today, -6) === "2026-10-27" && addDaysIso(today, -13) === "2026-10-20", "week windows are seven days each");

const sale = (id: string, date: string, qty: number, unitPrice: number) =>
  ({ id, productId: "p", qty, unitPrice, date, createdAt: 1, paymentMethod: "cash" }) as unknown as Sale;
const facts = buildBriefFacts({
  sales: [sale("a", "2026-10-30", 2, 100), sale("b", "2026-10-22", 1, 50), sale("c", "2026-09-01", 5, 999)],
  payments: [{ id: "x", saleId: "z", amount: 75, date: "2026-11-01", method: "cash", createdAt: 1 } as unknown as ReceivablePayment],
  expenses: [
    { id: "e1", name: "Rent", amount: 300, kind: "expense", isRecurring: false, startDate: "2026-10-29" } as unknown as Expense,
    { id: "e2", name: "Power", amount: 900, kind: "expense", isRecurring: true, startDate: "2026-10-29" } as unknown as Expense,
  ],
  leads: [{ id: "l", name: "A", stage: "new", createdAt: new Date("2026-10-31T10:00:00Z").getTime() } as unknown as Lead],
  returns: [],
  discounts: [],
  today,
});
check(facts.salesThisWeek === 200 && facts.salesLastWeek === 50, "sales are split into this week and the week before");
check(facts.salesCountThisWeek === 1, "only sales inside the window are counted");
check(facts.cashCollectedThisWeek === 75, "customer payments are counted for this week");
check(facts.oneOffExpensesThisWeek === 300, "recurring costs are left out of the one-off expense figure");
check(facts.newLeadsThisWeek === 1, "a lead created this week is counted");

const sample: BriefFacts = { salesThisWeek: 200, salesLastWeek: 50, salesCountThisWeek: 1, cashCollectedThisWeek: 75, oneOffExpensesThisWeek: 300, overdueOwed: 1234.5, overdueInvoices: 2, newLeadsThisWeek: 1 };
check(briefUsesOnlyGivenFigures("Sales were 200 and collections 75. Overdue is 1,234.50 across 2 invoices.", sample), "figures that match the facts are accepted");
check(!briefUsesOnlyGivenFigures("Sales were 9,999 this week, a strong result.", sample), "an invented figure is refused");
check(!briefUsesOnlyGivenFigures("Sales grew 300% on last week.", sample), "a percentage is refused even when its number matches a fact");
check(!briefUsesOnlyGivenFigures("Sales grew by 40 percent.", sample), "a percentage written as words is refused");
check(finalizeBrief("Short.", sample) === null, "a too-short brief is refused");
check(validateBriefFacts({ ...sample, salesThisWeek: "200" }) === null, "non-numeric facts are refused at the door");
check(validateBriefFacts(sample) !== null, "well-formed facts are accepted");

if (failed) process.exitCode = 1; else console.log("\nALL CHECKS PASSED");
