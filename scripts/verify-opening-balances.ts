// Empirical check for opening balances (OpeningBalance in lib/types.ts): money
// customers already owed, and the business already owed suppliers, on the day
// an existing business moved onto the app.
//
// The claims being proved, each against the REAL calculation code (nothing
// here touches Firestore):
//   1. Entering opening balances books NO revenue and NO cost in any month.
//   2. The Balance Sheet balances at every step — on entry, after a partial
//      collection, after a write-off, after a supplier payment, after a normal
//      sale on the opening stock, and after an opening balance is deleted
//      together with its payments (what DataContext.deleteOpeningBalance does).
//   3. Collecting an opening receivable moves cash by exactly that amount and
//      leaves equity alone; writing one off is a real bad-debt loss.
//   4. The aging report shows the lines, flagged isOpeningBalance, and the
//      same numbers reach the AI reminder generators.
//
// Run: npx tsx scripts/verify-opening-balances.ts

import {
  computeAllLedgers,
  computeBalanceSheet,
  computeCapitalSummary,
  computeMonthlyPnL,
  computeOpeningEquity,
  computePayablesAging,
  computeReceivablesAging,
  computeSaleEconomics,
  currentInventoryValue,
} from "../lib/calculations";
import { generateSmartReminders } from "../lib/aiSmartReminders";
import { generateAgingReport } from "../lib/paymentAging";
import type {
  CapitalEntry,
  OpeningBalance,
  PayablePayment,
  Product,
  Purchase,
  ReceivablePayment,
  ReceivableWriteOff,
  Sale,
} from "../lib/types";

let failed = false;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed = true;
  } else console.log("OK:", msg);
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

// Dates relative to today so the "never past the current month" cap in
// computeMonthlyPnL can't interfere: start = first of the month, two months ago.
const now = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
const START = iso(start);
const plus = (days: number) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
const TODAY = iso(now);
const MID = plus(20); // still before today, after START

const product: Product = { id: "p1", name: "Widget", sku: "W", category: "x", type: "product", active: true, createdAt: 0 } as Product;

interface State {
  sales: Sale[];
  purchases: Purchase[];
  capital: CapitalEntry[];
  opening: OpeningBalance[];
  rPay: ReceivablePayment[];
  rWo: ReceivableWriteOff[];
  pPay: PayablePayment[];
}

function books(s: State) {
  const ledgers = computeAllLedgers([product], s.purchases, s.sales);
  const econ = computeSaleEconomics(s.sales, ledgers, []);
  const pnl = computeMonthlyPnL(s.sales, econ, [], s.purchases, [], s.capital, 20, 0, [], s.rPay, s.pPay, s.rWo, []);
  const ar = computeReceivablesAging([product], s.sales, econ, s.rPay, TODAY, s.rWo, s.opening);
  const ap = computePayablesAging([product], s.purchases, s.pPay, TODAY, s.opening);
  const bs = computeBalanceSheet(
    pnl,
    currentInventoryValue(ledgers),
    [],
    computeCapitalSummary(s.capital, pnl),
    TODAY,
    [],
    ar.totalOutstanding,
    ap.totalOutstanding,
    [],
    computeOpeningEquity(s.opening)
  );
  return { pnl, ar, ap, bs };
}

// A business already running: R100,000 cash + 30 units of stock costing 1,000
// each, brought in as capital on day one (the USER-MANUAL method).
const base: State = {
  sales: [],
  purchases: [{ id: "buy1", productId: "p1", qty: 30, unitCost: 1000, date: START, createdAt: 0 } as Purchase],
  capital: [{ id: "cap1", kind: "investment", amount: 130000, date: START, createdAt: 0 } as CapitalEntry],
  opening: [],
  rPay: [],
  rWo: [],
  pPay: [],
};

// --- Before any opening balance (the documented cash + stock method) --------
{
  const { bs } = books(base);
  assert(bs.balances, "baseline (cash + stock only) balances");
  assert(near(bs.cash, 100000) && near(bs.inventoryValue, 30000), "baseline: cash 100,000, stock 30,000");
}

// --- 1 & 2. Enter one opening receivable and one opening payable ------------
const kamal: OpeningBalance = { id: "ob-kamal", kind: "receivable", party: "Kamal", contact: "0771234567", amount: 25000, date: START, dueDate: plus(30), note: "INV-0042", createdAt: 1 };
const abc: OpeningBalance = { id: "ob-abc", kind: "payable", party: "ABC Traders", amount: 12000, date: START, dueDate: plus(15), createdAt: 2 };
let st: State = { ...base, opening: [kamal, abc] };
{
  const { pnl, ar, ap, bs } = books(st);
  assert(bs.balances, "with opening balances entered, the Balance Sheet balances");
  assert(near(bs.accountsReceivable, 25000) && near(bs.accountsPayable, 12000), "AR 25,000 and AP 12,000 show on the Balance Sheet");
  assert(near(bs.cash, 100000), "cash is untouched by entering them (nothing was collected or paid)");
  assert(near(bs.ownersCapital, 130000 + 25000 - 12000), "owner's capital carries the net opening balances (130,000 + 25,000 - 12,000 = 143,000)");
  assert(pnl.every((m) => near(m.salesRevenue, 0) && near(m.netProfitAfterTax, 0)), "no month books any revenue or profit — history is not distorted");
  assert(ar.lines.length === 1 && ar.lines[0].customer === "Kamal" && ar.lines[0].isOpeningBalance === true, "receivables aging lists Kamal, flagged as an opening balance");
  assert(ap.lines.length === 1 && ap.lines[0].supplier === "ABC Traders" && ap.lines[0].isOpeningBalance === true, "payables aging lists ABC Traders, flagged as an opening balance");
  assert(ar.lines[0].daysOverdue < 0 || ar.lines[0].bucket !== undefined, "aging computes a due-date bucket");
  assert(ar.lines[0].productName.includes("INV-0042"), "the paper invoice number is kept and shown");
}

