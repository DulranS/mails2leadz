// Empirical check for customer deposits held as a liability (lib/customerDeposits.ts, CustomerDepositEntry): the
// liability it creates, the cash it does and does not move, what it does to what customers owe, the guards that
// stop it going negative, and that the Balance Sheet balances with all of it in the mix. Hand-built cases first
// (numbers worked out in the comments), then a seeded random stress test against the REAL calculation code.
// The balance check here is strict (1 cent), not the app's own "under 1 unit" flag.
// Run: npx tsx scripts/verify-customer-deposits.ts
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeReceivablesAging,
  computeOpeningEquity, computeSaleEconomics, currentInventoryValue, computeCashLedgerCandidates, computeSafeToCommit,
} from "../lib/calculations";
import {
  computeCustomerDeposits, depositBalanceFor, customerDepositKey, validateNewDepositEntry, validateDepositRemovals,
  monthlyDepositCash, depositApplications,
} from "../lib/customerDeposits";
import { generateReceivableReminders } from "../lib/aiSmartReminders";
import { readFileSync } from "fs";
import { join } from "path";
import type { CapitalEntry, CustomerDepositEntry, OpeningBalance, Product, Purchase, ReceivablePayment, Sale } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const TODAY = iso(NOW);
const daysAgo = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));

const product = (id: string): Product => ({ id, name: id, sku: id, category: "", type: "product", active: true, createdAt: 0 } as Product);
const purchase = (o: Partial<Purchase> & { id: string; productId: string; qty: number; unitCost: number; date: string }): Purchase =>
  ({ createdAt: Date.parse(o.date), paymentMethod: "cash", supplier: "Acme", ...o } as Purchase);
const sale = (o: Partial<Sale> & { id: string; productId: string; qty: number; unitPrice: number; date: string }): Sale =>
  ({ createdAt: Date.parse(o.date) + 1, paymentMethod: "cash", ...o } as Sale);
const dep = (o: Partial<CustomerDepositEntry> & { id: string; kind: CustomerDepositEntry["kind"]; amount: number; date: string }): CustomerDepositEntry =>
  ({ customer: "Nimal", createdAt: Date.parse(o.date) + 3, ...o } as CustomerDepositEntry);
const pay = (o: Partial<ReceivablePayment> & { id: string; saleId: string; amount: number; date: string }): ReceivablePayment =>
  ({ method: "cash", createdAt: Date.parse(o.date) + 4, ...o } as ReceivablePayment);

// Everything the app does with these lists, in the order DataContext does it.
function books(sales: Sale[], purchases: Purchase[], deposits: CustomerDepositEntry[] = [], opts: { payments?: ReceivablePayment[]; opening?: OpeningBalance[] } = {}) {
  const products = [product("a")];
  const payments = opts.payments ?? [];
  const opening = opts.opening ?? [];
  const capital = [{ id: "cap", kind: "investment", amount: 1_000_000, date: daysAgo(400), createdAt: 1 } as CapitalEntry];
  const ledgers = computeAllLedgers(products, purchases, sales, [], [], []);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], capital, 0, 0, [], payments, [], [], [], [], [], [], [], [], deposits);
  const ar = computeReceivablesAging(products, sales, econ, payments, TODAY, [], opening, deposits);
  const held = computeCustomerDeposits(deposits, TODAY);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, 0, [], computeOpeningEquity(opening), undefined, 0, 0, held.total);
  const gap = Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity);
  return { pnl, ar, held, bs, gap };
}

const stock = [purchase({ id: "p1", productId: "a", qty: 100, unitCost: 1000, date: daysAgo(60) })]; // 100 units @ 1000 paid in cash
const creditSale = (id: string, qty: number, price: number, customer = "Nimal", date = daysAgo(20)) =>
  sale({ id, productId: "a", qty, unitPrice: price, date, customer, paymentMethod: "credit", dueDate: daysAgo(-10) } as Partial<Sale> & { id: string; productId: string; qty: number; unitPrice: number; date: string });

