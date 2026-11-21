// Accruals (lib/accruals.ts) and their place in the books: a cost is counted once across the two months it spans, it is not cash, it is
// refused in a closed month, and the wiring to the monthly profit, the balance sheet, the security rules and the close screen.
// Run: npx tsx scripts/verify-accruals.ts
import fs from "node:fs";
import { firstOfNextMonth, validateAccrual, accrualAsExpenses, accruedLiabilityAsOf } from "../lib/accruals";
import { expenseTotalsForMonth } from "../lib/calculations";
import { computeMonthlyPnL } from "../lib/calculations";
import type { Accrual, Expense } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(firstOfNextMonth("2026-10") === "2026-11-01" && firstOfNextMonth("2026-12") === "2027-01-01", "an accrual reverses on the first day of the next month, rolling the year over in December");

const good = { name: "Delivery received 30 Oct", amount: 100, category: "Transport & logistics", periodMonth: "2026-10" };
ok(validateAccrual(good, undefined) === null, "a cost with a name, an amount, a category and a month passes");
ok(validateAccrual({ ...good, amount: 0 }, undefined) !== null && validateAccrual({ ...good, amount: -5 }, undefined) !== null, "an accrual must be an amount above zero");
ok(validateAccrual({ ...good, category: "Snacks" }, undefined) !== null, "the category must be one of the expense categories");
ok(validateAccrual({ ...good, periodMonth: "2026-13" }, undefined) !== null, "the month must be a real month");
ok(validateAccrual({ ...good, name: "x" }, undefined) !== null, "a cost must say what it is for");
ok(validateAccrual(good, "2026-10-31") !== null, "a closed month refuses an accrual");
ok(validateAccrual(good, "2026-09-30") === null, "an open month accepts an accrual");

const accrual: Accrual = { id: "a1", name: "Delivery", amount: 100, category: "Transport & logistics", periodMonth: "2026-10", accrualDate: "2026-10-31", reversalDate: "2026-11-01", createdAt: 0 };
const pairs = accrualAsExpenses([accrual]) as Expense[];
ok(pairs.length === 2 && pairs[0].amount === 100 && pairs[1].amount === -100 && pairs[0].startDate === "2026-10-31" && pairs[1].startDate === "2026-11-01", "an accrual is a cost on its last day and an equal reversal on the first day of the next month");
ok(pairs.every((p) => p.isRecurring === false), "neither is a recurring schedule, so neither is ever treated as a regular payment");

// The cost is counted once across the two months: the accrual and reversal net to zero in November, and the real bill lands there.
const oct = expenseTotalsForMonth(pairs, "2026-10").expenseTotal;
const nov = expenseTotalsForMonth(pairs, "2026-11").expenseTotal;
ok(oct === 100 && nov === -100, "the accrual adds the cost to its month and the reversal takes it back the next");
const realBill: Expense = { ...({} as Expense), id: "bill", name: "Delivery invoice", amount: 100, category: "Transport & logistics", kind: "expense", isRecurring: false, recurrence: "none", startDate: "2026-11-05" } as Expense;
ok(oct + expenseTotalsForMonth([...pairs, realBill], "2026-11").expenseTotal === 100, "the real bill arriving next month does not double the cost: the two months together carry it once");

// Not cash: the cash paid for expenses is read from the expense records only, never from accruals.
ok(read("lib/calculations.ts").includes("expenseCashTotalForMonth(expenses, month)") && read("lib/calculations.ts").includes("expenseTotalsForMonth(accrualExpenses.length ? [...expenses, ...accrualExpenses] : expenses, month)"), "cash paid for expenses reads the expense records only; accruals join the monthly total alone");
ok(accruedLiabilityAsOf([accrual], "2026-10-15") === 0 && accruedLiabilityAsOf([accrual], "2026-10-31") === 100 && accruedLiabilityAsOf([accrual], "2026-11-01") === 0, "an accrued liability exists from its day until it reverses, then it is gone");
ok(read("lib/calculations.ts").includes("accruedLiabilities") && read("lib/calculations.ts").includes("const totalLiabilities = loansPayable + accountsPayable + salesTaxPayable + customerDeposits + accruedLiabilities;"), "the balance sheet counts accrued costs as a liability");

// The books balance: an accrual raises liabilities and lowers equity by the same amount, and its reversal undoes both. Checked through the
// same functions the app calls, with the argument list the app passes.
import { computeBalanceSheet } from "../lib/calculations";
const cap = { netCapitalIn: 1000, capitalIn: 1000, drawings: 0 } as any;
const runBs = (accruals: Accrual[], asOf: string) => {
  const args = [[], [], [], [], [], [], 0, 0, [], [], [], [], [], [], [], [], [], [], [], accruals] as const;
  const pnl = computeMonthlyPnL(args[0] as any, args[1] as any, args[2] as any, args[3] as any, args[4] as any, args[5] as any, args[6], args[7], args[8] as any, args[9] as any, args[10] as any, args[11] as any, args[12] as any, args[13] as any, args[14] as any, args[15] as any, args[16] as any, args[17] as any, args[18] as any, args[19] as any);
  return computeBalanceSheet(pnl, 0, [], cap, asOf, [], 0, 0, [], 0, { costBasis: 0, marketValue: 0 }, 0, 0, 0, accruedLiabilityAsOf(accruals, asOf)) as any;
};
const base = runBs([], "2026-10-31");
const withAcc = runBs([accrual], "2026-10-31");
const reversed = runBs([accrual], "2026-11-01");
ok(withAcc.totalLiabilities - base.totalLiabilities === 100 && base.totalEquity - withAcc.totalEquity === 100, "an accrual raises liabilities by the cost and lowers equity by the same amount, so the books still balance");
ok(reversed.totalLiabilities === base.totalLiabilities && reversed.totalEquity === base.totalEquity, "the reversal undoes both sides: after it, the books are back where they were, with no bill recorded");
ok(withAcc.accruedLiabilities === 100 && reversed.accruedLiabilities === 0, "the accrued liability is shown while it is owed, and gone after it reverses");

// The writes and their guards.
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('requirePermission("manage:expenses");') && ctx.includes("addAccrual: async") && ctx.includes("deleteAccrual: async"), "accruals are written with the expense permission");
ok(ctx.includes("validateAccrual({ name: input.name") && ctx.includes("isPeriodClosed(a.accrualDate, settings.booksClosedThrough)"), "adding or removing an accrual respects the closed months");
ok(read("lib/periodGuards.ts").includes("addAccrual: (args)") && read("lib/periodGuards.ts").includes("deleteAccrual: (args, s)"), "the closed-period guard covers both the month and its reversal");
const rules = read("firestore.rules");
ok(/match \/accruals\/\{docId\} \{[\s\S]*?allow update: if false;/.test(rules), "the security rules: accruals can be added and removed, never edited");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
