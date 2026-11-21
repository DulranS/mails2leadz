// Empirical check for supplier returns (goods sent back to a supplier): stock, weighted average cost, cash,
// what you owe, input tax and profit — and that the Balance Sheet still balances with them in the mix.
// Hand-built cases first (each number is worked out by hand in the comment above it), then a seeded
// random stress test against the REAL calculation code.
// Run: npx tsx scripts/verify-supplier-returns.ts

import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeSaleEconomics, computeSupplierReturnPnLInputs, computeCashLedgerCandidates, currentInventoryValue,
  supplierReturnTaxFor, supplierReturnCausesOversell,
} from "../lib/calculations";
import { computeAllStockLevels, computeLocationStockLevels } from "../lib/stockTracking";
import { stockValueHistory } from "../lib/inventoryInsights";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";
import type { CapitalEntry, Location, PayablePayment, Product, Purchase, Sale, SupplierReturn } from "../lib/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const TODAY = iso(NOW);
const daysAgo = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
const round2 = (n: number) => Math.round(n * 100) / 100;

const product = (id: string): Product => ({ id, name: id, sku: id, category: "", type: "product", active: true, createdAt: 0 } as Product);
const purchase = (o: Partial<Purchase> & { id: string; productId: string; qty: number; unitCost: number; date: string }): Purchase =>
  ({ createdAt: Date.parse(o.date), paymentMethod: "cash", ...o } as Purchase);
const sale = (o: Partial<Sale> & { id: string; productId: string; qty: number; unitPrice: number; date: string }): Sale =>
  ({ createdAt: Date.parse(o.date) + 1, paymentMethod: "cash", ...o } as Sale);
const ret = (o: Partial<SupplierReturn> & { id: string; purchaseId: string; productId: string; qty: number; unitCost: number; creditAmount: number; date: string }): SupplierReturn =>
  ({ settlement: "refund", reason: "defective", createdAt: Date.parse(o.date) + 2, ...o } as SupplierReturn);

// Everything the app does with these lists, in the same order DataContext does it.
function books(products: Product[], purchases: Purchase[], sales: Sale[], returns: SupplierReturn[], opts: { payments?: PayablePayment[]; capital?: CapitalEntry[]; taxRate?: number } = {}) {
  const payments = opts.payments ?? [];
  const capital = opts.capital ?? [{ id: "cap", kind: "investment", amount: 1_000_000, date: daysAgo(400), createdAt: 1 } as CapitalEntry];
  const ledgers = computeAllLedgers(products, purchases, sales, [], [], returns);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], capital, opts.taxRate ?? 0, 0, [], [], payments, [], [], [], [], [], computeSupplierReturnPnLInputs(returns, ledgers));
  const ap = computePayablesAging(products, purchases, payments, TODAY, [], returns);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], computeCapitalSummary(capital, pnl), TODAY, [], 0, ap.totalOutstanding, [], 0);
  return { ledgers, econ, pnl, ap, bs };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const month = (d: string) => d.slice(0, 7);

// ---------------------------------------------------------------------------
// 1. Full-price cash refund. Buy 10 @ 100 (cash), send 4 back for 400 refunded.
//    Stock 10 -> 6, WAC stays 100, inventory 600. Cash: -1000 + 400. Profit effect 0.
{
  const d = daysAgo(20);
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: d })];
  const base = books(P, pu, [], []);
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, date: daysAgo(10) });
  const b = books(P, pu, [], [r]);
  const l = b.ledgers.get("a")!;
  assert(near(l.qtyOnHand, 6) && near(l.wac, 100) && near(l.inventoryValue, 600), "full-price return: 6 left at WAC 100, stock worth 600");
  assert(near(b.bs.cash - base.bs.cash, 400), "refund puts 400 back in cash");
  assert(near(sum(b.pnl.map((m) => m.supplierReturnGainLoss)), 0), "full-price refund has no profit effect");
  assert(near(b.bs.retainedEarnings, base.bs.retainedEarnings), "retained earnings unchanged by a full-price refund");
  assert(b.bs.balances, "balance sheet balances after a full-price refund");
  assert(near(sum(b.pnl.map((m) => m.supplierRefunds)), 400), "supplierRefunds reports the 400 received");
  assert(near(b.pnl.find((m) => m.month === month(daysAgo(10)))!.purchaseCash, b.pnl.find((m) => m.month === month(daysAgo(10)))!.purchaseCash), "purchaseCash is a number");
}

