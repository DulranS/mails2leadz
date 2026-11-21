// Empirical check for the delivery-charge line on a sale (lib/delivery.ts): the helpers, and that a delivery line
// goes through the REAL engine as plain service income (revenue, tax, receivables, balance sheet) without
// touching stock or cost of goods.
// Run: npx tsx scripts/verify-delivery.ts
import {
  allocateLineTax, buildDeliverySale, deliveryTaxFor, newInvoiceId, parseDeliveryAmount, resolveDeliveryItem,
} from "../lib/delivery";
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeReceivablesAging,
  computeSaleEconomics, currentInventoryValue, groupSalesByInvoice,
} from "../lib/calculations";
import type { CapitalEntry, Product, Purchase, Sale } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const TODAY = iso(NOW);
const daysAgo = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// --- the helpers -----------------------------------------------------------------------------------------------
{
  const items = [
    { id: "svc", type: "service", active: true },
    { id: "off", type: "service", active: false },
    { id: "gd", type: "product", active: true },
  ];
  assert(resolveDeliveryItem({}, items) === null, "feature is off until Settings names an item");
  assert(resolveDeliveryItem({ deliveryProductId: "" }, items) === null, "a blank setting is off (how Turn off is stored)");
  assert(resolveDeliveryItem({ deliveryProductId: "svc" }, items)?.id === "svc", "an active service item turns it on");
  assert(resolveDeliveryItem({ deliveryProductId: "gone" }, items) === null, "a deleted item turns it off quietly");
  assert(resolveDeliveryItem({ deliveryProductId: "off" }, items) === null, "an inactive item turns it off quietly");
  assert(resolveDeliveryItem({ deliveryProductId: "gd" }, items) === null, "an item that is not a service is refused (a stocked product has no place here)");

  assert(parseDeliveryAmount("") === 0 && parseDeliveryAmount("abc") === 0 && parseDeliveryAmount("-5") === 0 && parseDeliveryAmount(0) === 0, "blank, junk, negative and zero all mean no delivery");
  assert(parseDeliveryAmount("12.5") === 12.5 && parseDeliveryAmount(300) === 300 && parseDeliveryAmount(" 40 ") === 40, "a real amount is read as typed");
  assert(parseDeliveryAmount(undefined) === 0 && parseDeliveryAmount(null) === 0, "missing is no delivery");

  assert(deliveryTaxFor(100, { salesTaxEnabled: false, salesTaxRatePct: 18 }) === 0, "no tax on delivery when sales tax is off");
  assert(near(deliveryTaxFor(100, { salesTaxEnabled: true, salesTaxRatePct: 18 }), 18), "18% sales tax on a 100 delivery is 18");
  assert(deliveryTaxFor(0, { salesTaxEnabled: true, salesTaxRatePct: 18 }) === 0, "no delivery, no tax");

  const shared = { date: "2026-10-01", customer: "Nimal", customerContact: "077", paymentMethod: "credit" as const, creditTermDays: 14, projectId: "pj", locationId: "loc2", invoiceId: "inv_x" };
  const d = buildDeliverySale({ deliveryProductId: "svc", amount: 250, goods: shared, taxAmount: 0 });
  assert(d.productId === "svc" && d.qty === 1 && d.unitPrice === 250, "delivery is one unit of the delivery item at the typed amount");
  assert(d.invoiceId === "inv_x" && d.customer === "Nimal" && d.date === "2026-10-01" && d.paymentMethod === "credit" && d.creditTermDays === 14 && d.locationId === "loc2" && d.projectId === "pj", "it shares invoice, customer, date, payment, terms, place and project with the goods");
  assert(d.isDelivery === true, "the delivery line is flagged for good (commission and units sold read it)");
  assert(d.taxAmount === undefined && d.currency === undefined && d.exchangeRate === undefined && d.foreignUnitPrice === undefined, "no tax and no foreign fields in the plain case");
  const f = buildDeliverySale({ deliveryProductId: "svc", amount: 50, currency: "USD", exchangeRate: 300, goods: shared, taxAmount: 0 });
  assert(f.unitPrice === 15000 && f.foreignUnitPrice === 50 && f.currency === "USD" && f.exchangeRate === 300, "50 USD at 300 is stored as 15,000 in base, remembering what was charged");
  const t = buildDeliverySale({ deliveryProductId: "svc", amount: 100, goods: shared, taxAmount: 18 });
  assert(t.taxAmount === 18, "tax is carried onto the delivery line");
  assert(newInvoiceId() !== newInvoiceId() && newInvoiceId().startsWith("inv_"), "invoice ids are fresh and recognisable");

  // Tax split across goods + delivery lines always adds up exactly.
  const a = allocateLineTax([333.33, 666.67, 200], 0.18 * 1200);
  assert(near(sum(a), 216, 1e-9) && a.length === 3, "line taxes add up to the invoice tax exactly");
  assert(near(a[0], 0.18 * 333.33, 1e-6) && near(a[1], 0.18 * 666.67, 1e-6), "earlier lines take their proportional share");
  assert(allocateLineTax([0, 0], 5).reduce((x, y) => x + y, 0) === 5 && allocateLineTax([], 5).length === 0, "degenerate inputs are safe");
  let ok = true;
  for (let n = 0; n < 500; n++) {
    const k = 1 + Math.floor(Math.random() * 6);
    const amts = Array.from({ length: k }, () => Math.round(Math.random() * 100000) / 100);
    const tx = Math.round(Math.random() * 50000) / 100;
    if (Math.abs(sum(allocateLineTax(amts, tx)) - tx) > 1e-9) ok = false;
  }
  assert(ok, "500 random invoices: line taxes always sum to the tax total");
}

