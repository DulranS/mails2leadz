// Empirical check for supplier credit held as a balance (lib/supplierCredit.ts, SupplierCreditEntry and the
// "hold_credit" return settlement): the asset it creates, the cash it does and does not move, what it does to what you
// owe, the guards that stop it going negative, and that the Balance Sheet balances with all of it in the mix.
// Hand-built cases first (numbers worked out in the comments), then a seeded random stress test against the REAL
// calculation code. The balance check here is strict (1 cent), not the app's own "under 1 unit" flag.
// Run: npx tsx scripts/verify-supplier-credit.ts
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeOpeningEquity, computeSaleEconomics, computeSupplierReturnPnLInputs, currentInventoryValue, supplierReturnTaxFor, supplierReturnCausesOversell,
} from "../lib/calculations";
import {
  computeSupplierCredit, creditBalanceFor, supplierKey, validateNewCreditEntry, validateRemoval,
} from "../lib/supplierCredit";
import { readFileSync } from "fs";
import { join } from "path";
import { supplierKey as dsk } from "../lib/supplierDelivery";
import type { CapitalEntry, OpeningBalance, PayablePayment, Product, Purchase, Sale, SupplierCreditEntry, SupplierReturn } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const TODAY = iso(NOW);
const daysAgo = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const month = (d: string) => d.slice(0, 7);

const product = (id: string): Product => ({ id, name: id, sku: id, category: "", type: "product", active: true, createdAt: 0 } as Product);
const purchase = (o: Partial<Purchase> & { id: string; productId: string; qty: number; unitCost: number; date: string }): Purchase =>
  ({ createdAt: Date.parse(o.date), paymentMethod: "cash", supplier: "Acme", ...o } as Purchase);
const sale = (o: Partial<Sale> & { id: string; productId: string; qty: number; unitPrice: number; date: string }): Sale =>
  ({ createdAt: Date.parse(o.date) + 1, paymentMethod: "cash", ...o } as Sale);
const ret = (o: Partial<SupplierReturn> & { id: string; purchaseId: string; productId: string; qty: number; unitCost: number; creditAmount: number; date: string }): SupplierReturn =>
  ({ settlement: "hold_credit", reason: "defective", supplier: "Acme", createdAt: Date.parse(o.date) + 2, ...o } as SupplierReturn);
const cr = (o: Partial<SupplierCreditEntry> & { id: string; kind: SupplierCreditEntry["kind"]; amount: number; date: string }): SupplierCreditEntry =>
  ({ supplier: "Acme", createdAt: Date.parse(o.date) + 3, ...o } as SupplierCreditEntry);

// Everything the app does with these lists, in the order DataContext does it.
function books(products: Product[], purchases: Purchase[], sales: Sale[], returns: SupplierReturn[], credits: SupplierCreditEntry[] = [], opts: { payments?: PayablePayment[]; taxRate?: number; opening?: OpeningBalance[] } = {}) {
  const payments = opts.payments ?? [];
  const capital = [{ id: "cap", kind: "investment", amount: 1_000_000, date: daysAgo(400), createdAt: 1 } as CapitalEntry];
  const ledgers = computeAllLedgers(products, purchases, sales, [], [], returns);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], capital, opts.taxRate ?? 0, 0, [], [], payments, [], [], [], [], [], computeSupplierReturnPnLInputs(returns, ledgers), credits);
  const opening = opts.opening ?? [];
  const ap = computePayablesAging(products, purchases, payments, TODAY, opening, returns, credits);
  const held = computeSupplierCredit(returns, credits, TODAY);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], computeCapitalSummary(capital, pnl), TODAY, [], 0, ap.totalOutstanding, [], computeOpeningEquity(opening), undefined, 0, held.total);
  const gap = Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity);
  return { ledgers, pnl, ap, held, bs, gap };
}

const P = [product("a")];

// 1. A return kept as credit. Buy 10 @ 100 cash (1000), send 4 back: supplier credits 400 and keeps it.
//    Stock 10 -> 6 (value 600). No cash moves. Asset "credit held" 400. Profit unchanged (full-price credit).
{
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(30) })];
  const base = books(P, pu, [], []);
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, date: daysAgo(10) })];
  const b = books(P, pu, [], r);
  assert(near(b.bs.cash, base.bs.cash), "keeping a return as credit moves no cash");
  assert(near(b.bs.supplierCredit, 400) && near(b.held.total, 400), "the supplier now holds 400 for you");
  assert(near(b.bs.inventoryValue, 600), "stock is worth 600 after 4 left");
  assert(near(b.bs.retainedEarnings, base.bs.retainedEarnings), "a full-price credit changes no profit");
  assert(b.gap < 0.01, "balance sheet balances (strict)");
  assert(near(sum(b.pnl.map((m) => m.supplierRefunds)), 0) && near(sum(b.pnl.map((m) => m.supplierDeposits)), 0), "it is not a refund and not a deposit");
}

