// Quantity price breaks. An item can carry a few "buy this many or more, pay this each" prices (Product.priceTiers). The
// sale form offers the matching one as a one-tap suggestion when the quantity qualifies; it never changes a price by
// itself, and no figure anywhere is derived from the field. Quantities are in base units (pieces), prices per base unit,
// like every other price on an item; a pack entered on the sale is converted with the same factor wholesale uses.

import { wholesaleEntryPrice } from "./wholesale";

export interface PriceTier {
  minQty: number; // base units: this many or more
  unitPrice: number; // per base unit
}

export const MAX_PRICE_TIERS = 8;

// Stored data is trusted as far as it is well formed: bad rows are dropped, the rest sorted by quantity.
export function cleanTiers(raw: unknown): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceTier[] = [];
  for (const t of raw) {
    const minQty = Number((t as PriceTier)?.minQty);
    const unitPrice = Number((t as PriceTier)?.unitPrice);
    if (Number.isFinite(minQty) && minQty > 0 && Number.isFinite(unitPrice) && unitPrice > 0) out.push({ minQty, unitPrice });
  }
  out.sort((a, b) => a.minQty - b.minQty);
  return out.filter((t, i) => i === 0 || t.minQty !== out[i - 1].minQty).slice(0, MAX_PRICE_TIERS);
}

// "10:90, 50:80" (also ";" or new lines between entries, "=" instead of ":") -> tiers, or the first problem in words.
export function parseTiers(text: string): { tiers: PriceTier[]; error?: string } {
  const parts = (text ?? "").split(/[;,\n]/).map((p) => p.trim()).filter(Boolean);
  const tiers: PriceTier[] = [];
  for (const part of parts) {
    const m = part.match(/^(\d+(?:\.\d+)?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return { tiers: [], error: `"${part}" is not a price break. Write it as quantity:price, like 10:90.` };
    const minQty = Number(m[1]);
    const unitPrice = Number(m[2]);
    if (!(minQty > 0) || !(unitPrice > 0)) return { tiers: [], error: `"${part}": the quantity and the price must both be more than 0.` };
    if (tiers.some((t) => t.minQty === minQty)) return { tiers: [], error: `Quantity ${minQty} appears twice.` };
    tiers.push({ minQty, unitPrice });
  }
  if (tiers.length > MAX_PRICE_TIERS) return { tiers: [], error: `At most ${MAX_PRICE_TIERS} price breaks.` };
  tiers.sort((a, b) => a.minQty - b.minQty);
  return { tiers };
}

export function formatTiers(tiers: PriceTier[] | null | undefined): string {
  return cleanTiers(tiers).map((t) => `${t.minQty}:${t.unitPrice}`).join(", ");
}

// The price per base unit for a quantity: the tier with the largest minimum that the quantity reaches. Undefined when
// the quantity is below every tier (or there are none): then the usual price applies.
export function tierBasePrice(tiers: PriceTier[] | null | undefined, baseQty: number): number | undefined {
  if (!Number.isFinite(baseQty) || baseQty <= 0) return undefined;
  let price: number | undefined;
  for (const t of cleanTiers(tiers)) if (baseQty >= t.minQty) price = t.unitPrice;
  return price;
}

// The same price in the unit being typed (a pack of 12 is 12 times the per-piece price).
export function tierEntryPrice(tiers: PriceTier[] | null | undefined, baseQty: number, unitFactor: number): number | undefined {
  return wholesaleEntryPrice(tierBasePrice(tiers, baseQty), unitFactor);
}
