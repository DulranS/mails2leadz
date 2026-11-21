// Empirical check for the orphaned-child-record bug that cascadeDelete
// (contexts/DataContext.tsx) exists to prevent. Nothing here touches
// Firestore — it feeds computeMonthlyPnL the exact two states the database
// can be in before and after deleting a credit sale, and compares the cash
// numbers it reports.
//
// Run: npx tsx scripts/verify-orphan-cash.ts

import { computeMonthlyPnL, type SaleEconomics } from "../lib/calculations";
import type {
  Sale,
  ReceivablePayment,
  ReceivableWriteOff,
  BillPayment,
  Expense,
  PayablePayment,
  Purchase,
} from "../lib/types";

function econ(saleId: string, revenue: number, cogs: number): SaleEconomics {
  return {
    saleId,
    revenue,
    grossRevenue: revenue,
    refundedAmount: 0,
    discountedAmount: 0,
    returnedQty: 0,
    cogs,
    cogsVariableCost: 0,
    variableCost: 0,
    grossProfit: revenue - cogs,
    contributionMargin: revenue - cogs,
    contributionMarginPerUnit: revenue - cogs,
    oversold: false,
  };
}

// A single credit sale, collected in full the following month.
const sale: Sale = {
  id: "sale1",
  productId: "p1",
  qty: 10,
  unitPrice: 1000,
  date: "2026-01-15",
  paymentMethod: "credit",
  creditTermDays: 30,
  dueDate: "2026-02-14",
  createdAt: 0,
} as Sale;

const collection: ReceivablePayment = {
  id: "rp1",
  saleId: "sale1",
  amount: 10000,
  date: "2026-02-10",
  method: "bank_transfer",
  createdAt: 0,
};

const writeOff: ReceivableWriteOff = {
  id: "wo1",
  saleId: "sale1",
  amount: 500,
  date: "2026-02-20",
  createdAt: 0,
};

// A bill, and a payment made against it.
const bill: Expense = {
  id: "exp1",
  kind: "expense",
  name: "Contractor invoice",
  amount: 4000,
  category: "Subcontractors",
  isRecurring: false,
  startDate: "2026-01-20",
  paymentStatus: "unpaid",
  dueDate: "2026-02-19",
} as Expense;

const billPayment: BillPayment = {
  id: "bp1",
  expenseId: "exp1",
  amount: 4000,
  date: "2026-02-05",
  method: "bank_transfer",
  createdAt: 0,
};

// A credit purchase, and a payment made against it.
const purchase: Purchase = {
  id: "pur1",
  productId: "p1",
  qty: 10,
  unitCost: 400,
  date: "2026-01-10",
  paymentMethod: "credit",
  creditTermDays: 30,
  dueDate: "2026-02-09",
} as Purchase;

const payablePayment: PayablePayment = {
  id: "pp1",
  purchaseId: "pur1",
  amount: 4000,
  date: "2026-02-08",
  method: "bank_transfer",
  createdAt: 0,
};

function feb(
  sales: Sale[],
  economics: SaleEconomics[],
  expenses: Expense[],
  purchases: Purchase[],
  rp: ReceivablePayment[],
  pp: PayablePayment[],
  wo: ReceivableWriteOff[],
  bp: BillPayment[]
) {
  const months = computeMonthlyPnL(
    sales,
    economics,
    expenses,
    purchases,
    [],
    [],
    0,
    0,
    [],
    rp,
    pp,
    wo,
    bp
  );
  const m = months.find((x) => x.month === "2026-02");
  if (!m) throw new Error("no 2026-02 row");
  return m;
}

// An unrelated cash sale that survives all three states. It exists only so
// computeMonthlyPnL's month range still reaches February once the records
// under test are gone — the range is derived from parent records, so a
// state with no parents at all would otherwise report only the current
// month and there'd be nothing to compare.
const anchor: Sale = {
  id: "anchor",
  productId: "p2",
  qty: 1,
  unitPrice: 100,
  date: "2026-01-05",
  paymentMethod: "cash",
  createdAt: 0,
} as Sale;
const anchorEcon = econ("anchor", 100, 0);

const economics = [anchorEcon, econ("sale1", 10000, 4000)];

// State A — everything intact, the correct picture.
const intact = feb(
  [anchor, sale],
  economics,
  [bill],
  [purchase],
  [collection],
  [payablePayment],
  [writeOff],
  [billPayment]
);

// State B — the parents deleted WITHOUT their children, i.e. exactly what
// the database looked like before cascadeDelete existed.
const orphaned = feb(
  [anchor],
  [anchorEcon],
  [],
  [],
  [collection],
  [payablePayment],
  [writeOff],
  [billPayment]
);

// State C — parents deleted WITH their children, i.e. what cascadeDelete
// now guarantees.
const cascaded = feb([anchor], [anchorEcon], [], [], [], [], [], []);

const rows = [
  ["receivableCollections", intact.receivableCollections, orphaned.receivableCollections, cascaded.receivableCollections],
  ["billSettlements", intact.billSettlements, orphaned.billSettlements, cascaded.billSettlements],
  ["payableSettlements", intact.payableSettlements, orphaned.payableSettlements, cascaded.payableSettlements],
  ["badDebtExpense", intact.badDebtExpense, orphaned.badDebtExpense, cascaded.badDebtExpense],
  ["operatingCashFlow", intact.operatingCashFlow, orphaned.operatingCashFlow, cascaded.operatingCashFlow],
];

console.log("February 2026 — records intact vs. parents deleted\n");
console.log(
  ["field", "intact", "orphaned (old)", "cascaded (new)"]
    .map((h, i) => (i === 0 ? h.padEnd(22) : h.padStart(16)))
    .join("")
);
for (const [label, a, b, c] of rows) {
  console.log(
    String(label).padEnd(22) +
      String(a).padStart(16) +
      String(b).padStart(16) +
      String(c).padStart(16)
  );
}

const phantom =
  orphaned.receivableCollections +
  orphaned.billSettlements +
  orphaned.payableSettlements +
  orphaned.badDebtExpense;

console.log(
  `\nCash/expense movement still reported for records whose parents no longer exist: ${phantom}`
);
console.log(
  cascaded.receivableCollections === 0 &&
    cascaded.billSettlements === 0 &&
    cascaded.payableSettlements === 0 &&
    cascaded.badDebtExpense === 0
    ? "PASS — cascading the children leaves nothing behind."
    : "FAIL — something survived the cascade."
);
