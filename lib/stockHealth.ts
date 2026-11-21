// Slow stock: cash sitting on the shelf in items that have stopped selling.
//
// Pure function over records the app already holds (no new data, no settings, nothing stored).
// An item is "slow" when units are on hand and it has not sold for `thresholdDays` or more:
//   - it has sold before  -> days since its most recent sale;
//   - it has never sold   -> days since it was first bought (so brand-new stock is never flagged).
// Items with no purchase and no sale on record have nothing to measure from and are left out
// rather than guessed at. Value is the stock's cost (weighted average), the same figure the
// Balance Sheet uses, so the total here can never disagree with Inventory on the books.

import type { Product, Purchase, Sale } from "./types";
import type { ProductLedgerResult } from "./calculations";

export const DEFAULT_SLOW_STOCK_DAYS = 90;

export interface SlowStockItem {
  productId: string;
  name: string;
  qtyOnHand: number;
  value: number; // at cost
  lastSoldDate: string | null; // ISO date, null when never sold
  idleDays: number; // days since last sale (or since first purchase when never sold)
  neverSold: boolean;
}

export interface SlowStockSummary {
  items: SlowStockItem[]; // biggest tied-up value first
  totalValue: number;
  totalInventoryValue: number;
  sharePct: number; // slow value as % of all stock value, 0 when there is no stock
  thresholdDays: number;
}

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

export function computeSlowStock(
  products: Product[],
  ledgers: Map<string, ProductLedgerResult>,
  sales: Sale[],
  purchases: Purchase[],
  asOfIso: string,
  thresholdDays: number = DEFAULT_SLOW_STOCK_DAYS
): SlowStockSummary {
  const today = dayNumber(asOfIso);
  const lastSale = new Map<string, string>();
  for (const s of sales) {
    if (!s.productId || dayNumber(s.date) === null || s.date > asOfIso) continue;
    const prev = lastSale.get(s.productId);
    if (!prev || s.date > prev) lastSale.set(s.productId, s.date);
  }
  const firstBuy = new Map<string, string>();
  for (const p of purchases) {
    if (!p.productId || dayNumber(p.date) === null || p.date > asOfIso) continue;
    const prev = firstBuy.get(p.productId);
    if (!prev || p.date < prev) firstBuy.set(p.productId, p.date);
  }

  let totalInventoryValue = 0;
  for (const l of ledgers.values()) totalInventoryValue += Math.max(l.inventoryValue, 0);

  const items: SlowStockItem[] = [];
  if (today !== null) {
    for (const p of products) {
      if (p.type !== "product" || !p.active) continue;
      const l = ledgers.get(p.id);
      if (!l || !(l.qtyOnHand > 0) || !(l.inventoryValue > 0)) continue;
      const sold = lastSale.get(p.id) ?? null;
      const reference = sold ?? firstBuy.get(p.id) ?? null;
      if (!reference) continue;
      const ref = dayNumber(reference);
      if (ref === null) continue;
      const idleDays = today - ref;
      if (idleDays < thresholdDays) continue;
      items.push({
        productId: p.id,
        name: p.name,
        qtyOnHand: l.qtyOnHand,
        value: l.inventoryValue,
        lastSoldDate: sold,
        idleDays,
        neverSold: sold === null,
      });
    }
  }
  items.sort((a, b) => b.value - a.value || b.idleDays - a.idleDays);
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  return {
    items,
    totalValue,
    totalInventoryValue,
    sharePct: totalInventoryValue > 0 ? (totalValue / totalInventoryValue) * 100 : 0,
    thresholdDays,
  };
}
