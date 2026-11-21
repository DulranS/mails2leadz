// Randomized stress test of the accounting identity. The hand-built verify scripts check cases someone
// thought of; this one throws hundreds of seeded random-but-valid businesses at the REAL calculation
// code (credit and cash sales and purchases, partial collections, write-offs, unpaid bills paid in
// parts, investments and withdrawals, a tax rate, an owner draw) and requires, every time:
//   1. the Balance Sheet balances,
//   2. receivables / payables / unpaid bills outstanding equal what the raw records say,
//   3. revenue on the P&L equals the sum of the sales.
// It is deterministic (fixed seeds), so a failure names the seed and can be replayed.
//
// Run: npx tsx scripts/verify-books-fuzz.ts

import {
  computeAllLedgers, computeBalanceSheet, computeBillsPayable, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import type {
  BillPayment, CapitalEntry, Expense, PayablePayment, Product, Purchase, ReceivablePayment, ReceivableWriteOff, Sale,
} from "../lib/types";

// Small deterministic PRNG (mulberry32) so a failing seed can be replayed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const TODAY = iso(NOW);
const daysAgo = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
const round2 = (n: number) => Math.round(n * 100) / 100;

let failures = 0;
const RUNS = 400;

for (let seed = 1; seed <= RUNS; seed++) {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(xs: T[]) => xs[int(0, xs.length - 1)];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  const products = [0, 1, 2].map((i) => ({ id: `g${i}`, name: `Good ${i}`, type: "product", active: true, createdAt: 0 })) as unknown as Product[];

  // Purchases first (oldest), so sales never exceed stock (oversold stock is a separate, flagged case).
  const purchases: Purchase[] = [];
  const stock = new Map<string, number>();
  for (const p of products) {
    for (let k = int(1, 3); k > 0; k--) {
      const qty = int(5, 60);
      const credit = r() < 0.4;
      const date = daysAgo(int(120, 200));
      purchases.push({
        id: id("pu"), productId: p.id, qty, unitCost: int(50, 900), date, createdAt: ++n,
        ...(credit ? { paymentMethod: "credit", dueDate: daysAgo(int(60, 110)), supplier: pick(["Acme", "Beta", "Gamma"]) } : { paymentMethod: pick(["cash", "bank_transfer"]) }),
      } as unknown as Purchase);
      stock.set(p.id, (stock.get(p.id) ?? 0) + qty);
    }
  }

  const sales: Sale[] = [];
  for (let k = int(5, 40); k > 0; k--) {
    const p = pick(products);
    const have = stock.get(p.id) ?? 0;
    if (have < 1) continue;
    const qty = int(1, Math.min(have, 8));
    stock.set(p.id, have - qty);
    const credit = r() < 0.45;
    const date = daysAgo(int(0, 110));
    sales.push({
      id: id("sa"), productId: p.id, qty, unitPrice: int(100, 2500), date, createdAt: ++n,
      ...(credit
        ? { paymentMethod: "credit", creditTermDays: 30, dueDate: daysAgo(int(-30, 80)), customer: pick(["Kamal", "Nimal", "Sunil", "Ayesha"]) }
        : { paymentMethod: pick(["cash", "card", "bank_transfer"]) }),
    } as unknown as Sale);
  }

  // Collections / write-offs never exceed what's owed on that sale.
  const receivablePayments: ReceivablePayment[] = [];
  const receivableWriteOffs: ReceivableWriteOff[] = [];
  for (const s of sales) {
    if (s.paymentMethod !== "credit") continue;
    let owed = round2(s.qty * s.unitPrice);
    if (r() < 0.6) {
      const amt = round2(owed * (0.2 + r() * 0.8));
      receivablePayments.push({ id: id("rp"), saleId: s.id, amount: amt, date: s.date, method: "cash", createdAt: ++n });
      owed = round2(owed - amt);
    }
    if (owed > 0 && r() < 0.2) {
      const amt = round2(owed * (0.3 + r() * 0.7));
      receivableWriteOffs.push({ id: id("wo"), saleId: s.id, amount: amt, date: TODAY, createdAt: ++n });
    }
  }

  const payablePayments: PayablePayment[] = [];
  for (const p of purchases) {
    if ((p as unknown as { paymentMethod?: string }).paymentMethod !== "credit") continue;
    if (r() < 0.6) {
      const total = round2(p.qty * p.unitCost);
      payablePayments.push({ id: id("pp"), purchaseId: p.id, amount: round2(total * (0.2 + r() * 0.8)), date: TODAY, method: "bank_transfer", createdAt: ++n });
    }
  }

  const expenses: Expense[] = [];
  const billPayments: BillPayment[] = [];
  for (let k = int(0, 8); k > 0; k--) {
    const unpaid = r() < 0.4;
    const amount = int(200, 5000);
    const e = {
      id: id("ex"), name: `Bill ${k}`, amount, category: "Utilities", kind: "expense", isRecurring: false, recurrence: "none",
      startDate: daysAgo(int(0, 100)), ...(unpaid ? { paymentStatus: "unpaid", payee: "Vendor" } : {}),
    } as unknown as Expense;
    expenses.push(e);
    if (unpaid && r() < 0.5) billPayments.push({ id: id("bp"), expenseId: e.id, amount: round2(amount * (0.2 + r() * 0.7)), date: TODAY, method: "cash", createdAt: ++n });
  }
  // a recurring cost too
  if (r() < 0.6) {
    expenses.push({ id: id("ex"), name: "Rent", amount: int(1000, 8000), category: "Rent", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: daysAgo(150) } as unknown as Expense);
  }

  const capital: CapitalEntry[] = [{ id: id("cap"), kind: "investment", amount: int(50_000, 400_000), date: daysAgo(210), createdAt: ++n }];
  if (r() < 0.5) capital.push({ id: id("cap"), kind: "withdrawal", amount: int(1000, 20_000), date: daysAgo(int(5, 90)), createdAt: ++n });

  const taxRate = pick([0, 0, 15, 24]);
  const ownerDraw = pick([0, 0, 5000]);

  const label = `seed ${seed}`;
  try {
    const ledgers = computeAllLedgers(products, purchases, sales);
    const econ = computeSaleEconomics(sales, ledgers, []);
    const pnl = computeMonthlyPnL(sales, econ, expenses, purchases, [], capital, taxRate, ownerDraw, [], receivablePayments, payablePayments, receivableWriteOffs, billPayments, []);
    const ar = computeReceivablesAging(products, sales, econ, receivablePayments, TODAY, receivableWriteOffs, []);
    const ap = computePayablesAging(products, purchases, payablePayments, TODAY, []);
    // Unpaid one-off bills are a liability too; the app adds them to accounts payable (contexts/DataContext.tsx).
    const bills = computeBillsPayable(expenses, billPayments, TODAY);
    const inv = currentInventoryValue(ledgers);
    const bs = computeBalanceSheet(pnl, inv, [], computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, ap.totalOutstanding + bills.totalOutstanding, [], 0);

    const expectAr = round2(
      sales.filter((s) => s.paymentMethod === "credit").reduce((t, s) => t + s.qty * s.unitPrice, 0) -
        receivablePayments.reduce((t, p) => t + p.amount, 0) -
        receivableWriteOffs.reduce((t, w) => t + w.amount, 0)
    );
    const expectAp = round2(
      purchases.filter((p) => (p as unknown as { paymentMethod?: string }).paymentMethod === "credit").reduce((t, p) => t + p.qty * p.unitCost, 0) -
        payablePayments.reduce((t, p) => t + p.amount, 0)
    );
    const expectBills = round2(
      expenses.filter((e) => (e as unknown as { paymentStatus?: string }).paymentStatus === "unpaid").reduce((t, e) => t + e.amount, 0) -
        billPayments.reduce((t, p) => t + p.amount, 0)
    );
    const expectRev = round2(sales.reduce((t, s) => t + s.qty * s.unitPrice, 0));
    const gotRev = round2(pnl.reduce((t, m) => t + m.salesRevenue, 0));

    const problems: string[] = [];
    if (!bs.balances) problems.push(`Balance Sheet does not balance (assets ${bs.totalAssets}, L+E ${bs.totalLiabilities + bs.totalEquity})`);
    if (Math.abs(ar.totalOutstanding - expectAr) > 0.05) problems.push(`receivables ${ar.totalOutstanding} != expected ${expectAr}`);
    if (Math.abs(ap.totalOutstanding - expectAp) > 0.05) problems.push(`payables ${ap.totalOutstanding} != expected ${expectAp}`);
    if (Math.abs(bills.totalOutstanding - expectBills) > 0.05) problems.push(`unpaid bills ${bills.totalOutstanding} != expected ${expectBills}`);
    if (Math.abs(gotRev - expectRev) > 0.05) problems.push(`P&L revenue ${gotRev} != sum of sales ${expectRev}`);
    if (problems.length) {
      failures++;
      if (failures <= 8) console.error(`FAIL ${label} (tax ${taxRate}%, draw ${ownerDraw}): ${problems.join("; ")}`);
    }
  } catch (e) {
    failures++;
    if (failures <= 8) console.error(`FAIL ${label}: threw ${(e as Error).message}`);
  }
}

if (failures) {
  console.error(`\n${failures} of ${RUNS} random businesses failed`);
  process.exit(1);
}
console.log(`OK: ${RUNS} random businesses — Balance Sheet balanced, receivables/payables/bills tied to the records, revenue matched sales.`);