// 2. With input tax at 15%: purchase 1000 + 150 tax paid cash. Return 4 of 10: credit 400 + tax 60 -> held 460.
{
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, taxAmount: 150, date: daysAgo(30) })];
  const base = books(P, pu, [], [], [], { taxRate: 0 });
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, taxAmount: 60, date: daysAgo(10) })];
  const b = books(P, pu, [], r);
  assert(near(b.bs.supplierCredit, 460), "goods 400 + tax 60 = 460 held");
  assert(near(b.bs.salesTaxPayable - base.bs.salesTaxPayable, 60), "the 60 of input tax reclaimed on the purchase is given back");
  assert(b.gap < 0.01, "balances with tax");
}

// 3. A deposit. Pay 500 by bank in advance. Cash -500, asset +500, nothing else.
{
  const base = books(P, [], [], []);
  const b = books(P, [], [], [], [cr({ id: "d1", kind: "deposit", amount: 500, date: daysAgo(5), method: "bank_transfer" })]);
  assert(near(base.bs.cash - b.bs.cash, 500) && near(b.bs.supplierCredit, 500), "cash down 500, credit held up 500");
  assert(near(b.bs.totalAssets, base.bs.totalAssets), "a deposit swaps one asset for another");
  const m = b.pnl.find((x) => x.month === month(daysAgo(5)))!;
  assert(near(m.supplierDeposits, 500) && near(m.purchaseCash - base.pnl.find((x) => x.month === month(daysAgo(5)))!.purchaseCash, 500), "the month's cash paid to suppliers shows the 500");
  assert(b.gap < 0.01, "balances after a deposit");
}

// 4. Using credit on an open bill. Bill: 10 @ 100 on credit (1000 owed). Credit held 400 (from a return on another
//    purchase). Apply 300: you owe 700, credit left 100, no cash moves.
{
  const pu = [
    purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(60) }),
    purchase({ id: "p2", productId: "a", qty: 10, unitCost: 100, date: daysAgo(20), paymentMethod: "credit", dueDate: daysAgo(-10) }),
  ];
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, date: daysAgo(15) })];
  const before = books(P, pu, [], r);
  const use = [cr({ id: "u1", kind: "applied", amount: 300, date: daysAgo(3), purchaseId: "p2" })];
  const b = books(P, pu, [], r, use);
  assert(near(before.ap.totalOutstanding, 1000) && near(b.ap.totalOutstanding, 700), "you owe 1000 before and 700 after using 300 of credit");
  assert(near(b.bs.supplierCredit, 100), "100 of credit is left");
  assert(near(b.bs.cash, before.bs.cash), "using credit moves no cash");
  assert(near(b.ap.lines[0].amountCredited, 300) && near(b.ap.lines[0].amountPaid, 0), "the bill shows 300 credited and nothing paid in cash");
  assert(b.gap < 0.01, "balances after using credit");
  // all of it, and an opening-balance bill
  const all = books(P, pu, [], r, [cr({ id: "u2", kind: "applied", amount: 400, date: daysAgo(3), purchaseId: "p2" })]);
  assert(near(all.bs.supplierCredit, 0) && near(all.ap.totalOutstanding, 600) && all.gap < 0.01, "using all 400 leaves none held and 600 owed");
}