// 1. A deposit alone: cash in, a liability, no revenue, no profit.
{
  const base = books([], stock);
  const b = books([], stock, [dep({ id: "d1", kind: "received", amount: 5000, date: daysAgo(10) })]);
  assert(near(b.bs.cash - base.bs.cash, 5000), "1: the deposit puts 5000 in cash");
  assert(near(b.bs.customerDeposits, 5000) && near(b.held.total, 5000), "1: and shows as 5000 you owe back");
  assert(near(b.bs.retainedEarnings, base.bs.retainedEarnings), "1: no revenue and no profit from a deposit");
  assert(near(b.pnl[b.pnl.length - 1].totalRevenue, base.pnl[base.pnl.length - 1].totalRevenue), "1: revenue is unchanged");
  assert(b.gap < 0.01, "1: balance sheet balances (strict)");
}

// 2. Sell 10 x 2000 on credit (20000). Use the 5000 deposit on it: the invoice drops to 15000, the liability to 0, no cash moves.
{
  const sales = [creditSale("s1", 10, 2000)];
  const received = dep({ id: "d1", kind: "received", amount: 5000, date: daysAgo(30) });
  const before = books(sales, stock, [received]);
  assert(near(before.ar.totalOutstanding, 20000), "2: before using it, they owe 20000");
  assert(before.gap < 0.01, "2: balances before applying");
  const applied = dep({ id: "d2", kind: "applied", amount: 5000, date: daysAgo(5), saleId: "s1" });
  const after = books(sales, stock, [received, applied]);
  assert(near(after.ar.totalOutstanding, 15000), "2: using the deposit drops what they owe to 15000");
  assert(near(after.bs.customerDeposits, 0), "2: and the liability to 0");
  assert(near(after.bs.cash, before.bs.cash), "2: applying a deposit moves no cash");
  assert(near(after.bs.retainedEarnings, before.bs.retainedEarnings), "2: and no profit (the sale already booked it)");
  assert(near(after.ar.lines[0].amountPaid, 5000), "2: the invoice shows 5000 paid");
  assert(after.gap < 0.01, "2: balance sheet balances (strict)");
  // Pay the rest normally: settled, the line disappears.
  const settled = books(sales, stock, [received, applied], { payments: [pay({ id: "r1", saleId: "s1", amount: 15000, date: daysAgo(1) })] });
  assert(settled.ar.lines.length === 0 && near(settled.ar.totalOutstanding, 0), "2: paying the other 15000 settles the invoice");
  assert(near(settled.bs.cash - before.bs.cash, 15000), "2: cash rises only by the 15000 actually paid");
  assert(settled.gap < 0.01, "2: balanced when fully settled");
}

// 3. Refund: 3000 received, 1000 paid back. Cash +3000 then -1000, liability 2000.
{
  const base = books([], stock);
  const b = books([], stock, [dep({ id: "d1", kind: "received", amount: 3000, date: daysAgo(20) }), dep({ id: "d2", kind: "refunded", amount: 1000, date: daysAgo(3) })]);
  assert(near(b.bs.cash - base.bs.cash, 2000), "3: net cash 2000 after a 1000 refund");
  assert(near(b.bs.customerDeposits, 2000), "3: you still hold 2000");
  assert(b.gap < 0.01, "3: balanced");
  const m = monthlyDepositCash([dep({ id: "a", kind: "received", amount: 3000, date: "2026-03-05" }), dep({ id: "b", kind: "refunded", amount: 1000, date: "2026-03-20" }), dep({ id: "c", kind: "applied", amount: 500, date: "2026-03-21", saleId: "x" })]);
  assert(near(m.get("2026-03")!.received, 3000) && near(m.get("2026-03")!.refunds, 1000), "3: only received and refunded count as cash; applied does not");
}

// 4. Opening-balance receivable: a deposit can be used on it too.
{
  const opening = [{ id: "ob1", kind: "receivable", party: "Nimal", amount: 8000, date: daysAgo(100), dueDate: daysAgo(40), createdAt: 1 } as OpeningBalance];
  const received = dep({ id: "d1", kind: "received", amount: 3000, date: daysAgo(10) });
  const applied = dep({ id: "d2", kind: "applied", amount: 3000, date: daysAgo(2), saleId: "ob1" });
  const b = books([], stock, [received, applied], { opening });
  assert(near(b.ar.totalOutstanding, 5000), "4: 8000 owed on the opening balance, 3000 used, 5000 left");
  assert(b.gap < 0.01, "4: balanced with an opening balance in the mix");
}

