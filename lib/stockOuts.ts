// Costing of stock-outs: what running out cost, from the lost sales you logged (StockOut in lib/types.ts).
// Memo only. Nothing here reads or writes the books. Pure functions, no I/O (see scripts/verify-stock-outs.ts).
import type { Product, StockOut } from "./types";

export interface StockOutLoss {
  units: number;
  lostRevenue: number;
  lostMargin: number; // revenue less what the units would have cost you; entries without a cost count their full price
  events: number;
}

export interface StockOutByProduct extends StockOutLoss {
  productId: string;
  productName: string;
  lastDate: string;
}

const finite = (n: unknown, d = 0): number => (typeof n === "number" && Number.isFinite(n) ? n : d);

export function stockOutRevenue(r: Pick<StockOut, "qty" | "unitPrice">): number {
  return Math.max(0, finite(r.qty)) * Math.max(0, finite(r.unitPrice));
}

// Margin lost on one entry. A missing cost is treated as unknown-so-zero-cost would overstate it, hence it is
// reported as revenue only by the caller; here an absent cost means the whole price is counted, flagged by hasCost.
export function stockOutMargin(r: Pick<StockOut, "qty" | "unitPrice" | "unitCost">): number {
  const q = Math.max(0, finite(r.qty));
  const cost = r.unitCost === undefined ? 0 : Math.max(0, finite(r.unitCost));
  return q * (Math.max(0, finite(r.unitPrice)) - cost);
}

const inRange = (date: string, fromISO?: string, toISO?: string) => (!fromISO || date >= fromISO) && (!toISO || date <= toISO);

export function summarizeStockOuts(records: StockOut[], opts: { fromISO?: string; toISO?: string } = {}): StockOutLoss {
  let units = 0, lostRevenue = 0, lostMargin = 0, events = 0;
  for (const r of records) {
    if (!inRange(r.date, opts.fromISO, opts.toISO)) continue;
    if (!(finite(r.qty) > 0)) continue;
    units += r.qty;
    lostRevenue += stockOutRevenue(r);
    lostMargin += stockOutMargin(r);
    events += 1;
  }
  return { units, lostRevenue, lostMargin, events };
}

// One row per product, biggest margin lost first, so the item that is costing you most to run out of is on top.
export function stockOutsByProduct(records: StockOut[], products: Pick<Product, "id" | "name">[], opts: { fromISO?: string; toISO?: string } = {}): StockOutByProduct[] {
  const names = new Map(products.map((p) => [p.id, p.name]));
  const by = new Map<string, StockOutByProduct>();
  for (const r of records) {
    if (!inRange(r.date, opts.fromISO, opts.toISO)) continue;
    if (!(finite(r.qty) > 0)) continue;
    const row = by.get(r.productId) ?? { productId: r.productId, productName: names.get(r.productId) ?? "—", units: 0, lostRevenue: 0, lostMargin: 0, events: 0, lastDate: "" };
    row.units += r.qty;
    row.lostRevenue += stockOutRevenue(r);
    row.lostMargin += stockOutMargin(r);
    row.events += 1;
    if (r.date > row.lastDate) row.lastDate = r.date;
    by.set(r.productId, row);
  }
  return [...by.values()].sort((a, b) => b.lostMargin - a.lostMargin || b.lostRevenue - a.lostRevenue);
}

// How many units short a sale of `wanted` is, given what is on hand. 0 when stock covers it (or nothing is wanted).
export function shortfall(wanted: number, onHand: number): number {
  const w = finite(wanted), h = Math.max(0, finite(onHand));
  return w > h ? w - h : 0;
}
