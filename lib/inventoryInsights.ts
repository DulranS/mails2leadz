// Stock over time: what the business's inventory was worth at the end of each past month, how long what it
// holds now will last at the recent selling pace, and how much cash is sitting in stock that has stopped selling.
//
// Pure functions, no I/O. The past is a REPLAY of the same weighted-average-cost ledger the rest of the app uses
// (computeProductLedger), run over only the purchases, sales, returns, supplier returns and adjustments dated on or before each
// month-end, so the latest point always equals today's inventory on the Balance Sheet.
import { computeProductLedger, estimateAnnualDemand } from "./calculations";
import type { CostingMethod, Product, Purchase, Sale, SaleReturn, StockAdjustment, SupplierReturn } from "./types";

export interface StockValuePoint {
  date: string; // the day this point is as of (a month-end, or today for the current month)
  month: string; // "YYYY-MM"
  value: number; // inventory at weighted average cost
  units: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// Last calendar day of the month that is `back` months before the month of `iso`.
function monthEnd(iso: string, back: number): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - back + 1, 0)).toISOString().slice(0, 10);
}

function groupBy<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.productId);
    if (list) list.push(r);
    else map.set(r.productId, [r]);
  }
  return map;
}

// Inventory value at the end of each of the last `months` months (oldest first). The newest point is `asOfISO`
// itself, not the month-end, because the current month is not over.
export function stockValueHistory(
  products: Product[],
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[],
  adjustments: StockAdjustment[],
  asOfISO: string,
  months = 12,
  supplierReturns: SupplierReturn[] = [],
  method: CostingMethod = "average"
): StockValuePoint[] {
  const n = Math.max(1, Math.min(60, Math.round(months)));
  const pBy = groupBy(purchases);
  const sBy = groupBy(sales);
  const rBy = groupBy(returns);
  const aBy = groupBy(adjustments);
  const srBy = groupBy(supplierReturns);
  const points: StockValuePoint[] = [];
  for (let back = n - 1; back >= 0; back--) {
    const date = back === 0 ? asOfISO : monthEnd(asOfISO, back);
    let value = 0;
    let units = 0;
    for (const p of products) {
      const l = computeProductLedger(
        (pBy.get(p.id) ?? []).filter((x) => x.date <= date),
        (sBy.get(p.id) ?? []).filter((x) => x.date <= date),
        (rBy.get(p.id) ?? []).filter((x) => x.date <= date),
        (aBy.get(p.id) ?? []).filter((x) => x.date <= date),
        (srBy.get(p.id) ?? []).filter((x) => x.date <= date),
        method
      );
      value += l.inventoryValue;
      units += Math.max(l.qtyOnHand, 0);
    }
    points.push({ date, month: date.slice(0, 7), value, units });
  }
  return points;
}

export interface StockCoverLine {
  productId: string;
  name: string;
  qtyOnHand: number;
  value: number;
  dailyDemand: number; // units a day at the recent pace
  coverDays: number | null; // null when it isn't selling, so there is no pace to measure against
  lastSaleDate: string | null;
  daysSinceLastSale: number | null; // null when it has never sold
  daysHeld: number | null; // since the first purchase on record
}

export interface StockCover {
  asOf: string;
  totalValue: number;
  runningLow: StockCoverLine[]; // will run out within `lowCoverDays` at the recent pace, soonest first
  slow: StockCoverLine[]; // stock on the shelf that has not sold for `slowAfterDays`, biggest cash first
  slowValue: number;
  slowSharePct: number | null; // of all stock value
}

export const LOW_COVER_DAYS = 30;
export const SLOW_AFTER_DAYS = 90;

export function computeStockCover(
  products: Product[],
  ledgers: Map<string, { qtyOnHand: number; inventoryValue: number }>,
  purchases: Purchase[],
  sales: Sale[],
  asOfISO: string
): StockCover {
  const pBy = groupBy(purchases);
  const sBy = groupBy(sales);
  const lines: StockCoverLine[] = [];
  let totalValue = 0;
  for (const p of products) {
    const l = ledgers.get(p.id);
    if (!l) continue;
    totalValue += Math.max(l.inventoryValue, 0);
    if (!(l.qtyOnHand > 0)) continue;
    const mySales = sBy.get(p.id) ?? [];
    const myPurchases = pBy.get(p.id) ?? [];
    const lastSaleDate = mySales.reduce<string | null>((m, s) => (s.date <= asOfISO && (m === null || s.date > m) ? s.date : m), null);
    const firstBuy = myPurchases.reduce<string | null>((m, x) => (m === null || x.date < m ? x.date : m), null);
    const dailyDemand = estimateAnnualDemand(mySales, p.id, asOfISO) / 365;
    lines.push({
      productId: p.id, name: p.name, qtyOnHand: l.qtyOnHand, value: l.inventoryValue, dailyDemand,
      coverDays: dailyDemand > 0 ? l.qtyOnHand / dailyDemand : null,
      lastSaleDate, daysSinceLastSale: lastSaleDate ? Math.max(0, daysBetween(lastSaleDate, asOfISO)) : null,
      daysHeld: firstBuy ? Math.max(0, daysBetween(firstBuy, asOfISO)) : null,
    });
  }
  // "Slow" means it has had a fair chance to sell and hasn't: no sale in 90+ days, or never sold but held that long.
  const isSlow = (x: StockCoverLine) =>
    x.value > 0 && (x.daysSinceLastSale !== null ? x.daysSinceLastSale >= SLOW_AFTER_DAYS : (x.daysHeld ?? 0) >= SLOW_AFTER_DAYS);
  const slow = lines.filter(isSlow).sort((a, b) => b.value - a.value);
  const slowValue = slow.reduce((t, x) => t + x.value, 0);
  const runningLow = lines
    .filter((x) => x.coverDays !== null && x.coverDays <= LOW_COVER_DAYS && !isSlow(x))
    .sort((a, b) => (a.coverDays as number) - (b.coverDays as number));
  return { asOf: asOfISO, totalValue, runningLow, slow, slowValue, slowSharePct: totalValue > 0 ? (slowValue / totalValue) * 100 : null };
}