// 5. Names match ignoring case and spaces; history by customer.
{
  assert(customerDepositKey("  NIMAL ") === customerDepositKey("nimal"), "5: names match ignoring case and spaces");
  const entries = [dep({ id: "a", kind: "received", amount: 100, date: daysAgo(9), customer: "Nimal" }), dep({ id: "b", kind: "received", amount: 50, date: daysAgo(8), customer: " nimal " }), dep({ id: "c", kind: "received", amount: 70, date: daysAgo(7), customer: "Kamal" })];
  const s = computeCustomerDeposits(entries, TODAY);
  assert(s.byCustomer.length === 2 && near(s.total, 220), "5: two customers, 220 in all");
  assert(near(depositBalanceFor("NIMAL", entries, TODAY), 150), "5: Nimal's balance is 150 whatever the casing");
  assert(computeCustomerDeposits(entries, daysAgo(8)).total === 150, "5: as of an earlier date only earlier deposits count");
}

// 6. Validation.
{
  const entries = [dep({ id: "a", kind: "received", amount: 1000, date: daysAgo(20) })];
  const ok = (n: Parameters<typeof validateNewDepositEntry>[0]) => validateNewDepositEntry(n, entries);
  assert(ok({ customer: "Nimal", kind: "received", amount: 50, date: TODAY }) === null, "6: a new deposit is fine");
  assert(ok({ customer: "", kind: "received", amount: 50, date: TODAY }) !== null, "6: needs a customer");
  assert(ok({ customer: "Nimal", kind: "received", amount: 0, date: TODAY }) !== null, "6: amount must be above zero");
  assert(ok({ customer: "Nimal", kind: "received", amount: -5, date: TODAY }) !== null, "6: not negative");
  assert(ok({ customer: "Nimal", kind: "received", amount: NaN, date: TODAY }) !== null, "6: not NaN");
  assert(ok({ customer: "Nimal", kind: "received", amount: 5, date: "20-1-2026" }) !== null, "6: valid date needed");
  assert(ok({ customer: "Nimal", kind: "refunded", amount: 1000, date: TODAY }) === null, "6: can refund the whole balance");
  assert(ok({ customer: "Nimal", kind: "refunded", amount: 1000.01, date: TODAY }) !== null, "6: not a cent more than held");
  assert(ok({ customer: "Nimal", kind: "refunded", amount: 100, date: daysAgo(30) }) !== null, "6: cannot refund before it was received");
  assert(ok({ customer: "Nimal", kind: "applied", amount: 100, date: TODAY }) !== null, "6: applying needs an invoice");
  assert(ok({ customer: "Nimal", kind: "applied", amount: 100, date: TODAY, saleId: "s1", invoiceOutstanding: 500, invoiceCustomer: "Kamal" }) !== null, "6: not on someone else's invoice");
  assert(ok({ customer: "Nimal", kind: "applied", amount: 600, date: TODAY, saleId: "s1", invoiceOutstanding: 500, invoiceCustomer: "nimal" }) !== null, "6: not more than the invoice owes");
  assert(ok({ customer: "Nimal", kind: "applied", amount: 500, date: TODAY, saleId: "s1", invoiceOutstanding: 500, invoiceCustomer: " NIMAL" }) === null, "6: exactly what the invoice owes is fine");
  // Same-day: money in counts before money out.
  assert(validateNewDepositEntry({ customer: "Nimal", kind: "refunded", amount: 40, date: TODAY }, [dep({ id: "z", kind: "received", amount: 40, date: TODAY })]) === null, "6: received and refunded on one day is fine");
}

