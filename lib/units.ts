// Units of measure: buy by the carton, count and sell by the piece.
//
// Everything stored — stock, cost, price — is per BASE unit. Packs exist only at the moment of data entry:
// the forms turn "5 cartons at 1,200 each" into "60 pieces at 100 each" with the helpers below, then save
// exactly what they always saved. That is the whole design: no ledger, margin, report or backup code had to
// change, and a purchase made in packs is indistinguishable from one typed in pieces.
//
// Pure functions, no I/O (see scripts/verify-units.ts).
import type { PackSize, Product } from "./types";

// A way of entering a quantity: the base unit itself (id "") or one of the product's packs.
export interface EntryUnit {
  id: string; // "" = the base unit
  name: string;
  factor: number; // base units in one of these
}

export const MAX_PACK_QTY = 1_000_000;

export function baseUnitLabel(p: Pick<Product, "baseUnit"> | undefined): string {
  return p?.baseUnit?.trim() || "";
}

// Base unit first, then the packs, largest last. Always at least the base unit, so a product with no packs
// yields a single entry and the form shows no selector.
export function entryUnitsFor(p: Pick<Product, "baseUnit" | "packSizes"> | undefined): EntryUnit[] {
  const base: EntryUnit = { id: "", name: baseUnitLabel(p) || "each", factor: 1 };
  const packs = (p?.packSizes ?? [])
    .filter((k) => k && k.name?.trim() && Number.isFinite(k.qty) && k.qty > 0)
    .map((k) => ({ id: k.id, name: k.name.trim(), factor: k.qty }))
    .sort((a, b) => a.factor - b.factor);
  return [base, ...packs];
}

export function resolveEntryUnit(p: Pick<Product, "baseUnit" | "packSizes"> | undefined, id: string): EntryUnit {
  const all = entryUnitsFor(p);
  return all.find((u) => u.id === id) ?? all[0];
}

// How many base units `qty` of an entry unit is.
export function toBaseQty(qty: number, factor: number): number {
  return qty * factor;
}

// The price/cost of ONE base unit, given the price/cost of ONE entry unit.
export function toBaseUnitAmount(amountPerEntryUnit: number, factor: number): number {
  return factor > 0 ? amountPerEntryUnit / factor : amountPerEntryUnit;
}

const trim = (n: number) => String(Math.round(n * 10000) / 10000);

// "5 × Carton (12 pc each)" — recorded in a purchase's notes so what was actually typed is never lost.
export function describePackEntry(qty: number, unit: EntryUnit, p: Pick<Product, "baseUnit"> | undefined): string {
  if (unit.id === "") return "";
  const base = baseUnitLabel(p) || "unit";
  return `${trim(qty)} × ${unit.name} (${trim(unit.factor)} ${base} each)`;
}

// Stock expressed in packs where it fits: 63 pieces with a carton of 12 -> "5 Carton + 3 pc". Null when no pack
// fits at all (or the product has none), so callers simply show the plain number.
export function packBreakdown(qtyBase: number, p: Pick<Product, "baseUnit" | "packSizes"> | undefined): string | null {
  if (!(qtyBase > 0)) return null;
  const packs = entryUnitsFor(p).filter((u) => u.id !== "").sort((a, b) => b.factor - a.factor);
  if (packs.length === 0) return null;
  let rest = qtyBase;
  const parts: string[] = [];
  for (const k of packs) {
    const n = Math.floor(rest / k.factor + 1e-9);
    if (n >= 1) {
      parts.push(`${n} ${k.name}`);
      rest -= n * k.factor;
    }
  }
  if (parts.length === 0) return null;
  if (rest > 1e-9) parts.push(`${trim(rest)} ${baseUnitLabel(p) || "left"}`);
  return parts.join(" + ");
}

// "60 pc", or just "60" when the product has no unit label.
export function formatQtyWithUnit(qty: number, p: Pick<Product, "baseUnit"> | undefined): string {
  const u = baseUnitLabel(p);
  const n = Number.isInteger(qty) ? String(qty) : trim(qty);
  return u ? `${n} ${u}` : n;
}

// Checks what the person typed into the pack-size editor and returns the clean list, or the first problem in plain
// words. A pack must hold more than one base unit (a "pack of 1" is just the base unit) and names must differ
// from each other and from the base unit, or the selector would show two identical choices.
export function cleanPackSizes(
  rows: { id: string; name: string; qty: string | number }[],
  baseUnit: string
): { packs: PackSize[]; error?: string } {
  const packs: PackSize[] = [];
  const seen = new Set<string>([baseUnit.trim().toLowerCase()].filter(Boolean));
  for (const r of rows) {
    const name = r.name.trim();
    const rawQty = typeof r.qty === "number" ? r.qty : r.qty.trim() === "" ? NaN : Number(r.qty);
    if (!name && (r.qty === "" || r.qty === undefined)) continue; // an untouched blank row
    if (!name) return { packs: [], error: "Give each pack a name, like Carton or Box." };
    if (!Number.isFinite(rawQty) || rawQty <= 1) return { packs: [], error: `How many ${baseUnit.trim() || "units"} are in a ${name}? It has to be more than 1.` };
    if (rawQty > MAX_PACK_QTY) return { packs: [], error: `${name}: that is too many per pack.` };
    const key = name.toLowerCase();
    if (seen.has(key)) return { packs: [], error: `"${name}" is used twice. Each pack needs its own name.` };
    seen.add(key);
    packs.push({ id: r.id, name, qty: rawQty });
  }
  return { packs };
}