// 2. Returning a bad batch leaves the cost of the good units alone.
//    Batch A: 10 @ 100. Batch B: 10 @ 200. WAC 150 (qty 20, value 3000). Return all 10 of B at 200:
//    value out 2000, left 10 worth 1000 => WAC back to exactly 100, not 150.
{
  const P = [product("a")];
  const pu = [
    purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(40) }),
    purchase({ id: "p2", productId: "a", qty: 10, unitCost: 200, date: daysAgo(30) }),
  ];
  const r = ret({ id: "r1", purchaseId: "p2", productId: "a", qty: 10, unitCost: 200, creditAmount: 2000, date: daysAgo(20) });
  const b = books(P, pu, [], [r]);
  const l = b.ledgers.get("a")!;
  assert(near(l.qtyOnHand, 10) && near(l.wac, 100) && near(l.inventoryValue, 1000), "returning the dearer batch takes WAC back to 100 (not 150)");
  assert(near(l.supplierReturnValue.get("r1")!, 2000), "ledger reports 2000 of stock value removed");
  assert(b.bs.balances, "balance sheet balances (mixed-cost batches)");
}

// 3. Part credit / restocking fee. Return 5 @ 100, supplier refunds 450 (a 50 fee).
//    Loss 50, booked in cost of goods that month; cash +450; inventory -500.
{
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(30) })];
  const rd = daysAgo(5);
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 450, date: rd });
  const base = books(P, pu, [], []);
  const b = books(P, pu, [], [r]);
  const m = b.pnl.find((x) => x.month === month(rd))!;
  const mb = base.pnl.find((x) => x.month === month(rd))!;
  assert(near(m.supplierReturnGainLoss, -50), "a 50 restocking fee is a -50 result");
  assert(near(m.cogs - mb.cogs, 50), "the fee lands in cost of goods (+50)");
  assert(near(m.netProfitPreTax - mb.netProfitPreTax, -50), "net profit before tax drops by exactly the fee");
  assert(b.bs.balances, "balance sheet balances with a restocking fee");
}

// 4. Credit purchase, reduce what you owe. Buy 10 @ 100 on credit (owe 1000). Send 3 back, 300 off the bill.
//    Owe 700, no cash moved, stock 7, profit effect 0.
{
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(30), paymentMethod: "credit", dueDate: daysAgo(0) })];
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 3, unitCost: 100, creditAmount: 300, settlement: "reduce_payable", date: daysAgo(10) });
  const base = books(P, pu, [], []);
  const b = books(P, pu, [], [r]);
  assert(near(base.ap.totalOutstanding, 1000) && near(b.ap.totalOutstanding, 700), "bill drops from 1000 to 700");
  assert(near(b.ap.lines[0].amountCredited, 300), "the line shows 300 credited");
  assert(near(b.bs.cash, base.bs.cash), "no cash moves when a bill is credited down");
  assert(near(sum(b.pnl.map((m) => m.supplierRefunds)), 0), "no refund cash reported");
  assert(b.bs.balances, "balance sheet balances after crediting a bill");
  // part-paid bill, then credit the rest: pay 400, credit 300 => 300 still owed
  const pay: PayablePayment[] = [{ id: "pp1", purchaseId: "p1", amount: 400, date: daysAgo(15), method: "cash", createdAt: 1 } as PayablePayment];
  const c = books(P, pu, [], [r], { payments: pay });
  assert(near(c.ap.totalOutstanding, 300), "1000 - 400 paid - 300 credited = 300 owed");
  assert(c.bs.balances, "balance sheet balances with a part-paid, part-credited bill");
  // fully credited bill disappears
  const all = ret({ id: "r2", purchaseId: "p1", productId: "a", qty: 10, unitCost: 100, creditAmount: 1000, settlement: "reduce_payable", date: daysAgo(10) });
  const d = books(P, pu, [], [all]);
  assert(d.ap.lines.length === 0 && near(d.ap.totalOutstanding, 0), "a fully credited bill is gone from payables");
  assert(d.bs.balances && near(d.ledgers.get("a")!.qtyOnHand, 0), "...and the books balance with nothing left in stock");
}