// --- 3a. Partial collection ---------------------------------------------------
st = { ...st, rPay: [{ id: "rp1", saleId: "ob-kamal", amount: 10000, date: MID, method: "bank_transfer", createdAt: 3 }] };
{
  const { pnl, ar, bs } = books(st);
  assert(bs.balances, "after collecting 10,000 the Balance Sheet still balances");
  assert(near(bs.cash, 110000) && near(bs.accountsReceivable, 15000), "cash +10,000, receivable -10,000");
  assert(near(bs.ownersCapital, 143000), "collecting does not change owner's capital");
  assert(pnl.every((m) => near(m.salesRevenue, 0)), "a collection is cash, not revenue");
  assert(near(ar.totalOutstanding, 15000) && near(ar.lines[0].amountPaid, 10000), "aging shows 15,000 still outstanding");
}

// --- 3b. Write off the rest as bad debt ---------------------------------------
st = { ...st, rWo: [{ id: "wo1", saleId: "ob-kamal", amount: 5000, date: MID, createdAt: 4 }] };
{
  const { pnl, ar, bs } = books(st);
  assert(bs.balances, "after a 5,000 write-off the Balance Sheet still balances");
  assert(near(bs.accountsReceivable, 10000), "receivable falls by the write-off");
  assert(near(bs.retainedEarnings, -5000), "the write-off is a real 5,000 bad-debt loss");
  assert(near(pnl.reduce((s, m) => s + m.salesRevenue, 0), 0), "still no revenue booked");
  assert(near(ar.totalOutstanding, 10000), "aging reflects the write-off");
}

// --- 3c. Pay the supplier -------------------------------------------------------
st = { ...st, pPay: [{ id: "pp1", purchaseId: "ob-abc", amount: 12000, date: MID, method: "bank_transfer", createdAt: 5 }] };
{
  const { ap, bs } = books(st);
  assert(bs.balances, "after paying the supplier in full the Balance Sheet still balances");
  assert(near(bs.cash, 98000) && near(bs.accountsPayable, 0), "cash -12,000, payable cleared");
  assert(ap.lines.length === 0, "a fully paid opening payable drops off the aging list");
}

// --- Normal trading on the opening stock still works ----------------------------
st = { ...st, sales: [{ id: "s1", productId: "p1", qty: 5, unitPrice: 1500, date: MID, paymentMethod: "cash", createdAt: 6 } as Sale] };
{
  const { pnl, bs } = books(st);
  assert(bs.balances, "a normal cash sale on the opening stock keeps the books balanced");
  assert(near(pnl.reduce((s, m) => s + m.salesRevenue, 0), 7500), "only the real sale is revenue (7,500)");
}

// --- Deleting an opening balance together with its payments -----------------------
{
  const removed: State = {
    ...st,
    opening: st.opening.filter((o) => o.id !== "ob-kamal"),
    rPay: st.rPay.filter((p) => p.saleId !== "ob-kamal"),
    rWo: st.rWo.filter((w) => w.saleId !== "ob-kamal"),
  };
  const { bs, ar } = books(removed);
  assert(bs.balances, "deleting an opening balance and its payments leaves the books balanced");
  assert(ar.lines.length === 0, "the deleted receivable is gone from aging");
  // The failure mode the cascade exists to prevent: parent gone, payment kept.
  const orphaned: State = { ...st, opening: st.opening.filter((o) => o.id !== "ob-kamal") };
  assert(!books(orphaned).bs.balances, "sanity: leaving the payment behind WOULD unbalance the books (why delete cascades)");
}

// --- 4. The AI reminder / aging-report paths see opening balances ------------------
{
  const overdue: OpeningBalance = { id: "ob-late", kind: "receivable", party: "Nimal", amount: 8000, date: START, dueDate: plus(5), createdAt: 7 };
  const lateOwed: OpeningBalance = { id: "ob-late-p", kind: "payable", party: "Late Supplier", amount: 3000, date: START, dueDate: plus(5), createdAt: 8 };
  const reminders = generateSmartReminders([], [], [], [], [], [], [], [overdue, lateOwed]);
  assert(reminders.some((r) => r.type === "overdue_receivable" && r.entityName === "Nimal"), "an overdue opening receivable produces a reminder");
  assert(reminders.some((r) => r.type === "overdue_payable" && r.entityName === "Late Supplier"), "an overdue opening payable produces a reminder");
  const withoutArg = generateSmartReminders([], [], [], [], [], [], []);
  assert(withoutArg.length === 0, "callers that pass no opening balances behave exactly as before");
  const report = generateAgingReport([], [], [], [], [], TODAY, [], [], [overdue, lateOwed]);
  assert(report.receivables.some((r) => r.customerName === "Nimal" && near(r.balance, 8000)), "the aging-report API includes opening receivables");
}

// --- Existing behaviour is unchanged when no opening balances exist ---------------
{
  const a = books({ ...base }).bs;
  assert(near(computeOpeningEquity([]), 0) && near(a.ownersCapital, 130000), "with none entered, owner's capital is exactly the capital entries");
}

if (failed) process.exit(1);
console.log("\nAll opening-balance checks passed.");
