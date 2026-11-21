// Empirical check that reclaimable input tax on EXPENSES keeps the books
// consistent. Expense.taxAmount is added on top of `amount` (see the expense
// form), so the cash paid — and the amount owed on an unpaid bill — is
// amount + tax. Before this was fixed only `amount` was counted, cash was
// overstated by the tax, and the balance sheet came out "Out of balance" by
// exactly that amount for any business that flagged an expense as carrying
// reclaimable tax (rent, utilities, repairs...).
//
// Every scenario asserts the accounting identity (assets = liabilities +
// equity) plus the specific figure that used to be wrong.
//
// Run: npx tsx scripts/verify-expense-input-tax.ts

import * as C from "../lib/calculations";
import type { BillPayment, Expense } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const now = new Date();
const today = now.toISOString().slice(0, 10);
const iso = (monthsAgo: number, day: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day)).toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

function exp(over: Partial<Expense> & { id: string; amount: number }): Expense {
  return {
    name: over.id, category: "Utilities", kind: "expense", isRecurring: false, recurrence: "none",
    startDate: iso(0, 2), createdAt: 1, ...over,
  } as Expense;
}

function books(expenses: Expense[], billPayments: BillPayment[] = []) {
  // A stock purchase and a sale so the scenario also carries stock + sales tax.
  const products: any[] = [{ id: "p1", name: "X", sku: "X", category: "c", type: "product", active: true, createdAt: 1 }];
  const purchases: any[] = [{ id: "pu1", productId: "p1", qty: 100, unitCost: 100, date: iso(2, 3), taxAmount: 1800, paymentMethod: "cash", createdAt: 1 }];
  const sales: any[] = [{ id: "s1", productId: "p1", qty: 50, unitPrice: 200, date: iso(2, 5), taxAmount: 1800, paymentMethod: "cash", createdAt: 1 }];
  const capital: any[] = [{ id: "c1", kind: "investment", amount: 100000, date: iso(2, 1), createdAt: 1 }];
  const ledgers = C.computeAllLedgers(products, purchases, sales, [], []);
  const eco = C.computeSaleEconomics(sales, ledgers, [], [], []);
  const pnl = C.computeMonthlyPnL(sales, eco, expenses, purchases, [], capital, 0, 0, [], [], [], [], billPayments);
  const bills = C.computeBillsPayable(expenses, billPayments, today);
  const bs = C.computeBalanceSheet(
    pnl, C.currentInventoryValue(ledgers), [], C.computeCapitalSummary(capital, pnl), today, [], 0, bills.totalOutstanding, []
  );
  return { pnl, bills, bs, month: pnl.find((m) => m.month === thisMonth)! };
}

// 1. One-off paid expense with tax: cash is the gross, P&L is the net.
{
  const r = books([exp({ id: "power", amount: 5000, taxAmount: 900 })]);
  assert(near(r.month.expenseCash, 5900), `paid expense: cash out is amount + tax (5900), got ${r.month.expenseCash}`);
  assert(near(r.month.operatingExpenses, 5000), `paid expense: P&L expense stays the net amount (5000), got ${r.month.operatingExpenses}`);
  assert(r.bs.balances, "paid expense with reclaimable tax: balance sheet balances");
}

// 2. Recurring taxed expense across several active months.
{
  const r = books([exp({ id: "net", amount: 6000, taxAmount: 1080, isRecurring: true, recurrence: "monthly", startDate: iso(2, 1) })]);
  assert(near(r.month.expenseCash, 7080), `recurring: monthly cash out is amount + tax (7080), got ${r.month.expenseCash}`);
  assert(r.bs.balances, "recurring taxed expense over 3 months: balance sheet balances");
}

// 3. Unpaid bill: owed gross; part-payment; full settlement.
{
  const bill = exp({ id: "roof", amount: 60000, taxAmount: 10800, paymentStatus: "unpaid", payee: "Silva Roofing", dueDate: iso(0, 28) });
  let r = books([bill]);
  assert(r.bills.lines.length === 1 && near(r.bills.lines[0].amountDue, 70800), `unpaid bill: amount due is gross 70800, got ${r.bills.lines[0]?.amountDue}`);
  assert(near(r.month.expenseCash, 0), "unpaid bill: no cash out until it is paid");
  assert(r.bs.balances, "unpaid taxed bill: balance sheet balances");

  const part: BillPayment = { id: "bp1", expenseId: "roof", amount: 25000, date: iso(0, 12), method: "bank_transfer", createdAt: 1 };
  r = books([bill], [part]);
  assert(near(r.bills.totalOutstanding, 45800), `part-paid bill: 45800 still owed, got ${r.bills.totalOutstanding}`);
  assert(r.bs.balances, "part-paid taxed bill: balance sheet balances");

  const rest: BillPayment = { id: "bp2", expenseId: "roof", amount: 45800, date: iso(0, 20), method: "bank_transfer", createdAt: 1 };
  r = books([bill], [part, rest]);
  assert(r.bills.lines.length === 0 && near(r.bills.totalOutstanding, 0), "fully settled bill: nothing outstanding");
  assert(r.bs.balances, "fully settled taxed bill: balance sheet balances");
}

// 4. Regression guard: businesses NOT using reclaimable expense tax see no change at all.
{
  const r = books([exp({ id: "rent", amount: 150000 }), exp({ id: "wages", amount: 210000, isRecurring: true, recurrence: "monthly", startDate: iso(2, 1) })]);
  assert(near(r.month.expenseCash, 360000), `no-tax expenses: cash is exactly the amounts (360000), got ${r.month.expenseCash}`);
  assert(r.bs.balances, "no-tax expenses: balance sheet still balances");
}

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
