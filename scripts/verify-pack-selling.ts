// Empirical check for selling by the pack (lib/units.ts used on the sale forms): a sale typed in cartons is stored
// as the same sale typed in pieces, so stock, cost of goods, revenue, tax and the balance sheet cannot tell them apart.
// Run: npx tsx scripts/verify-pack-selling.ts
import { describePackEntry, entryUnitsFor, resolveEntryUnit, toBaseQty, toBaseUnitAmount, formatQtyWithUnit } from "../lib/units";
import {
  computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import { allocateLineTax } from "../lib/delivery";
import type { CapitalEntry, Product, Purchase, Sale } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const NOW = new Date();
const day = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));

const prod = { id: "t", name: "Tee", sku: "T", category: "", type: "product", active: true, createdAt: 0, baseUnit: "pc", packSizes: [{ id: "k", name: "Carton", qty: 12 }, { id: "b", name: "Box", qty: 6 }] } as Product;
const stock: Purchase = { id: "pu", productId: "t", qty: 120, unitCost: 50, date: day(30), paymentMethod: "cash", createdAt: 1 } as Purchase;
const cap: CapitalEntry[] = [{ id: "c", kind: "investment", amount: 1_000_000, date: day(400), createdAt: 1 } as CapitalEntry];

// What the form does: entered qty and price per ENTRY unit -> base units and base price.
function fromForm(qtyEntered: number, pricePerEntry: number, unitId: string) {
  const u = resolveEntryUnit(prod, unitId);
  return { qty: toBaseQty(qtyEntered, u.factor), unitPrice: toBaseUnitAmount(pricePerEntry, u.factor), unit: u };
}
function books(sale: Sale) {
  const P = [prod];
  const l = computeAllLedgers(P, [stock], [sale], [], [], []);
  const e = computeSaleEconomics([sale], l, []);
  const m = computeMonthlyPnL([sale], e, [], [stock], [], cap, 0);
  const b = computeBalanceSheet(m, currentInventoryValue(l), [], computeCapitalSummary(cap, m), day(0), [], 0, 0, [], 0);
  return { l, e, m, b };
}
const mk = (qty: number, unitPrice: number, extra: Partial<Sale> = {}): Sale => ({ id: "s", productId: "t", qty, unitPrice, date: day(3), paymentMethod: "cash", createdAt: 5, ...extra } as Sale);

// 5 cartons at 1,200 each = 60 pcs at 100 each.
{
  const f = fromForm(5, 1200, "k");
  assert(f.qty === 60 && near(f.unitPrice, 100), "5 cartons of 12 at 1,200 is 60 pc at 100");
  const packed = books(mk(f.qty, f.unitPrice));
  const pieces = books(mk(60, 100));
  assert(near(packed.l.get("t")!.qtyOnHand, 60) && near(packed.l.get("t")!.qtyOnHand, pieces.l.get("t")!.qtyOnHand), "60 pieces left either way");
  assert(near(packed.e[0].revenue, 6000) && near(packed.e[0].cogs, 3000), "revenue 6,000 and cost 3,000");
  assert(JSON.stringify(packed.m) === JSON.stringify(pieces.m), "the monthly books are identical to a sale typed in pieces");
  assert(packed.b.balances && near(packed.b.cash, pieces.b.cash), "balance sheet balances and cash matches");
}

// A price that does not divide evenly still adds back to what was typed: 7 cartons at 100 (12 each) = 700.
{
  const f = fromForm(7, 100, "k");
  assert(f.qty === 84 && near(f.qty * f.unitPrice, 700, 1e-9), "84 pc at 100/12 each still totals exactly 700");
  const b = books(mk(f.qty, f.unitPrice));
  assert(near(b.e[0].revenue, 700, 1e-9) && b.b.balances, "revenue is 700 and the books balance");
}

// Boxes of 6, pieces, and an unknown pack id.
{
  assert(fromForm(3, 270, "b").qty === 18 && near(fromForm(3, 270, "b").unitPrice, 45), "3 boxes of 6 at 270 is 18 pc at 45");
  assert(fromForm(4, 99, "").qty === 4 && fromForm(4, 99, "").unitPrice === 99, "pieces are unchanged");
  assert(fromForm(2, 10, "gone").qty === 2, "an unknown pack falls back to pieces");
  const names = entryUnitsFor(prod).map((u) => u.name);
  assert(names.join() === "pc,Box,Carton", "selector order is pieces, then packs smallest to largest");
}

// With tax: tax is on the revenue, which does not depend on the unit typed.
{
  const f = fromForm(5, 1200, "k");
  const tax = f.qty * f.unitPrice * 0.1;
  const b = books(mk(f.qty, f.unitPrice, { taxAmount: tax }));
  const p = books(mk(60, 100, { taxAmount: 600 }));
  assert(near(tax, 600) && near(b.b.cash, p.b.cash) && b.b.balances, "10% tax on 6,000 is 600 whether typed in cartons or pieces");
}

// What the note and messages say.
{
  const u = resolveEntryUnit(prod, "k");
  assert(describePackEntry(5, u, prod) === "5 × Carton (12 pc each)", "the sale note keeps what was typed");
  assert(describePackEntry(5, resolveEntryUnit(prod, ""), prod) === "", "no note when sold in pieces");
  assert(formatQtyWithUnit(60, prod) === "60 pc", "stock is shown in the base unit");
}

// Invoice with a pack line and a piece line: line taxes still add up to the invoice tax.
{
  const lines = [fromForm(2, 1200, "k"), fromForm(5, 100, "")];
  const amounts = [2 * 1200, 5 * 100];
  const tax = allocateLineTax(amounts, 0.1 * (amounts[0] + amounts[1]));
  assert(near(tax[0] + tax[1], 290, 1e-9) && lines[0].qty === 24, "a mixed pack/piece invoice splits its 290 of tax exactly");
}

console.log(`\n${pass} passed, ${fail} failed`);