// 4b. Credit used on an OPENING-BALANCE payable (a bill that was already owed when the owner started using the app).
//     They owe Acme 1,000 from before. A 400 deposit is paid, then 300 of it is used on that old bill.
{
  const ob: OpeningBalance = { id: "ob1", kind: "payable", party: "Acme", amount: 1000, date: daysAgo(200), dueDate: daysAgo(100), createdAt: 1 } as OpeningBalance;
  const dep = cr({ id: "d1", kind: "deposit", amount: 400, date: daysAgo(20), method: "bank_transfer" });
  const before = books(P, [], [], [], [dep], { opening: [ob] });
  const use = cr({ id: "u1", kind: "applied", amount: 300, date: daysAgo(3), purchaseId: "ob1" });
  const b = books(P, [], [], [], [dep, use], { opening: [ob] });
  assert(near(before.ap.totalOutstanding, 1000) && near(b.ap.totalOutstanding, 700), "the old bill drops from 1,000 to 700");
  assert(b.ap.lines.length === 1 && b.ap.lines[0].isOpeningBalance === true && near(b.ap.lines[0].amountCredited, 300), "it is still the opening-balance line, now showing 300 credited");
  assert(near(b.bs.supplierCredit, 100) && near(b.bs.cash, before.bs.cash), "100 of credit left and no cash moved");
  assert(before.gap < 0.01 && b.gap < 0.01, "balance sheet balances before and after (opening equity untouched)");
  const msg = validateNewCreditEntry({ supplier: "Acme", kind: "applied", amount: 150, date: daysAgo(2), purchaseId: "ob1", billOutstanding: b.ap.lines[0].amountOutstanding, billSupplier: b.ap.lines[0].supplier }, [], [dep, use]);
  assert(msg !== null, "the remaining 100 of credit can't be stretched to 150");
  const all = books(P, [], [], [], [dep, use, cr({ id: "u2", kind: "applied", amount: 100, date: daysAgo(1), purchaseId: "ob1" })], { opening: [ob] });
  assert(near(all.ap.totalOutstanding, 600) && near(all.bs.supplierCredit, 0) && all.gap < 0.01, "using the last 100 leaves 600 owed and nothing held");
}

// 5. The supplier pays held credit back: cash +200, asset -200.
{
  const pu = [purchase({ id: "p1", productId: "a", qty: 10, unitCost: 100, date: daysAgo(60) })];
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, date: daysAgo(15) })];
  const before = books(P, pu, [], r);
  const b = books(P, pu, [], r, [cr({ id: "f1", kind: "refunded", amount: 200, date: daysAgo(2), method: "cash" })]);
  assert(near(b.bs.cash - before.bs.cash, 200) && near(b.bs.supplierCredit, 200), "refund: cash up 200, credit held down to 200");
  assert(near(sum(b.pnl.map((m) => m.supplierCreditRefunds)), 200), "reported as a credit refund received");
  assert(b.gap < 0.01, "balances after a refund");
}

// 6. Guards.
{
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, date: daysAgo(15) })];
  const bill = { purchaseId: "p2", billOutstanding: 1000, billSupplier: "Acme" };
  const ok = (amount: number, date = daysAgo(3), x: Partial<Parameters<typeof validateNewCreditEntry>[0]> = {}, entries: SupplierCreditEntry[] = []) =>
    validateNewCreditEntry({ supplier: "Acme", kind: "applied", amount, date, ...bill, ...x }, r, entries);
  assert(ok(400) === null, "using exactly the whole balance is allowed");
  assert(ok(400.01) !== null, "a cent more than the balance is refused");
  assert(ok(100, daysAgo(20)) !== null, "using credit before it existed is refused (a backdated entry cannot overspend)");
  assert(ok(100, daysAgo(15)) === null, "on the day it arrived is fine (money in counts before money out)");
  assert(ok(300, daysAgo(3), {}, [cr({ id: "u1", kind: "applied", amount: 150, date: daysAgo(4), purchaseId: "p3" })]) !== null, "what was already used is taken into account");
  assert(ok(100, daysAgo(3), { billOutstanding: 50 }) !== null, "more than is owed on the bill is refused");
  assert(ok(100, daysAgo(3), { billSupplier: "Bolt" }) !== null, "a different supplier's bill is refused");
  assert(ok(100, daysAgo(3), { purchaseId: undefined }) !== null, "no bill chosen is refused");
  assert(ok(0) !== null && ok(-5) !== null && ok(NaN) !== null, "zero, negative and junk amounts are refused");
  assert(ok(100, daysAgo(3), { supplier: "  acme " , billSupplier: "ACME"}) === null, "supplier names match ignoring case and spaces");
  assert(validateNewCreditEntry({ supplier: "Acme", kind: "refunded", amount: 500, date: daysAgo(3) }, r, []) !== null, "a refund of more than is held is refused");
  assert(validateNewCreditEntry({ supplier: "Acme", kind: "deposit", amount: 500, date: daysAgo(3) }, [], []) === null, "a deposit is always fine");
  assert(validateNewCreditEntry({ supplier: "", kind: "deposit", amount: 5, date: daysAgo(3) }, [], []) !== null, "a supplier is required");
  // A future-dated entry: an earlier entry spending credit that only arrives later must be refused too.
  assert(validateNewCreditEntry({ supplier: "Acme", kind: "refunded", amount: 100, date: daysAgo(3) }, [], [cr({ id: "d", kind: "deposit", amount: 100, date: daysAgo(1) })]) !== null, "cannot refund on a date before the deposit that funds it");

  // Removals.
  const dep = cr({ id: "d1", kind: "deposit", amount: 500, date: daysAgo(10) });
  const used = cr({ id: "u1", kind: "applied", amount: 300, date: daysAgo(5), purchaseId: "p2" });
  assert(validateRemoval({ returnId: "r1" }, r, [used]) !== null, "cannot delete a held-credit return whose credit was used");
  assert(validateRemoval({ returnId: "r1" }, r, []) === null, "can delete it when nothing was used");
  assert(validateRemoval({ entryId: "u1" }, r, [used]) === null, "deleting a use of credit always puts credit back");
  assert(validateRemoval({ entryId: "d1" }, [], [dep, used]) !== null, "cannot delete a deposit that has been spent");
  assert(validateRemoval({ entryId: "d1" }, [], [dep]) === null, "can delete an unspent deposit");
  assert(validateRemoval({ returnId: "nope" }, r, []) === null, "an unknown id is not blocked here");
  const refundRet = ret({ id: "r2", purchaseId: "p1", productId: "a", qty: 1, unitCost: 100, creditAmount: 100, settlement: "refund", date: daysAgo(15) });
  assert(validateRemoval({ returnId: "r2" }, [refundRet], [used]) === null, "a return that held no credit is never blocked by this");
}