// 7. Removals.
{
  const entries = [
    dep({ id: "r", kind: "received", amount: 1000, date: daysAgo(20) }),
    dep({ id: "u", kind: "applied", amount: 600, date: daysAgo(10), saleId: "s1" }),
    dep({ id: "f", kind: "refunded", amount: 100, date: daysAgo(5) }),
  ];
  assert(validateDepositRemovals(["r"], entries) !== null, "7: cannot delete a deposit that has been spent");
  assert(validateDepositRemovals(["u"], entries) === null, "7: deleting a use puts the deposit back");
  assert(validateDepositRemovals(["f"], entries) === null, "7: deleting a refund puts the deposit back");
  assert(validateDepositRemovals(["r", "u", "f"], entries) === null, "7: deleting the lot together is fine");
  // Deleting the deposit and its use but leaving the refund would leave a refund with nothing behind it: refused, whatever the order.
  assert(validateDepositRemovals(["u", "r"], entries) !== null && validateDepositRemovals(["r", "u"], entries) !== null, "7: removing the deposit and its use but not the refund is refused, in either order");
  assert(validateDepositRemovals([], entries) === null, "7: nothing to delete");
  assert(validateDepositRemovals(["r"], [dep({ id: "r", kind: "received", amount: 50, date: daysAgo(3) })]) === null, "7: an unused deposit can go");
}

// 8. Oldest held date: the oldest deposit still holding money.
{
  const e = [dep({ id: "a", kind: "received", amount: 100, date: daysAgo(30) }), dep({ id: "b", kind: "received", amount: 200, date: daysAgo(10) }), dep({ id: "c", kind: "applied", amount: 100, date: daysAgo(5), saleId: "s" })];
  assert(computeCustomerDeposits(e, TODAY).byCustomer[0].oldestOpenDate === daysAgo(10), "8: the first 100 is spent, so the money held dates from the second deposit");
  const partly = [dep({ id: "a", kind: "received", amount: 100, date: daysAgo(30) }), dep({ id: "c", kind: "applied", amount: 40, date: daysAgo(5), saleId: "s" })];
  assert(computeCustomerDeposits(partly, TODAY).byCustomer[0].oldestOpenDate === daysAgo(30), "8: a part-used deposit still dates from its day");
  const none = [dep({ id: "a", kind: "received", amount: 100, date: daysAgo(30) }), dep({ id: "c", kind: "refunded", amount: 100, date: daysAgo(5) })];
  assert(computeCustomerDeposits(none, TODAY).byCustomer[0].oldestOpenDate === null && computeCustomerDeposits(none, TODAY).total === 0, "8: nothing held, no date, nothing counted");
}

// 9. Reminders/aging: an invoice fully settled by deposit is not overdue; a part-settled one shows the smaller amount.
{
  const s = [creditSale("s1", 1, 1000, "Nimal", daysAgo(60))]; // due 10 days in the future per helper; make it overdue:
  s[0].dueDate = daysAgo(15);
  const none = generateReceivableReminders(s, [], [], TODAY, [], []);
  assert(none.length === 1, "9: unpaid and overdue: one reminder");
  const full = generateReceivableReminders(s, [], [], TODAY, [], [dep({ id: "r", kind: "received", amount: 1000, date: daysAgo(50) }), dep({ id: "u", kind: "applied", amount: 1000, date: daysAgo(40), saleId: "s1" })]);
  assert(full.length === 0, "9: settled by a deposit, so no reminder");
  assert(depositApplications([dep({ id: "r", kind: "received", amount: 5, date: TODAY }), dep({ id: "u", kind: "applied", amount: 7, date: TODAY, saleId: "s1" })]).length === 1, "9: only 'applied' rows count against invoices");
}

// 10. Safe to commit and bank lines.
{
  const base = computeSafeToCommit({ cash: 100000, salesTaxPayable: 0, accountsPayable: 0, billsPayable: 0, monthlyFixedCosts: 0, monthlyLoanPayments: 0, bufferMonths: 0 });
  const withDep = computeSafeToCommit({ cash: 100000, salesTaxPayable: 0, accountsPayable: 0, billsPayable: 0, customerDeposits: 30000, monthlyFixedCosts: 0, monthlyLoanPayments: 0, bufferMonths: 0 });
  assert(base.safeToCommit === 100000 && withDep.safeToCommit === 70000 && withDep.alreadyOwed === 30000, "10: money held for customers is not safe to spend");
  const cands = computeCashLedgerCandidates({
    sales: [], purchases: [], expenses: [], receivablePayments: [], payablePayments: [], capitalEntries: [],
    customerDeposits: [
      dep({ id: "a", kind: "received", amount: 500, date: TODAY, method: "bank_transfer" }),
      dep({ id: "b", kind: "received", amount: 600, date: TODAY, method: "cash" }),
      dep({ id: "c", kind: "refunded", amount: 200, date: TODAY, method: "card" }),
      dep({ id: "d", kind: "applied", amount: 100, date: TODAY, saleId: "s" }),
    ],
  });
  assert(cands.length === 2 && cands.find((c) => c.id === "a")!.amount === 500 && cands.find((c) => c.id === "c")!.amount === -200, "10: bank/card deposit and refund are bank lines (in +, out -); cash and 'applied' are not");
}

