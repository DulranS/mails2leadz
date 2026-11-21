// Proves the demo business (lib/demoData.ts) is fit to show a customer: every
// figure balances, nothing is oversold, cash never goes negative, and the story
// (overdue invoice, unpaid bill, opening balance) is actually visible.
// Run: npx tsx scripts/verify-demo-data.ts
import { buildDemoData } from "../lib/demoData";
import { localIsoDate } from "../lib/localDate";
import {
  computeAllLedgers, computeBalanceSheet, computeBillsPayable, computeCapitalSummary, computeMonthlyPnL,
  computeOpeningEquity, computePayablesAging, computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import type {
  BillPayment, CapitalEntry, Expense, OpeningBalance, PayablePayment, Product, Purchase,
  ReceivablePayment, ReceivableWriteOff, Sale,
} from "../lib/types";

let failed = false;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); failed = true; } else console.log("OK:", m); };

function build(todayISO: string) {
  const demo = buildDemoData(todayISO);
  const get = <T,>(n: string) => (demo.collections[n] ?? []).map((d) => ({ id: d.id, ...d.data }) as unknown as T);
  return {
    demo,
    products: get<Product>("products"), purchases: get<Purchase>("purchases"), sales: get<Sale>("sales"),
    expenses: get<Expense>("expenses"), capital: get<CapitalEntry>("capitalEntries"),
    opening: get<OpeningBalance>("openingBalances"),
    rPay: get<ReceivablePayment>("receivablePayments"), pPay: get<PayablePayment>("payablePayments"),
  };
}

// Structural checks hold for ANY "today" (short first-of-month gaps, month ends,
// leap days), because every date in the seed is derived from it.
function structural(todayISO: string) {
  const { demo, products, purchases, sales, rPay, pPay } = build(todayISO);
  const ids = Object.entries(demo.collections).flatMap(([n, docs]) => docs.map((d) => `${n}:${d.id}`));
  assert(new Set(ids).size === ids.length, `${todayISO}: document ids are unique`);
  const dates = [...sales, ...purchases, ...rPay, ...pPay].map((x) => x.date);
  assert(dates.every((d) => d <= todayISO), `${todayISO}: no record is dated in the future`);
  const econ = computeSaleEconomics(sales, computeAllLedgers(products, purchases, sales), []);
  assert(econ.every((e) => !e.oversold), `${todayISO}: nothing is oversold`);
}

// The accounting checks run for the real today only: computeMonthlyPnL caps its
// month range at the actual current month, so a pretend "today" would be judged
// against the wrong calendar.
function accounting(todayISO: string) {
  const { demo, products, purchases, sales, expenses, capital, opening, rPay, pPay } = build(todayISO);
  const rWo: ReceivableWriteOff[] = [], bPay: BillPayment[] = [];
  const ledgers = computeAllLedgers(products, purchases, sales);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, expenses, purchases, [], capital, demo.settings.taxRatePct, 0, [], rPay, pPay, rWo, bPay);
  const ar = computeReceivablesAging(products, sales, econ, rPay, todayISO, rWo, opening);
  const ap = computePayablesAging(products, purchases, pPay, todayISO, opening);
  const bills = computeBillsPayable(expenses, bPay, todayISO);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], computeCapitalSummary(capital, pnl), todayISO, [],
    ar.totalOutstanding, ap.totalOutstanding + bills.totalOutstanding, [], computeOpeningEquity(opening));

  assert(bs.balances, "the demo Balance Sheet balances");
  let running = 0, minCash = Infinity;
  for (const m of pnl) { running += m.netCashFlow; minCash = Math.min(minCash, running); }
  assert(minCash > 0, `cash stays positive every month (lowest ${Math.round(minCash)})`);
  assert(pnl.length >= 3 && pnl.reduce((s, m) => s + m.salesRevenue, 0) > 300000, "three months of real revenue");
  assert(ar.lines.some((l) => l.isOpeningBalance) && ar.lines.some((l) => l.daysOverdue > 0), "receivables show an opening balance and an overdue invoice");
  assert(ap.lines.length >= 2 && bills.lines.length === 1, "payables show an opening balance, a credit purchase and one unpaid bill");
  assert(pnl.slice(-2).every((m) => m.netProfitAfterTax > 0), `the last two months are profitable (a demo should tell a good story): ${pnl.slice(-2).map((m) => Math.round(m.netProfitAfterTax)).join(", ")}`);
}

for (const d of ["2026-03-01", "2026-01-31", "2028-02-29", "2026-12-15"]) structural(d);
const today = localIsoDate(new Date());
structural(today);
// A demo is built on whatever day an admin presses the button, so the books must balance and
// tell a good story on every day of the month — including the 1st, when the current month has
// almost no sales yet. The P&L reads the real clock, so each date is checked with the clock set to it.
function withClock(iso: string, fn: () => void) {
  const RealDate = Date;
  const fixed = new RealDate(`${iso}T12:00:00`).getTime();
  class FakeDate extends RealDate {
    constructor(...args: any[]) { if (args.length === 0) super(fixed); else super(...(args as [any])); }
    static now() { return fixed; }
  }
  (globalThis as any).Date = FakeDate;
  try { fn(); } finally { (globalThis as any).Date = RealDate; }
}
for (const d of [today, "2026-10-01", "2026-10-02", "2026-10-15", "2026-10-28", "2026-10-31", "2026-03-01", "2026-03-31", "2026-02-28", "2028-02-29", "2026-12-01"]) {
  withClock(d, () => accounting(d));
}
if (failed) process.exit(1);
console.log("\nAll demo-data checks passed.");