// 7. Summaries.
{
  const r = [ret({ id: "r1", purchaseId: "p1", productId: "a", qty: 4, unitCost: 100, creditAmount: 400, taxAmount: 60, date: daysAgo(15) }), ret({ id: "r2", purchaseId: "p1", productId: "a", qty: 1, unitCost: 100, creditAmount: 100, settlement: "refund", date: daysAgo(14) })];
  const e = [cr({ id: "d", kind: "deposit", amount: 100, date: daysAgo(12), supplier: " ACME " }), cr({ id: "u", kind: "applied", amount: 160, date: daysAgo(5), purchaseId: "x" }), cr({ id: "o", kind: "deposit", amount: 50, date: daysAgo(5), supplier: "Bolt" })];
  const s = computeSupplierCredit(r, e, TODAY);
  const a = s.bySupplier.find((x) => x.key === "acme")!;
  assert(near(a.fromReturns, 460) && near(a.deposits, 100) && near(a.applied, 160) && near(a.balance, 400), "Acme: 460 from the return + 100 deposit - 160 used = 400 (the refunded return holds nothing)");
  assert(near(s.total, 450) && s.bySupplier.length === 2, "total across suppliers is 450");
  assert(near(creditBalanceFor("acme ", r, e, TODAY), 400) && creditBalanceFor("Nobody", r, e, TODAY) === 0, "balance lookup by name");
  assert(near(creditBalanceFor("Acme", r, e, daysAgo(13)), 460), "balance as of an earlier date ignores later entries");
  assert(supplierKey("  Acme Ltd ") === "acme ltd", "supplier keys ignore case and spaces at the ends");
  assert(["Acme", " ACME ", "Bolt Ltd", "  bolt ltd"].every((n) => supplierKey(n) === dsk(n)), "same matching as the Suppliers page and delivery tracking");
}

