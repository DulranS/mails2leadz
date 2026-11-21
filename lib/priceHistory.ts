// Price history (v186b): a record of every change to a product's sell, cost or wholesale price, so pricing decisions and margin
// disputes can be traced. Pure: no I/O. The record is appended in the same write as the change (see DataContext.updateProduct).
export type PriceField = "sell" | "cost" | "wholesale";

export const PRICE_FIELD_LABEL: Record<PriceField, string> = { sell: "Sell price", cost: "Cost price", wholesale: "Wholesale price" };

export interface PriceChange {
  id: string;
  productId: string;
  productName: string;
  field: PriceField;
  oldValue?: number;
  newValue?: number;
  changedAt: number;
  changedByUid?: string;
  changedByName?: string;
}

const FIELDS: { field: PriceField; key: "defaultSellPrice" | "defaultCostPrice" | "wholesalePrice" }[] = [
  { field: "sell", key: "defaultSellPrice" },
  { field: "cost", key: "defaultCostPrice" },
  { field: "wholesale", key: "wholesalePrice" },
];

// The changes a product update makes to its prices. A price set for the first time, changed, or cleared is recorded; an unchanged
// price is not. `patch` holds only the fields the update sets (undefined means "not part of this update").
export function priceChangesFor(
  before: { defaultSellPrice?: number; defaultCostPrice?: number; wholesalePrice?: number },
  patch: { defaultSellPrice?: number | null; defaultCostPrice?: number | null; wholesalePrice?: number | null },
): { field: PriceField; oldValue?: number; newValue?: number }[] {
  const out: { field: PriceField; oldValue?: number; newValue?: number }[] = [];
  for (const { field, key } of FIELDS) {
    if (!(key in patch)) continue;
    const oldValue = typeof before[key] === "number" ? (before[key] as number) : undefined;
    const raw = patch[key];
    const newValue = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
    if (oldValue === newValue) continue;
    out.push({ field, ...(oldValue !== undefined ? { oldValue } : {}), ...(newValue !== undefined ? { newValue } : {}) });
  }
  return out;
}

// The change in percent between two prices, or null when either is missing or the old price was zero.
export function changePercent(oldValue: number | undefined, newValue: number | undefined): number | null {
  if (typeof oldValue !== "number" || typeof newValue !== "number" || oldValue === 0) return null;
  return Math.round(((newValue - oldValue) / oldValue) * 1000) / 10;
}
