// Statement linkage (v291): for a worked month, the three cash figures agree: the journal's Cash account, the balance sheet's cash, and the
// cash flow statement's net change. The same pipeline as scripts/run-backup-reconciliation.ts, on small sets of records you can check by hand.
// Month 1 (November 2026, no loan):
//   Owner puts in 500 (cash). Stock bought for cash: 10 x 10 = 100. Cash sale: 4 x 25 = 100. Credit sale: 2 x 25 = 50, collected in full on 12 Nov.
//   Rent paid in cash 30. Power bill 12 unpaid (a payable, no cash yet). Net cash = 500 - 100 + 100 + 50 - 30 = 520.
// Month 2 (November 2026, with a loan): the same, plus a loan of 1,200 at 12% a year over 12 months, starting 1 Nov.
//   The app puts the first repayment one month after the start date, so November has the loan coming in and no repayment yet.
//   Net cash = 520 + 1,200 = 1,720.
// Cut-off: the future repayments (December onward) must not appear as actual cash in the journal as of 30 November, or in the cash flow statement.
// The monthly P&L is cut at the current month (calculations.ts rangeEnd), so no month after today can appear in it.
// Run: npx tsx scripts/verify-statement-linkage.ts
import {
  computeAllLedgers, computeBalanceSheet, computeBillsPayable, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import { journalTotals } from "../lib/journal";
import { journalFromRecords } from "../lib/journalFromRecords";
import { mappingEntries, reconcile } from "../lib/journalMapping";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const TODAY = "2026-11-30";
const r2 = (n: number) => Math.round(n * 100) / 100;

const products: any[] = [{ id: "p1", name: "Mug", defaultCostPrice: 10, defaultSalePrice: 25 }];
const purchases: any[] = [{ id: "pu1", productId: "p1", qty: 10, unitCost: 10, date: "2026-11-03", paymentMethod: "cash" }];
const sales: any[] = [
  { id: "s1", productId: "p1", qty: 4, unitPrice: 25, date: "2026-11-05", paymentMethod: "cash" },
  { id: "s2", productId: "p1", qty: 2, unitPrice: 25, date: "2026-11-06", paymentMethod: "credit" },
];
const receivablePayments: any[] = [{ id: "rp1", saleId: "s2", amount: 50, date: "2026-11-12" }];
const expenses: any[] = [
  { id: "e1", name: "Rent", amount: 30, category: "Rent", kind: "expense", startDate: "2026-11-01", paymentStatus: "paid" },
  { id: "e2", name: "Power", amount: 12, category: "Utilities", kind: "expense", startDate: "2026-11-02", paymentStatus: "unpaid" },
];
const capital: any[] = [{ id: "c1", kind: "investment", amount: 500, date: "2026-11-01" }];

function runMonth(loans: any[]) {
  const ledgers = computeAllLedgers(products, purchases, sales);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, expenses, purchases, loans, capital, 0, 0, [], receivablePayments, [], [], [], []);
  const ar = computeReceivablesAging(products, sales, econ, receivablePayments, TODAY, [], []);
  const ap = computePayablesAging(products, purchases, [], TODAY, []);
  const bills = computeBillsPayable(expenses, [], TODAY);
  const inv = currentInventoryValue(ledgers);
  const bs: any = computeBalanceSheet(pnl, inv, loans, computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, ap.totalOutstanding + bills.totalOutstanding, [], 0);
  const built = journalFromRecords({
    sales: sales.map((s) => ({ id: s.id, date: s.date, qty: s.qty, unitPrice: s.unitPrice, paymentMethod: s.paymentMethod, productId: s.productId })),
    expenses: expenses.map((e) => ({ id: e.id, name: e.name, amount: e.amount, category: e.category, kind: e.kind, startDate: e.startDate, paymentStatus: e.paymentStatus })),
    capital: capital.map((x) => ({ id: x.id, kind: x.kind, amount: x.amount, date: x.date, poolOwned: false })),
  });
  const mapped = mappingEntries({
    asOf: TODAY,
    receivablePayments: receivablePayments.map((p) => ({ id: p.id, saleId: p.saleId, amount: p.amount, date: p.date })),
    payablePayments: [],
    purchases: purchases.map((p) => ({ id: p.id, productId: p.productId, qty: p.qty, unitCost: p.unitCost, date: p.date, paymentMethod: p.paymentMethod })),
    sales: sales.map((s) => ({ id: s.id, productId: s.productId, qty: s.qty, date: s.date })),
    saleCostOf: (saleId: string) => econ.find((e: any) => e.saleId === saleId)?.cogs,
    unitCostOf: (id: string) => ledgers.get(id)?.wac || 10,
    loans,
    fixedAssets: [],
  });
  const entries = [...built.entries, ...mapped.entries];
  return { pnl, bs, entries, errors: [...built.errors, ...mapped.errors], totals: journalTotals(entries), rows: reconcile(entries, bs, bs.fixedAssetsNetBookValue ?? 0) };
}

