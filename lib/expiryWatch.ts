// Expiry watch: which units on the shelf are about to pass their use-by date, or already have.
// Pure functions, no I/O (see scripts/verify-expiry-watch.ts).
//
// Each Purchase may carry an expiry date and a batch/lot reference (Purchase.expiryDate / batchRef). The app does not
// track which physical unit was sold, so the units still on hand are matched to deliveries on the usual
// "oldest stock sells first" basis: what remains belongs to the NEWEST deliveries. That is an estimate and is
// labelled as one on screen. It changes no cost, stock, cash or profit; it only warns.
// A written-off batch is recorded as an ordinary stock adjustment (reason "expired"), which lowers the units on hand and
// so shrinks what this reports for the same product.
import type { Product, Purchase } from "./types";

export const DEFAULT_EXPIRY_WINDOW_DAYS = 30;

export type ExpiryStatus = "expired" | "soon" | "ok";

export interface ExpiryRow {
  productId: string;
  productName: string;
  purchaseId: string;
  batchRef?: string;
  supplier?: string;
  receivedDate: string;
  expiryDate: string;
  daysLeft: number; // negative once expired
  unitsLeft: number; // estimate: units of this delivery still on hand
  unitCost: number;
  valueAtCost: number; // unitsLeft x unitCost
  status: ExpiryStatus;
}

export interface ExpiryBucket {
  count: number; // deliveries
  units: number;
  value: number;
}

export interface ExpirySummary {
  asOf: string;
  windowDays: number;
  rows: ExpiryRow[]; // soonest to expire first
  expired: ExpiryBucket;
  soon: ExpiryBucket;
  ok: ExpiryBucket;
  tracked: boolean; // any purchase at all carries an expiry date
}

const EPS = 0.005;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysUntil(expiryISO: string, asOfISO: string): number {
  return dayNumber(expiryISO) - dayNumber(asOfISO);
}

export function computeExpiryWatch(
  products: Pick<Product, "id" | "name" | "type">[],
  purchases: Purchase[],
  onHandByProduct: Map<string, number>,
  asOfISO: string,
  windowDays: number = DEFAULT_EXPIRY_WINDOW_DAYS
): ExpirySummary {
  const productById = new Map(products.map((p) => [p.id, p]));
  const byProduct = new Map<string, Purchase[]>();
  let tracked = false;
  for (const p of purchases) {
    if (p.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate)) tracked = true;
    const prod = productById.get(p.productId);
    if (!prod || prod.type === "service") continue;
    const list = byProduct.get(p.productId) ?? [];
    list.push(p);
    byProduct.set(p.productId, list);
  }

  const rows: ExpiryRow[] = [];
  for (const [productId, list] of byProduct) {
    let remaining = Math.max(0, onHandByProduct.get(productId) ?? 0);
    // Newest delivery first: that is where the units still on hand are assumed to have come from.
    const newestFirst = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    for (const p of newestFirst) {
      if (remaining <= EPS) break;
      const take = Math.min(p.qty, remaining);
      remaining -= take;
      if (!p.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate) || take <= EPS) continue;
      const daysLeft = daysUntil(p.expiryDate, asOfISO);
      rows.push({
        productId,
        productName: productById.get(productId)?.name ?? "Product",
        purchaseId: p.id,
        batchRef: p.batchRef,
        supplier: p.supplier,
        receivedDate: p.date,
        expiryDate: p.expiryDate,
        daysLeft,
        unitsLeft: take,
        unitCost: p.unitCost,
        valueAtCost: take * p.unitCost,
        status: daysLeft < 0 ? "expired" : daysLeft <= windowDays ? "soon" : "ok",
      });
    }
  }
  rows.sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : a.productName.localeCompare(b.productName)));

  const bucket = (s: ExpiryStatus): ExpiryBucket => {
    const xs = rows.filter((r) => r.status === s);
    return { count: xs.length, units: xs.reduce((n, r) => n + r.unitsLeft, 0), value: xs.reduce((n, r) => n + r.valueAtCost, 0) };
  };
  return { asOf: asOfISO, windowDays, rows, expired: bucket("expired"), soon: bucket("soon"), ok: bucket("ok"), tracked };
}