// --- through the real engine ------------------------------------------------------------------------------------
const goods: Product = { id: "g", name: "Widget", sku: "W", category: "", type: "product", active: true, createdAt: 0 } as Product;
const deliv: Product = { id: "dv", name: "Delivery charge", sku: "DELIVERY", category: "Delivery", type: "service", active: true, createdAt: 0 } as Product;
const stock: Purchase = { id: "pu", productId: "g", qty: 100, unitCost: 60, date: daysAgo(40), paymentMethod: "cash", createdAt: 1 } as Purchase;
const capital: CapitalEntry[] = [{ id: "cap", kind: "investment", amount: 1_000_000, date: daysAgo(400), createdAt: 1 } as CapitalEntry];

function books(sales: Sale[]) {
  const products = [goods, deliv];
  const ledgers = computeAllLedgers(products, [stock], sales, [], [], []);
  const econ = computeSaleEconomics(sales, ledgers, []);
  const pnl = computeMonthlyPnL(sales, econ, [], [stock], [], capital, 0);
  const ar = computeReceivablesAging(products, sales, econ, [], TODAY);
  const bs = computeBalanceSheet(pnl, currentInventoryValue(ledgers), [], computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, 0, [], 0);
  return { ledgers, econ, pnl, ar, bs };
}
const goodsSale = (o: Partial<Sale> = {}): Sale => ({ id: "s1", productId: "g", qty: 10, unitPrice: 100, date: daysAgo(5), paymentMethod: "cash", createdAt: 10, invoiceId: "inv1", ...o } as Sale);
const delivSale = (o: Partial<Sale> = {}): Sale => ({ id: "s2", productId: "dv", qty: 1, unitPrice: 200, date: daysAgo(5), paymentMethod: "cash", createdAt: 11, invoiceId: "inv1", notes: "Delivery", ...o } as Sale);