// cumulative: the cash held on 30 November (journal and balance sheet). monthNet: the November net change (cash flow statement).
function checkMonth(label: string, cumulative: number, monthNet: number, m: ReturnType<typeof runMonth>) {
  ok(m.totals.balanced === true, `${label}: the journal balances (debits equal credits)`);
  ok(m.errors.length === 0, `${label}: no records were refused when mapping to the journal`);
  const cash = m.rows.find((r) => r.account === "Cash");
  ok(cash !== undefined, `${label}: the reconciliation has a Cash line`);
  ok(Math.abs((cash?.journal ?? NaN) - cumulative) < 0.01, `${label}: journal Cash account holds ${cash?.journal}, expected ${r2(cumulative)}`);
  ok(Math.abs((cash?.sheet ?? NaN) - cumulative) < 0.01, `${label}: balance sheet cash is ${cash?.sheet}, expected ${r2(cumulative)}`);
  const novPnl: any = m.pnl.find((x: any) => x.month === "2026-11");
  ok(Math.abs((novPnl?.netCashFlow ?? NaN) - monthNet) < 0.01, `${label}: cash flow statement November net change is ${novPnl?.netCashFlow}, expected ${r2(monthNet)}`);
  const off = m.rows.filter((r) => !r.reconciles);
  ok(off.length === 0, `${label}: lines that do not reconcile: ${off.map((r) => `${r.account} (${r.difference})`).join(", ")}`);
  ok(m.bs.balances === true, `${label}: the balance sheet balances (assets equal liabilities and equity)`);
}

// Month 1: no loan. Net cash = 500 - 100 + 100 + 50 - 30 = 520.
checkMonth("no loan", 520, 520, runMonth([]));

// Month 2: a 1,200 loan at 12% over 12 months, starting 1 November. November: the loan in, no repayment yet.
const loan: any = { id: "L1", name: "Working capital loan", principal: 1200, annualInterestRatePct: 12, termMonths: 12, startDate: "2026-11-01", active: true, createdAt: 0 };
const withLoan = runMonth([loan]);
checkMonth("with loan, November", 520 + 1200, 520 + 1200, withLoan);

// Month 3: the same loan drawn on 1 October, so its first repayment falls in November, inside a closed month. Its payment is the annuity
// figure worked out here; the first month's interest is 1% of 1,200 (12% a year, monthly); the rest of the payment reduces the loan.
const payment = 1200 * 0.01 / (1 - Math.pow(1.01, -12));
const interestNov = 1200 * 0.01;
const principalNov = payment - interestNov;
const octLoan: any = { ...loan, startDate: "2026-10-01" };
const repaid = runMonth([octLoan]);
checkMonth("loan drawn in October", 1200 + 520 - payment, 520 - payment, repaid);
const novRow: any = repaid.pnl.find((x: any) => x.month === "2026-11");
ok(Math.abs((novRow?.interestExpense ?? NaN) - interestNov) < 0.05, `November interest is ${novRow?.interestExpense}, expected about ${r2(interestNov)}`);
ok(Math.abs((novRow?.principalRepayment ?? NaN) - principalNov) < 0.05, `November principal repaid is ${novRow?.principalRepayment}, expected about ${r2(principalNov)}`);
const loanLine = repaid.rows.find((r) => r.account === "Loans payable");
ok(loanLine !== undefined && loanLine.reconciles, `loans on the balance sheet (${loanLine?.sheet}) match the journal (${loanLine?.journal})`);

// Cut-off: nothing dated after 30 November is in the journal as of 30 November.
const laterCash = withLoan.entries
  .filter((e: any) => String(e.date) > TODAY)
  .reduce((s: number, e: any) => s + e.lines.filter((l: any) => l.account === "Cash").reduce((t: number, l: any) => t + (l.debit ?? 0) - (l.credit ?? 0), 0), 0);
ok(Math.abs(laterCash) < 0.01, `the journal as of ${TODAY} holds ${r2(laterCash)} of cash dated after it; future repayments must not be counted yet`);

// Cut-off: the cash flow statement has no month after the current one (the P&L is cut at today's month).
const now = new Date();
const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
ok(withLoan.pnl.every((x: any) => String(x.month) <= currentKey), `the cash flow statement shows a month after ${currentKey}, so it counts cash that has not happened`);

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
