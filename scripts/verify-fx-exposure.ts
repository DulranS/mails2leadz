// Foreign-currency exposure (lib/fxExposure.ts): what is still unpaid in a foreign currency, at the rates it was
// booked at, and what a move in that currency does to it. Built on the real aging maths, not hand-made lines.
// Run: npx tsx scripts/verify-fx-exposure.ts
import { computePayablesAging, computeReceivablesAging, computeSaleEconomics } from "../lib/calculations";
import { computeFxExposure, fxMoveImpact } from "../lib/fxExposure";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol;

const products = [{ id: "p1", name: "Widget" }] as any;
const asOf = "2026-10-17";
const sale = (o: any) => ({ id: "s1", productId: "p1", qty: 1, unitPrice: 30000, date: "2026-09-20", customer: "Acme", paymentMethod: "credit", creditTermDays: 30, dueDate: "2026-10-20", createdAt: 0, ...o });
const purchase = (o: any) => ({ id: "b1", productId: "p1", qty: 10, unitCost: 100, date: "2026-09-25", supplier: "Globex", paymentMethod: "credit", creditTermDays: 30, dueDate: "2026-10-25", createdAt: 0, ...o });

function run(sales: any[], purchases: any[], rPay: any[] = [], pPay: any[] = [], base = "LKR") {
  const econ = computeSaleEconomics(sales as any, new Map() as any, [], [], []);
  const ra = computeReceivablesAging(products, sales as any, econ, rPay, asOf, []);
  const pa = computePayablesAging(products, purchases as any, pPay, asOf);
  return computeFxExposure({ receivables: ra.lines, payables: pa.lines, sales: sales as any, purchases: purchases as any, baseCurrency: base, totalReceivable: ra.totalOutstanding, totalPayable: pa.totalOutstanding });
}

// --- A business with no foreign-currency items has no exposure at all.
let r = run([sale({})], [purchase({})]);
ok(r.rows.length === 0 && r.foreignNet === 0, "base-currency items only => no rows");
ok(r.foreignShareOfReceivables === 0 && r.foreignShareOfPayables === 0, "shares are 0 (not null) when money is owed but none of it is foreign");
r = run([], []);
ok(r.foreignShareOfReceivables === null && r.foreignShareOfPayables === null, "nothing owed at all => shares are null, not a fake 0%");

// --- One USD receivable (100 USD at 300), part paid; one EUR payable (10 x 100 at 350).
const usdSale = sale({ id: "s1", currency: "USD", exchangeRate: 300, foreignUnitPrice: 100 });
const eurBuy = purchase({ id: "b1", currency: "EUR", exchangeRate: 350, foreignUnitCost: 100 / 350 });
r = run([usdSale], [eurBuy], [{ id: "r1", saleId: "s1", amount: 10000, date: "2026-10-01" }], [{ id: "q1", purchaseId: "b1", amount: 400, date: "2026-10-02" }]);
const usd = r.rows.find((x) => x.currency === "USD")!;
const eur = r.rows.find((x) => x.currency === "EUR")!;
ok(!!usd && near(usd.receivable, 20000) && usd.payable === 0, "USD: 30,000 sold, 10,000 paid => 20,000 still owed to you");
ok(near(usd.net, 20000) && usd.receivableCount === 1, "USD net is the receivable; one invoice");
ok(usd.avgRate !== null && near(usd.avgRate, 300, 1e-9), "USD average booked rate is 300");
ok(!!eur && near(eur.payable, 600) && eur.receivable === 0, "EUR: 1,000 bought, 400 paid => 600 still owed to the supplier");
ok(near(eur.net, -600) && eur.payableCount === 1, "EUR net is negative (you owe)");
ok(eur.avgRate !== null && near(eur.avgRate, 350, 1e-9), "EUR average booked rate is 350");
ok(near(r.foreignReceivable, 20000) && near(r.foreignPayable, 600) && near(r.foreignNet, 19400), "totals add up");
ok(r.foreignShareOfReceivables !== null && near(r.foreignShareOfReceivables, 1, 1e-9), "all of what customers owe is USD => 100%");
ok(r.rows[0].currency === "USD", "largest exposure first");
ok(r.rows.length === 2 && r.baseCurrency === "LKR", "two currencies, base reported");

