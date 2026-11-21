// Price control and condition: the two pricing rules electronics brands and buyers ask about.
//
// Minimum advertised price (MAP): the lowest price a brand allows you to advertise or sell a product at. A sale below it is
// flagged so you can see it and talk to the brand or the buyer. Only sales with a price above zero count (a free item is a
// gift or a warranty swap, not a price cut), delivery charges never count, and a promo or discount does count, because it is
// the price actually charged.
//
// Condition: new, open box, refurbished or used. A product with no condition counts as New. Stock is totalled by condition
// so you can see what value sits in refurbished or open-box units.
//
// Pure functions. The app flags and totals. It never changes a price, blocks a sale, or contacts a brand or a buyer.
import type { Product, Sale } from "./types";

export const PRODUCT_CONDITIONS = ["new", "open_box", "refurbished", "used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const CONDITION_LABEL: Record<ProductCondition, string> = {
  new: "New",
  open_box: "Open box",
  refurbished: "Refurbished",
  used: "Used",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateMapPrice(mapPrice: number | undefined): string | null {
  if (mapPrice === undefined) return null;
  if (!Number.isFinite(mapPrice) || mapPrice <= 0) return "The minimum advertised price must be more than zero.";
  return null;
}

export interface BelowMapSale {
  saleId: string;
  date: string;
  productName: string;
  customer?: string;
  qty: number;
  unitPrice: number;
  mapPrice: number;
  shortfallPerUnit: number;
  shortfallTotal: number;
}

// Sales in [from, to] (ISO days, inclusive) charged below their product's MAP. Largest shortfall first.
export function salesBelowMap(sales: Sale[], products: Product[], from: string, to: string): BelowMapSale[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: BelowMapSale[] = [];
  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    if (s.isDelivery) continue;
    if (!(s.unitPrice > 0)) continue;
    const p = byId.get(s.productId);
    if (!p || p.mapPrice === undefined || !(p.mapPrice > 0)) continue;
    if (s.unitPrice >= p.mapPrice) continue;
    const perUnit = round2(p.mapPrice - s.unitPrice);
    out.push({
      saleId: s.id,
      date: s.date,
      productName: p.name,
      customer: s.customer,
      qty: s.qty,
      unitPrice: s.unitPrice,
      mapPrice: p.mapPrice,
      shortfallPerUnit: perUnit,
      shortfallTotal: round2(perUnit * s.qty),
    });
  }
  return out.sort((a, b) => b.shortfallTotal - a.shortfallTotal || a.date.localeCompare(b.date));
}

export interface ConditionRow {
  condition: ProductCondition;
  products: number;
  units: number;
  value: number;
}

// Stock on hand by condition. Only product items with units on hand count; a service has no stock.
export function stockByCondition(products: Product[], qtyOf: (id: string) => number, costOf: (id: string) => number): ConditionRow[] {
  const rows = new Map<ProductCondition, ConditionRow>(
    PRODUCT_CONDITIONS.map((c) => [c, { condition: c, products: 0, units: 0, value: 0 }])
  );
  for (const p of products) {
    if (p.type !== "product") continue;
    const qty = qtyOf(p.id);
    if (!(qty > 0)) continue;
    const key: ProductCondition = p.condition && (PRODUCT_CONDITIONS as readonly string[]).includes(p.condition) ? p.condition : "new";
    const row = rows.get(key)!;
    row.products += 1;
    row.units += qty;
    row.value = round2(row.value + qty * costOf(p.id));
  }
  return [...rows.values()].filter((r) => r.products > 0);
}
