// Empirical check for units of measure (lib/units.ts): packs convert to base units without changing what was
// paid, and the converted purchase goes through the real WAC ledger exactly like one typed in pieces.
// Run: npx tsx scripts/verify-units.ts
import {
  baseUnitLabel, cleanPackSizes, describePackEntry, entryUnitsFor, formatQtyWithUnit, packBreakdown, resolveEntryUnit,
  toBaseQty, toBaseUnitAmount,
} from "../lib/units";
import { computeProductLedger } from "../lib/calculations";
import type { Product, Purchase } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;

const shirt = { baseUnit: "pc", packSizes: [{ id: "k1", name: "Carton", qty: 12 }, { id: "k2", name: "Box", qty: 6 }] } as Pick<Product, "baseUnit" | "packSizes">;
const plain = {} as Pick<Product, "baseUnit" | "packSizes">;

// Entry units: base first, packs smallest to largest; a product with no packs shows only the base unit.
{
  const u = entryUnitsFor(shirt);
  assert(u.length === 3 && u[0].id === "" && u[0].factor === 1 && u[0].name === "pc", "base unit comes first");
  assert(u[1].name === "Box" && u[2].name === "Carton", "packs are ordered smallest to largest");
  assert(entryUnitsFor(plain).length === 1 && entryUnitsFor(plain)[0].name === "each", "no packs -> a single 'each' choice, so no selector is shown");
  assert(entryUnitsFor(undefined).length === 1, "an unknown product is safe");
  assert(resolveEntryUnit(shirt, "k1").factor === 12 && resolveEntryUnit(shirt, "gone").factor === 1, "an unknown pack id falls back to the base unit");
  const bad = entryUnitsFor({ packSizes: [{ id: "x", name: " ", qty: 5 }, { id: "y", name: "Bag", qty: 0 }, { id: "z", name: "Sack", qty: NaN }] } as any);
  assert(bad.length === 1, "blank, zero and NaN packs are ignored");
}

// The conversion: 5 cartons at 1,200 each = 60 pieces at 100 each, and the money paid is the same either way.
{
  const f = 12;
  const qtyBase = toBaseQty(5, f);
  const costBase = toBaseUnitAmount(1200, f);
  assert(qtyBase === 60 && costBase === 100, "5 cartons @ 1,200 -> 60 pc @ 100");
  assert(near(qtyBase * costBase, 5 * 1200), "total paid is unchanged by the conversion (6,000)");
  const odd = toBaseUnitAmount(1000, 12);
  assert(near(toBaseQty(1, 12) * odd, 1000, 1e-9), "an uneven split (1,000 / 12) still multiplies back to exactly 1,000");
  assert(toBaseUnitAmount(50, 0) === 50, "a zero factor can't divide by zero");
}

// The real ledger can't tell a pack purchase from a piece purchase.
{
  const mk = (id: string, qty: number, unitCost: number, date: string): Purchase =>
    ({ id, productId: "a", qty, unitCost, date, createdAt: Date.parse(date), paymentMethod: "cash" } as Purchase);
  const viaPacks = computeProductLedger([mk("p1", toBaseQty(5, 12), toBaseUnitAmount(1200, 12), "2026-01-01"), mk("p2", toBaseQty(2, 12), toBaseUnitAmount(1500, 12), "2026-02-01")], []);
  const viaPieces = computeProductLedger([mk("p1", 60, 100, "2026-01-01"), mk("p2", 24, 125, "2026-02-01")], []);
  assert(viaPacks.qtyOnHand === 84 && near(viaPacks.wac, viaPieces.wac) && near(viaPacks.inventoryValue, viaPieces.inventoryValue), "ledger: packs and pieces give identical stock, WAC and value");
  assert(near(viaPacks.inventoryValue, 5 * 1200 + 2 * 1500), "stock value = what was paid (9,000)");
}

// Describing and displaying.
{
  assert(describePackEntry(5, resolveEntryUnit(shirt, "k1"), shirt) === "5 × Carton (12 pc each)", "the audit note reads naturally");
  assert(describePackEntry(5, resolveEntryUnit(shirt, ""), shirt) === "", "no note when entered in the base unit");
  assert(packBreakdown(63, shirt) === "5 Carton + 3 pc", "63 pc = 5 Carton + 3 pc");
  assert(packBreakdown(66, shirt) === "5 Carton + 1 Box", "66 pc = 5 Carton + 1 Box (greedy, largest first)");
  assert(packBreakdown(72, shirt) === "6 Carton", "72 pc = 6 Carton exactly");
  assert(packBreakdown(5, shirt) === null && packBreakdown(0, shirt) === null && packBreakdown(-3, shirt) === null, "nothing to show when no pack fits, or none / negative stock");
  assert(packBreakdown(30, plain) === null, "no packs -> plain number");
  assert(formatQtyWithUnit(60, shirt) === "60 pc" && formatQtyWithUnit(2.5, { baseUnit: "kg" }) === "2.5 kg" && formatQtyWithUnit(7, plain) === "7", "quantity with its unit");
  assert(baseUnitLabel({ baseUnit: "  kg " }) === "kg", "unit labels are trimmed");
}

// Validation of the pack editor.
{
  const ok = cleanPackSizes([{ id: "a", name: " Carton ", qty: "12" }, { id: "b", name: "", qty: "" }], "pc");
  assert(!ok.error && ok.packs.length === 1 && ok.packs[0].name === "Carton" && ok.packs[0].qty === 12, "a good row is kept (trimmed); an untouched blank row is dropped");
  assert(!!cleanPackSizes([{ id: "a", name: "", qty: "12" }], "pc").error, "a pack with no name is refused");
  assert(!!cleanPackSizes([{ id: "a", name: "Carton", qty: "1" }], "pc").error, "a 'pack of 1' is refused (that is just the base unit)");
  assert(!!cleanPackSizes([{ id: "a", name: "Carton", qty: "abc" }], "pc").error, "a non-number is refused");
  assert(!!cleanPackSizes([{ id: "a", name: "Carton", qty: "12" }, { id: "b", name: "carton", qty: "24" }], "pc").error, "two packs with the same name (any case) are refused");
  assert(!!cleanPackSizes([{ id: "a", name: "PC", qty: "12" }], "pc").error, "a pack named like the base unit is refused");
  assert(!!cleanPackSizes([{ id: "a", name: "Pallet", qty: "99999999" }], "pc").error, "an absurd pack size is refused");
  assert(cleanPackSizes([{ id: "a", name: "Roll", qty: "2.5" }], "m").packs[0].qty === 2.5, "a fractional pack (a 2.5 m roll) is allowed");
}
console.log(`\n${pass} passed, ${fail} failed`);