// 8. Seeded random businesses.
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
  let failures = 0, heldReturns = 0, deposits = 0, applieds = 0, refundeds = 0, taxed = 0, refusedByGuard = 0;
  const RUNS = 500;
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed * 104729);
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    let n = 0;
    const id = (p: string) => `${p}${++n}`;
    const Ps = [0, 1, 2].map((i) => product(`g${i}`));
    const names = ["Acme", "Bolt Ltd"];
    const variant = (nm: string) => (r() < 0.3 ? ` ${nm.toUpperCase()} ` : nm); // the same supplier typed differently
    const purchases: Purchase[] = [];
    for (const p of Ps) {
      for (let k = int(1, 3); k > 0; k--) {
        const qty = int(5, 60), unitCost = int(40, 900), credit = r() < 0.5, taxy = r() < 0.5;
        purchases.push(purchase({
          id: id("pu"), productId: p.id, qty, unitCost, date: daysAgo(int(100, 200)), createdAt: ++n, supplier: variant(names[int(0, 1)]),
          ...(taxy ? { taxAmount: round2(qty * unitCost * 0.15) } : {}),
          ...(credit ? { paymentMethod: "credit", dueDate: daysAgo(int(20, 90)) } : {}),
        }));
      }
    }
    const sales: Sale[] = [];
    for (const p of Ps) {
      const bought = sum(purchases.filter((x) => x.productId === p.id).map((x) => x.qty));
      for (let k = int(0, 3); k > 0; k--) sales.push(sale({ id: id("sa"), productId: p.id, qty: Math.max(1, Math.floor((bought * 0.3) / 3)), unitPrice: int(60, 1200), date: daysAgo(int(10, 90)), createdAt: ++n }));
    }
    const payments: PayablePayment[] = [];
    for (const pu of purchases) {
      if (pu.paymentMethod === "credit" && r() < 0.4) {
        const due = pu.qty * pu.unitCost + (pu.taxAmount ?? 0);
        payments.push({ id: id("pp"), purchaseId: pu.id, amount: round2(due * (0.2 + r() * 0.3)), date: daysAgo(int(5, 60)), method: "cash", createdAt: ++n } as PayablePayment);
      }
    }
    // returns: refund / reduce_payable / hold_credit, built the way the app allows them
    const returns: SupplierReturn[] = [];
    const left = new Map(purchases.map((p) => [p.id, p.qty]));
    const outstanding = new Map(purchases.map((p) => [p.id, p.qty * p.unitCost + (p.taxAmount ?? 0) - sum(payments.filter((x) => x.purchaseId === p.id).map((x) => x.amount))]));
    for (const pu of purchases) {
      if (r() < 0.7) {
        const q = Math.max(1, Math.min(left.get(pu.id)!, int(1, Math.max(1, Math.floor(pu.qty / 2)))));
        const tax = supplierReturnTaxFor(pu, q, returns.filter((x) => x.purchaseId === pu.id));
        let settlement: SupplierReturn["settlement"] = (["refund", "hold_credit", "hold_credit"] as const)[int(0, 2)];
        let credit = round2(q * pu.unitCost * (0.7 + r() * 0.4));
        if (pu.paymentMethod === "credit" && r() < 0.4) {
          const cap = outstanding.get(pu.id)!;
          credit = round2(Math.min(credit, Math.max(0, cap - tax)));
          if (credit + tax <= cap + 0.005) settlement = "reduce_payable";
        }
        if (settlement === "reduce_payable") outstanding.set(pu.id, outstanding.get(pu.id)! - credit - tax);
        left.set(pu.id, left.get(pu.id)! - q);
        const cand = ret({ id: id("sr"), purchaseId: pu.id, productId: pu.productId, qty: q, unitCost: pu.unitCost, creditAmount: credit, taxAmount: tax || undefined, settlement, supplier: pu.supplier, date: daysAgo(int(1, 80)), createdAt: ++n });
        const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => x.productId === pu.productId);
        if (cand.date < pu.date || supplierReturnCausesOversell(mine(purchases), mine(sales), [], [], mine(returns), cand)) {
          if (settlement === "reduce_payable") outstanding.set(pu.id, outstanding.get(pu.id)! + credit + tax);
          left.set(pu.id, left.get(pu.id)! + q);
          continue;
        }
        returns.push(cand);
      }
    }
    // credit movements: only the ones the app's own validation would accept
    const credits: SupplierCreditEntry[] = [];
    const billOut = new Map(outstanding);
    for (let attempt = 0; attempt < 14; attempt++) {
      const supplier = variant(names[int(0, 1)]);
      const kind = (["deposit", "applied", "applied", "refunded"] as const)[int(0, 3)];
      const date = daysAgo(int(0, 70));
      if (kind === "applied") {
        const bills = purchases.filter((p) => p.paymentMethod === "credit" && supplierKey(p.supplier) === supplierKey(supplier) && (billOut.get(p.id) ?? 0) > 1);
        if (!bills.length) continue;
        const bill = bills[int(0, bills.length - 1)];
        const amount = round2(Math.min(billOut.get(bill.id)!, 20 + r() * 600));
        const msg = validateNewCreditEntry({ supplier, kind, amount, date, purchaseId: bill.id, billOutstanding: billOut.get(bill.id)!, billSupplier: bill.supplier }, returns, credits);
        if (msg) { refusedByGuard++; continue; }
        credits.push(cr({ id: id("cr"), kind, amount, date, supplier, purchaseId: bill.id, createdAt: ++n }));
        billOut.set(bill.id, billOut.get(bill.id)! - amount);
        applieds++;
      } else {
        const amount = round2(20 + r() * 700);
        const msg = validateNewCreditEntry({ supplier, kind, amount, date }, returns, credits);
        if (msg) { refusedByGuard++; continue; }
        credits.push(cr({ id: id("cr"), kind, amount, date, supplier, method: (["cash", "bank_transfer", "card"] as const)[int(0, 2)], createdAt: ++n }));
        if (kind === "deposit") deposits++; else refundeds++;
      }
    }
    heldReturns += returns.filter((x) => x.settlement === "hold_credit").length;
    taxed += returns.filter((x) => x.settlement === "hold_credit" && (x.taxAmount ?? 0) > 0).length;
    try {
      const b = books(Ps, purchases, sales, returns, credits, { payments, taxRate: [0, 15, 24][int(0, 2)] });
      const expectAp = round2(
        sum(purchases.filter((p) => p.paymentMethod === "credit").map((p) => p.qty * p.unitCost + (p.taxAmount ?? 0))) -
        sum(payments.map((p) => p.amount)) -
        sum(returns.filter((x) => x.settlement === "reduce_payable").map((x) => x.creditAmount + (x.taxAmount ?? 0))) -
        sum(credits.filter((c) => c.kind === "applied").map((c) => c.amount))
      );
      const expectHeld = round2(
        sum(returns.filter((x) => x.settlement === "hold_credit").map((x) => x.creditAmount + (x.taxAmount ?? 0))) +
        sum(credits.filter((c) => c.kind === "deposit").map((c) => c.amount)) -
        sum(credits.filter((c) => c.kind !== "deposit").map((c) => c.amount))
      );
      const problems: string[] = [];
      if (b.gap > 0.01) problems.push(`Balance Sheet off by ${round2(b.gap)}`);
      if (Math.abs(b.ap.totalOutstanding - expectAp) > 0.05) problems.push(`payables ${round2(b.ap.totalOutstanding)} != expected ${expectAp}`);
      if (Math.abs(b.bs.supplierCredit - expectHeld) > 0.05) problems.push(`credit held ${round2(b.bs.supplierCredit)} != expected ${expectHeld}`);
      if (b.held.bySupplier.some((x) => x.balance < -0.005)) problems.push("a supplier balance went negative");
      if (b.ap.lines.some((l) => l.amountOutstanding < -0.005)) problems.push("a bill went negative");
      if (problems.length) { failures++; if (failures <= 8) console.error(`FAIL seed ${seed}: ${problems.join("; ")}`); }
    } catch (e) {
      failures++;
      if (failures <= 8) console.error(`FAIL seed ${seed}: threw ${(e as Error).message}`);
    }
  }
  assert(heldReturns > 300 && taxed > 100 && deposits > 300 && applieds > 200 && refundeds > 100 && refusedByGuard > 50, `the stress test really exercised credit (${heldReturns} returns kept as credit, ${taxed} with tax, ${deposits} deposits, ${applieds} uses on bills, ${refundeds} refunds, ${refusedByGuard} entries the guard refused)`);
  assert(failures === 0, `${RUNS} random businesses with supplier credit: balance sheet balances to the cent, payables and credit held match the raw records, nothing goes negative (${failures} failures)`);
}

// 9. Orphan guard (source check). Credit applied to a bill is only meaningful while the bill exists, so every path that
//    deletes a bill must delete the credit used on it too. Left behind, the credit held would keep shrinking while the
//    bill it paid off was gone and the balance sheet would be out by that amount. This failed once for opening-balance
//    payables; the check keeps it from coming back for either kind of bill.
{
  const src = readFileSync(join(__dirname, "../contexts/DataContext.tsx"), "utf8");
  const bodyOf = (name: string) => {
    const i = src.indexOf(`${name}: async`);
    return i < 0 ? "" : src.slice(i, i + 2600);
  };
  for (const fn of ["deletePurchase", "deleteOpeningBalance"]) {
    const b = bodyOf(fn);
    assert(b.length > 0 && /col:\s*"supplierCredits"/.test(b), `${fn} also deletes the supplier credit used on the bill`);
  }
  const guards = readFileSync(join(__dirname, "../lib/periodGuards.ts"), "utf8");
  assert(/deletePurchase:[\s\S]{0,700}supplierCredits/.test(guards) && /deleteOpeningBalance:[\s\S]{0,700}supplierCredits/.test(guards), "closed-month protection covers those cascaded credit entries");
}

console.log(`\n${pass} passed, ${fail} failed`);