// --- Moves: a 10% stronger USD is worth +2,000 on the receivable; a 10% weaker EUR saves 60 on the payable.
ok(near(fxMoveImpact(usd.net, 10), 2000), "USD +10% => +2,000");
ok(near(fxMoveImpact(usd.net, -10), -2000), "USD -10% => -2,000");
ok(near(fxMoveImpact(eur.net, -10), 60), "EUR -10% on a payable => +60 (you pay less)");
ok(near(fxMoveImpact(eur.net, 10), -60), "EUR +10% on a payable => -60");
ok(fxMoveImpact(0, 25) === 0, "no position => no impact");

// --- Fully paid foreign sales and base-currency items never appear; lowercase base code is still the base.
r = run([usdSale, sale({ id: "s2", currency: "lkr", exchangeRate: 1 })], [], [{ id: "r1", saleId: "s1", amount: 30000, date: "2026-10-01" }]);
ok(r.rows.length === 0, "fully paid USD sale and a sale tagged with the base currency (any case) => no exposure");

// --- Two USD sales at different rates: the average rate is weighted by value (harmonic), not a plain mean.
const a = sale({ id: "s1", unitPrice: 30000, currency: "USD", exchangeRate: 300 });
const b = sale({ id: "s2", unitPrice: 33000, currency: "USD", exchangeRate: 330, customer: "Beta" });
r = run([a, b], []);
const u2 = r.rows[0];
const expectedRate = (30000 + 33000) / (30000 / 300 + 33000 / 330);
ok(near(u2.receivable, 63000) && u2.receivableCount === 2, "two USD invoices sum");
ok(u2.avgRate !== null && near(u2.avgRate, expectedRate, 1e-9), "average rate is value-weighted");
ok(u2.oldestDate === "2026-09-20", "oldest unpaid foreign item is reported");

// --- A grouped multi-line invoice counts as ONE invoice.
const g1 = sale({ id: "s1", invoiceId: "inv1", unitPrice: 10000, currency: "USD", exchangeRate: 300 });
const g2 = sale({ id: "s2", invoiceId: "inv1", unitPrice: 5000, currency: "USD", exchangeRate: 300 });
r = run([g1, g2], []);
ok(r.rows[0].receivableCount === 1 && near(r.rows[0].receivable, 15000), "two lines on one invoice => 1 invoice, 15,000");

// --- A line on a partly settled invoice that is already fully paid must not count (not even for "oldest item").
const h1 = sale({ id: "s1", invoiceId: "inv9", date: "2026-08-01", unitPrice: 10000, currency: "USD", exchangeRate: 300 });
const h2 = sale({ id: "s2", invoiceId: "inv9", date: "2026-09-10", unitPrice: 6000, currency: "USD", exchangeRate: 300 });
r = run([h1, h2], [], [{ id: "r1", saleId: "s1", amount: 10000, date: "2026-08-20" }]);
ok(near(r.rows[0].receivable, 6000), "the paid line drops out, only the 6,000 line is still owed");
ok(r.rows[0].oldestDate === "2026-09-10", "oldest unpaid item ignores the line that is already paid");

// --- A foreign item with no usable rate still counts in value, but offers no average rate (never a made-up one).
r = run([sale({ id: "s1", currency: "USD" })], []);
ok(near(r.rows[0].receivable, 30000) && r.rows[0].avgRate === null, "missing rate => value kept, average rate null");

// --- Cash purchases are paid at once and never show as owed.
r = run([], [purchase({ paymentMethod: "cash", currency: "EUR", exchangeRate: 350 })]);
ok(r.rows.length === 0, "cash purchase in EUR => nothing owed => no exposure");

// --- Does not mutate its inputs.
const s0 = JSON.stringify([usdSale]);
run([usdSale], [eurBuy]);
ok(JSON.stringify([usdSale]) === s0, "inputs untouched");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
