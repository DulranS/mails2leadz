// Quantity pricing (v225b): a price for buying in quantity ("10 or more at 5% off, 50 or more at 10% off") and what it does to the margin.
// This is a check before an order is agreed; it records no sale and changes no price. Pure: no I/O.

export interface QuantityTier { minQty: number; discountPct: number }

export function parseTiers(text: string): { tiers: QuantityTier[]; errors: string[] } {
  const tiers: QuantityTier[] = [], errors: string[] = [];
  for (const raw of text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    const [q, d] = raw.split(":").map((s) => Number(s.trim()));
    if (!Number.isFinite(q) || !Number.isFinite(d) || q < 1 || d < 0 || d > 100 || raw.split(":").length !== 2) {
      errors.push(`"${raw}" is not "minimum quantity:discount %".`);
      continue;
    }
    tiers.push({ minQty: Math.floor(q), discountPct: d });
  }
  return { tiers: tiers.sort((a, b) => a.minQty - b.minQty), errors };
}

// The discount for a quantity: the deepest tier the quantity reaches.
export function discountFor(qty: number, tiers: QuantityTier[]): number {
  return tiers.filter((t) => qty >= t.minQty).reduce((best, t) => Math.max(best, t.discountPct), 0);
}

export interface OrderPrice {
  qty: number;
  listUnitPrice: number;
  discountPct: number;
  unitPrice: number;
  total: number;
  unitCost: number;
  marginPct: number | null; // margin on the discounted price; null if there is no price
  marginAmount: number;
  belowFloor: boolean; // the margin falls below the floor the business has set
}

export function orderPrice(i: { qty: number; listUnitPrice: number; unitCost: number; tiers: QuantityTier[]; marginFloorPct: number }): OrderPrice {
  const discountPct = discountFor(i.qty, i.tiers);
  const unitPrice = Math.round(i.listUnitPrice * (1 - discountPct / 100) * 100) / 100;
  const total = Math.round(unitPrice * i.qty * 100) / 100;
  const marginAmount = Math.round((unitPrice - i.unitCost) * i.qty * 100) / 100;
  const marginPct = unitPrice > 0 ? Math.round(((unitPrice - i.unitCost) / unitPrice) * 1000) / 10 : null;
  return {
    qty: i.qty,
    listUnitPrice: i.listUnitPrice,
    discountPct,
    unitPrice,
    total,
    unitCost: i.unitCost,
    marginPct,
    marginAmount,
    belowFloor: marginPct === null || marginPct < i.marginFloorPct,
  };
}