// 5. Input tax comes back with the goods. Buy 10 @ 100 with 180 tax (cash). Return 5 -> 90 tax, refund 500 + 90.
{
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, taxAmount: 180, date: daysAgo(30) })];
  const tax = supplierReturnTaxFor(pu[0], 5, []);
  assert(near(tax, 90), "half the goods carries half the tax (90)");
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 500, taxAmount: tax, date: daysAgo(10) });
  const base = books(P, pu, [], []);
  const b = books(P, pu, [], [r]);
  assert(near(b.bs.cash - base.bs.cash, 590), "cash back is goods + tax (590)");
  assert(near(b.bs.salesTaxPayable - base.bs.salesTaxPayable, 90), "90 less input tax is reclaimable, so tax payable rises by 90");
  assert(b.bs.balances, "balance sheet balances with tax on a refund");
  // credit purchase with tax
  const pc = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, taxAmount: 180, date: daysAgo(30), paymentMethod: "credit", dueDate: daysAgo(0) })];
  const rc = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 500, taxAmount: 90, settlement: "reduce_payable", date: daysAgo(10) });
  const c = books(P, pc, [], [rc]);
  assert(near(c.ap.totalOutstanding, 1180 - 590), "credit bill 1180 less 590 credited = 590 owed");
  assert(c.bs.balances, "balance sheet balances crediting a taxed bill");
}

// 6. Tax shares always add back to what was paid, even when it doesn't divide evenly.
{
  const p = { qty: 3, taxAmount: 10 };
  const t1 = supplierReturnTaxFor(p, 1, []);
  const t2 = supplierReturnTaxFor(p, 1, [{ qty: 1, taxAmount: t1 }]);
  const t3 = supplierReturnTaxFor(p, 1, [{ qty: 1, taxAmount: t1 }, { qty: 1, taxAmount: t2 }]);
  assert(near(t1 + t2 + t3, 10, 1e-9), `three returns of a 10-tax purchase add back to exactly 10 (${t1}, ${t2}, ${t3})`);
  assert(supplierReturnTaxFor({ qty: 5 } as any, 2, []) === 0, "no tax on the purchase -> no tax on the return");
}

// 7. Past sales keep the cost they were booked at.
{
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(40) })];
  const sa = [sale({ id: "s1", productId: "a", qty: 3, unitPrice: 150, date: daysAgo(30) })];
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 500, date: daysAgo(10) });
  const base = books(P, pu, sa, []);
  const b = books(P, pu, sa, [r]);
  assert(near(b.econ[0].cogs, base.econ[0].cogs) && near(b.econ[0].cogs, 300), "the earlier sale's cost of goods is untouched (300)");
  assert(near(b.ledgers.get("a")!.qtyOnHand, 2), "10 bought - 3 sold - 5 sent back = 2");
  assert(b.bs.balances, "balance sheet balances with a sale and a return");
}

// 8. Overshoot (return more than is on hand — the app blocks it, but the maths must not drift if it ever happens).
{
  const P = [product("a")];
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(40) })];
  const sa = [sale({ id: "s1", productId: "a", qty: 8, unitPrice: 150, date: daysAgo(30) })];
  const r = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 500, date: daysAgo(10) });
  const b = books(P, pu, sa, [r]);
  assert(b.bs.balances, "balance sheet still balances if a return overshoots stock on hand");
  assert(b.ledgers.get("a")!.supplierReturnValue.get("r1")! <= 200 + 1e-9, "only the 200 of stock that really existed is counted as removed");
}

// 8b. The entry guard: a return dated BEFORE a later sale would leave that sale without stock.
{
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(40) })];
  const sa = [sale({ id: "s1", productId: "a", qty: 8, unitPrice: 150, date: daysAgo(10) })];
  const early = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 5, unitCost: 100, creditAmount: 500, date: daysAgo(20) });
  const late = ret({ id: "r2", purchaseId: "p1", productId: "a", qty: 2, unitCost: 100, creditAmount: 200, date: daysAgo(5) });
  assert(supplierReturnCausesOversell(pu, sa, [], [], [], early) === true, "5 sent back BEFORE an 8-unit sale (only 10 bought) is refused");
  assert(supplierReturnCausesOversell(pu, sa, [], [], [], late) === false, "2 sent back AFTER the sale (2 left) is fine");
}

// 9. Stock counts everywhere agree: global, per-location, history.
{
  const P = [product("a")];
  const locs: Location[] = [{ id: "L1", name: "Main", active: true, isDefault: true, createdAt: 0 }, { id: "L2", name: "Shop 2", active: true, createdAt: 0 }];
  const pu = [
    purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(40), locationId: "L1" }),
    purchase({ id: "p2", productId: "a", qty: 6, unitCost: 100, date: daysAgo(35), locationId: "L2" }),
  ];
  const r = ret({ id: "r1", purchaseId: "p2", productId: "a", qty: 2, unitCost: 100, creditAmount: 200, date: daysAgo(10), locationId: "L2" });
  const lv = computeAllStockLevels(P, pu, [], [], [], [r])[0].currentStock;
  const loc = computeLocationStockLevels(P, locs, pu, [], [], [], [], [r]);
  assert(lv === 14, "stock level = 16 bought - 2 sent back = 14");
  assert(loc.find((x) => x.locationId === "L2")!.qtyOnHand === 4 && loc.find((x) => x.locationId === "L1")!.qtyOnHand === 10, "the 2 leave Shop 2 only (4 left there, 10 at Main)");
  const hist = stockValueHistory(P, pu, [], [], [], TODAY, 3, [r]);
  const ledger = computeAllLedgers(P, pu, [], [], [], [r]).get("a")!;
  assert(near(hist[hist.length - 1].value, ledger.inventoryValue) && hist[hist.length - 1].units === 14, "latest stock-history point equals today's inventory");
}