// Cash sale: 10 x 100 goods (cost 600) + 200 delivery.
{
  const base = books([goodsSale()]);
  // The app always books a delivery line flagged isDelivery (lib/delivery.ts), so the main case uses the flagged line.
  const b = books([goodsSale(), delivSale({ isDelivery: true })]);
  const legacy = books([goodsSale(), delivSale()]);
  // Sum every month: the sales are dated five days ago, which is last month on the first days of a month, so reading only the
  // last row made this check depend on the calendar date.
  const m = (x: typeof b) => {
    const t = { salesRevenue: 0, cogs: 0, unitsSold: 0, grossProfit: 0 };
    for (const r of x.pnl) {
      t.salesRevenue += r.salesRevenue ?? 0;
      t.cogs += r.cogs ?? 0;
      t.unitsSold += r.unitsSold ?? 0;
      t.grossProfit += r.grossProfit ?? 0;
    }
    return t;
  };
  assert(near(m(b).salesRevenue - m(base).salesRevenue, 200), "delivery adds exactly its amount to revenue");
  assert(near(m(b).cogs, m(base).cogs) && near(m(b).cogs, 600), "cost of goods is untouched (delivery has no stock cost)");
  assert(near(b.ledgers.get("g")!.qtyOnHand, 90) && near(b.ledgers.get("g")!.wac, 60), "stock and cost per unit are untouched");
  assert(near(b.bs.cash - base.bs.cash, 200), "a cash delivery charge is 200 more cash");
  const flagged = books([goodsSale(), delivSale({ isDelivery: true })]);
  assert(m(flagged).unitsSold === m(base).unitsSold && m(flagged).unitsSold === 10, "a flagged delivery line is not a unit sold (10 stays 10)");
  assert(m(legacy).unitsSold === 11, "an old unflagged service line still counts as a unit, as any service sale does");
  assert(near(m(flagged).salesRevenue, m(b).salesRevenue), "flagging changes no money, only the unit count");
  assert(near(m(b).grossProfit - m(base).grossProfit, 200), "profit rises by the charge (what delivery costs you is a separate variable cost)");
  assert(b.bs.balances, "balance sheet balances with a delivery line");
}

// Sales tax 10%: goods 1000 -> 100, delivery 200 -> 20. Cash in = 1000 + 200 + 120.
{
  const gs = goodsSale({ taxAmount: 100 });
  const ds = delivSale({ taxAmount: deliveryTaxFor(200, { salesTaxEnabled: true, salesTaxRatePct: 10 }) });
  const base = books([gs]);
  const b = books([gs, ds]);
  assert(near(ds.taxAmount!, 20), "delivery carries 20 of tax at 10%");
  assert(near(b.bs.cash - base.bs.cash, 220), "customer pays 200 + 20 tax for delivery");
  assert(near(b.bs.salesTaxPayable - base.bs.salesTaxPayable, 20), "the 20 is owed on to the tax office");
  assert(b.bs.balances, "balance sheet balances with taxed delivery");
}

// Credit sale: goods and delivery on one invoice are one receivable.
{
  const gs = goodsSale({ paymentMethod: "credit", customer: "Nimal", creditTermDays: 14, dueDate: daysAgo(-9), taxAmount: 100 });
  const ds = delivSale({ paymentMethod: "credit", customer: "Nimal", creditTermDays: 14, dueDate: daysAgo(-9), taxAmount: 20 });
  const b = books([gs, ds]);
  assert(groupSalesByInvoice([gs, ds]).length === 1, "goods and delivery group as one invoice");
  assert(b.ar.lines.length === 1 && b.ar.lines[0].items.length === 2, "one receivable line with two items");
  assert(near(b.ar.totalOutstanding, 1000 + 200 + 120), "Nimal owes goods + delivery + tax = 1,320");
  assert(b.bs.balances, "balance sheet balances with an unpaid delivery");
}

// Foreign currency: 50 USD delivery at 300 books 15,000.
{
  const ds = buildDeliverySale({ deliveryProductId: "dv", amount: 50, currency: "USD", exchangeRate: 300, goods: { date: daysAgo(5), paymentMethod: "cash", invoiceId: "inv1" }, taxAmount: 0 });
  const full = { id: "s2", createdAt: 11, ...ds } as Sale;
  const base = books([goodsSale()]);
  const b = books([goodsSale(), full]);
  assert(near(b.bs.cash - base.bs.cash, 15000), "a 50 USD delivery at 300 is 15,000 of cash");
  assert(b.bs.balances, "balance sheet balances with a foreign-currency delivery");
}

console.log(`\n${pass} passed, ${fail} failed`);