// 11. Seeded random stress against the real books: any sequence of allowed actions keeps the sheet balanced.
{
  let seed = 20260416;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const names = ["Nimal", "Kamal", "Sunil"];
  let worst = 0, accepted = 0, refused = 0, applications = 0;
  for (let trial = 0; trial < 250; trial++) {
    const sales: Sale[] = [];
    const deposits: CustomerDepositEntry[] = [];
    const payments: ReceivablePayment[] = [];
    let sid = 0, did = 0, pid = 0;
    const steps = 6 + Math.floor(rnd() * 14);
    for (let i = 0; i < steps; i++) {
      const op = rnd();
      const date = daysAgo(Math.floor(rnd() * 55));
      if (op < 0.25 && sales.length < 6) {
        const qty = 1 + Math.floor(rnd() * 4);
        const price = 1000 + Math.floor(rnd() * 3000);
        const s = creditSale(`s${++sid}`, qty, price, pick(names), date);
        if (rnd() < 0.4) s.taxAmount = Math.round(qty * price * 0.1 * 100) / 100;
        sales.push(s);
      } else if (op < 0.5) {
        const c = pick(names), amount = Math.round((100 + rnd() * 5000) * 100) / 100;
        const e = dep({ id: `d${++did}`, kind: "received", amount, date, customer: c, method: pick(["cash", "bank_transfer", "card"] as const) });
        if (validateNewDepositEntry({ customer: c, kind: "received", amount, date }, deposits) === null) { deposits.push(e); accepted++; } else refused++;
      } else if (op < 0.75) {
        const econ = computeSaleEconomics(sales, computeAllLedgers([product("a")], stock, sales, [], [], []), []);
        const ar = computeReceivablesAging([product("a")], sales, econ, payments, TODAY, [], [], deposits);
        const items = ar.lines.flatMap((l) => l.items.filter((it) => it.amountOutstanding > 0.005).map((it) => ({ it, customer: l.customer })));
        if (items.length === 0) continue;
        const { it, customer } = pick(items);
        const amount = Math.round(Math.min(it.amountOutstanding, 50 + rnd() * 4000) * 100) / 100;
        if (validateNewDepositEntry({ customer, kind: "applied", amount, date, saleId: it.saleId, invoiceOutstanding: it.amountOutstanding, invoiceCustomer: customer }, deposits) === null) {
          deposits.push(dep({ id: `d${++did}`, kind: "applied", amount, date, customer, saleId: it.saleId })); accepted++; applications++;
        } else refused++;
      } else if (op < 0.88) {
        const c = pick(names), amount = Math.round((50 + rnd() * 3000) * 100) / 100;
        if (validateNewDepositEntry({ customer: c, kind: "refunded", amount, date }, deposits) === null) { deposits.push(dep({ id: `d${++did}`, kind: "refunded", amount, date, customer: c, method: "cash" })); accepted++; } else refused++;
      } else {
        const econ = computeSaleEconomics(sales, computeAllLedgers([product("a")], stock, sales, [], [], []), []);
        const ar = computeReceivablesAging([product("a")], sales, econ, payments, TODAY, [], [], deposits);
        const items = ar.lines.flatMap((l) => l.items.filter((it) => it.amountOutstanding > 0.005));
        if (items.length === 0) continue;
        const it = pick(items);
        payments.push(pay({ id: `r${++pid}`, saleId: it.saleId, amount: Math.round(Math.min(it.amountOutstanding, 100 + rnd() * 3000) * 100) / 100, date }));
      }
      const b = books(sales, stock, deposits, { payments });
      worst = Math.max(worst, b.gap);
      // Never negative per customer, never over-collected on an invoice.
      assert(b.held.byCustomer.every((x) => x.balance > -0.005), `11: trial ${trial} step ${i}: no customer balance below zero`);
      assert(b.ar.lines.every((l) => l.items.every((it) => it.amountOutstanding > -0.005)), `11: trial ${trial} step ${i}: no invoice over-settled`);
      assert(b.gap < 0.01, `11: trial ${trial} step ${i}: balance sheet balances (gap ${b.gap})`);
    }
    // Deleting every applied row (what deleting its invoice does) must leave a valid, balanced set.
    const withoutApplied = deposits.filter((d) => d.kind !== "applied");
    assert(validateDepositRemovals(deposits.filter((d) => d.kind === "applied").map((d) => d.id), deposits) === null, `11: trial ${trial}: removing every 'applied' row is always allowed`);
    assert(books(sales, stock, withoutApplied, { payments }).gap < 0.01, `11: trial ${trial}: balanced after removing them`);
  }
  assert(accepted > 300 && applications > 40 && refused > 30, `11: the stress test exercised real activity (accepted ${accepted}, applied ${applications}, refused ${refused})`);
  console.log(`   stress: worst balance gap ${worst.toFixed(8)}; ${accepted} accepted, ${applications} applications, ${refused} refused`);
}