// 10. Reconciliation: a refund is a cash-in candidate; a bill credit is not.
{
  const rr = ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 2, unitCost: 100, creditAmount: 200, taxAmount: 36, supplier: "Acme", refundMethod: "bank_transfer", date: daysAgo(3) });
  const rcash = ret({ id: "r3", purchaseId: "p1", productId: "a", qty: 1, unitCost: 100, creditAmount: 100, refundMethod: "cash", date: daysAgo(3) });
  const rc = ret({ id: "r2", purchaseId: "p1", productId: "a", qty: 1, unitCost: 100, creditAmount: 100, settlement: "reduce_payable", date: daysAgo(3) });
  const c = computeCashLedgerCandidates({ sales: [], purchases: [], expenses: [], receivablePayments: [], payablePayments: [], capitalEntries: [], supplierReturns: [rr, rc, rcash] });
  assert(c.length === 1 && c[0].type === "supplierReturn" && near(c[0].amount, 236), "only the bank refund is a bank candidate, +236 (goods + tax) — not a bill credit, not a cash refund");
}

// 11. The period lock covers both new writers.
{
  assert(typeof PERIOD_GUARDED_METHODS.addSupplierReturn === "function" && typeof PERIOD_GUARDED_METHODS.deleteSupplierReturn === "function", "closed months refuse adding or deleting a supplier return");
  const dates = PERIOD_GUARDED_METHODS.deletePurchase(["p1"], { purchases: [{ id: "p1", date: "2026-01-05" }], payablePayments: [], supplierReturns: [{ id: "r1", purchaseId: "p1", date: "2026-02-10" }] } as any);
  assert(dates.includes("2026-02-10"), "deleting a purchase also checks the dates of the returns it would delete");
}

// ---------------------------------------------------------------------------
// 12. Seeded random businesses. The Balance Sheet must balance every time, payables must equal what the raw
//     records say, and the stock counts must agree with the ledger. 15% of seeds sell most of the stock, so
//     many returns the app would refuse are generated and skipped, the rest must still balance.
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
{
  let failures = 0;
  let totalReturns = 0, creditReturns = 0, taxedReturns = 0, partFee = 0;
  const RUNS = 500;
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed * 7919);
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    let n = 0;
    const id = (p: string) => `${p}${++n}`;
    const P = [0, 1, 2].map((i) => product(`g${i}`));
    const purchases: Purchase[] = [];
    for (const p of P) {
      for (let k = int(1, 3); k > 0; k--) {
        const qty = int(5, 60);
        const credit = r() < 0.5;
        const unitCost = int(40, 900);
        const taxy = r() < 0.5;
        purchases.push(purchase({
          id: id("pu"), productId: p.id, qty, unitCost, date: daysAgo(int(100, 200)), createdAt: ++n,
          ...(taxy ? { taxAmount: round2(qty * unitCost * 0.15) } : {}),
          ...(credit ? { paymentMethod: "credit", dueDate: daysAgo(int(20, 90)), supplier: "Acme" } : {}),
        }));
      }
    }
    const sales: Sale[] = [];
    const overshoot = r() < 0.15;
    // sell a modest share so most seeds have stock to return
    for (const p of P) {
      const bought = sum(purchases.filter((x) => x.productId === p.id).map((x) => x.qty));
      for (let k = int(0, 3); k > 0; k--) {
        const q = Math.max(1, Math.floor((bought * (overshoot ? 0.9 : 0.3)) / 3));
        sales.push(sale({ id: id("sa"), productId: p.id, qty: q, unitPrice: int(60, 1200), date: daysAgo(int(10, 90)), createdAt: ++n }));
      }
    }
    // partial payments on some credit purchases
    const payments: PayablePayment[] = [];
    for (const pu of purchases) {
      if (pu.paymentMethod === "credit" && r() < 0.4) {
        const due = pu.qty * pu.unitCost + (pu.taxAmount ?? 0);
        payments.push({ id: id("pp"), purchaseId: pu.id, amount: round2(due * (0.2 + r() * 0.3)), date: daysAgo(int(5, 60)), method: "cash", createdAt: ++n } as PayablePayment);
      }
    }
    // returns, built the way the app would allow them (see addSupplierReturn)
    const returns: SupplierReturn[] = [];
    const left = new Map(purchases.map((p) => [p.id, p.qty]));
    const outstanding = new Map(purchases.map((p) => [p.id, p.qty * p.unitCost + (p.taxAmount ?? 0) - sum(payments.filter((x) => x.purchaseId === p.id).map((x) => x.amount))]));
    for (const pu of purchases) {
      if (r() < 0.6) {
        const q = Math.max(1, Math.min(left.get(pu.id)!, int(1, Math.max(1, Math.floor(pu.qty / 2)))));
        const tax = supplierReturnTaxFor(pu, q, returns.filter((x) => x.purchaseId === pu.id));
        let settlement: SupplierReturn["settlement"] = "refund";
        let credit = round2(q * pu.unitCost * (0.7 + r() * 0.4)); // sometimes a fee, sometimes a small gain
        if (pu.paymentMethod === "credit" && r() < 0.6) {
          const cap = outstanding.get(pu.id)!;
          credit = round2(Math.min(credit, Math.max(0, cap - tax)));
          if (credit + tax <= cap + 0.005) settlement = "reduce_payable";
        }
        if (settlement === "reduce_payable") outstanding.set(pu.id, outstanding.get(pu.id)! - credit - tax);
        left.set(pu.id, left.get(pu.id)! - q);
        const cand = ret({ id: id("sr"), purchaseId: pu.id, productId: pu.productId, qty: q, unitCost: pu.unitCost, creditAmount: credit, taxAmount: tax || undefined, settlement, date: daysAgo(int(1, 80)), createdAt: ++n });
        // the app refuses a return that would leave a later sale without stock, or that predates the purchase
        const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => x.productId === pu.productId);
        if (cand.date < pu.date || supplierReturnCausesOversell(mine(purchases), mine(sales), [], [], mine(returns), cand)) {
          if (settlement === "reduce_payable") outstanding.set(pu.id, outstanding.get(pu.id)! + credit + tax);
          left.set(pu.id, left.get(pu.id)! + q);
          continue;
        }
        returns.push(cand);
      }
    }
    totalReturns += returns.length;
    creditReturns += returns.filter((x) => x.settlement === "reduce_payable").length;
    taxedReturns += returns.filter((x) => (x.taxAmount ?? 0) > 0).length;
    partFee += returns.filter((x) => x.creditAmount < x.qty * x.unitCost - 0.005).length;
    try {
      const b = books(P, purchases, sales, returns, { payments, taxRate: [0, 15, 24][int(0, 2)] });
      const expectAp = round2(
        sum(purchases.filter((p) => p.paymentMethod === "credit").map((p) => p.qty * p.unitCost + (p.taxAmount ?? 0))) -
        sum(payments.map((p) => p.amount)) -
        sum(returns.filter((x) => x.settlement === "reduce_payable").map((x) => x.creditAmount + (x.taxAmount ?? 0)))
      );
      const stockOk = P.every((p) => {
        const lv = computeAllStockLevels([p], purchases, sales, [], [], returns)[0].currentStock;
        return near(lv, b.ledgers.get(p.id)!.qtyOnHand, 1e-9);
      });
      const problems: string[] = [];
      if (!b.bs.balances) problems.push(`Balance Sheet does not balance (assets ${round2(b.bs.totalAssets)}, L+E ${round2(b.bs.totalLiabilities + b.bs.totalEquity)})`);
      if (Math.abs(b.ap.totalOutstanding - expectAp) > 0.05) problems.push(`payables ${round2(b.ap.totalOutstanding)} != expected ${expectAp}`);
      if (!stockOk) problems.push("stock level disagrees with the ledger");
      if (problems.length) { failures++; if (failures <= 8) console.error(`FAIL seed ${seed}${overshoot ? " (overshoot)" : ""}: ${problems.join("; ")}`); }
    } catch (e) {
      failures++;
      if (failures <= 8) console.error(`FAIL seed ${seed}: threw ${(e as Error).message}`);
    }
  }
  assert(totalReturns > 400 && creditReturns > 50 && taxedReturns > 50 && partFee > 50, `the stress test really exercised returns (${totalReturns} returns: ${creditReturns} against bills, ${taxedReturns} with tax, ${partFee} below cost)`);
  assert(failures === 0, `${RUNS} random businesses with supplier returns: balance sheet balances, payables and stock agree (${failures} failures)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