// 12. The wiring that no unit test of the maths can see: rules, backup, restore, period lock, cascades, UI hooks.
{
  const root = join(__dirname, "..");
  const read = (f: string) => readFileSync(join(root, f), "utf8");
  const rules = read("firestore.rules"), ctx = read("contexts/DataContext.tsx"), guards = read("lib/periodGuards.ts");
  assert(/match \/customerDeposits\/\{docId\}[\s\S]*?allow create, update: if isOwnerOrManager\(businessId\)[\s\S]*?allow delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\)/.test(rules), "12: rules: Owner/Manager write, Owner delete, no staff");
  assert(/customerDeposits: data\.customerDeposits/.test(read("lib/backupPayload.ts")), "12: in the backup file");
  assert(/"customerDeposits"/.test(read("scripts/restore-from-backup.mjs")), "12: and restored from it");
  assert(/addCustomerDeposit:\s*\(args\)/.test(guards) && /deleteCustomerDeposit:/.test(guards), "12: the period lock refuses deposits dated in a closed month");
  assert(/deleteSale[\s\S]{0,2500}col: "customerDeposits"/.test(ctx), "12: deleting a sale takes the deposit uses on it with it");
  assert(/deleteOpeningBalance[\s\S]{0,3500}col: "customerDeposits"/.test(ctx), "12: deleting an opening balance does too");
  assert(/computeReceivablesAging\(products, sales, saleEconomics, receivablePayments, todayIso\(\), receivableWriteOffs, openingBalances, customerDeposits\)/.test(ctx), "12: the live receivables aging counts deposits used");
  assert(/computeBalanceSheet\([\s\S]{0,900}customerDepositSummary\.total/.test(ctx), "12: the live balance sheet carries the liability");
  assert(/"stockAdjustments", "stockOuts", "supplierCredits", "customerDeposits"/.test(ctx), "12: loaded for Owner and for Manager/Accountant, never for Staff");
  assert(!/"catalog", "sales", "estimates", "leads", "settings", "cashCounts", "receivablePayments", "timeEntries", "customers", "locations"[^\]]*customerDeposits/.test(ctx), "12: Staff do not load it");
  const aging = read("app/api/aging/report/route.ts"), chat = read("app/api/ai/chat/route.ts");
  assert(/customerDeposits/.test(aging) && /customerDeposits/.test(chat), "12: the aging report and the AI assistant count deposits used on invoices");
  assert(/customerDeposits\.total|balanceSheet\.customerDeposits/.test(read("app/profitability/page.tsx")), "12: safe-to-commit sets the held money aside");
}

console.log(`${pass} passed, ${fail} failed`);
