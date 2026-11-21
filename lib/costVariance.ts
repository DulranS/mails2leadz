// Cost variance (v210b): what was quoted for each received purchase against what was actually paid. A purchase that cost more than
// quoted, or less, changes the cost of stock and the margin on what it becomes; this shows it, by purchase and by supplier, from the
// purchase orders already recorded. Pure: no I/O. Nothing is restated here; the books carry what was paid.

export const VARIANCE_ALERT_PCT = 5; // a purchase at least this far from its quote is listed

export interface CostVarianceRow {
  purchaseId: string;
  productId: string;
  supplier: string;
  quotedUnitCost: number;
  paidUnitCost: number;
  qty: number; // units received (or ordered, when the receipt quantity is not recorded)
  variancePct: number; // (paid - quoted) / quoted, as a percentage
  impact: number; // (paid - quoted) x qty: positive means it cost more than quoted
}

export interface SupplierCostVariance {
  supplier: string;
  purchases: number; // received purchases with both prices
  averageVariancePct: number;
  totalImpact: number;
  flagged: number; // purchases at or beyond the alert threshold
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costVariance(
  orders: { id: string; productId: string; supplier?: string; status: string; unitCost: number; receivedUnitCost?: number; qtyOrdered: number; qtyReceived?: number }[],
  alertPct = VARIANCE_ALERT_PCT,
): { rows: CostVarianceRow[]; bySupplier: SupplierCostVariance[] } {
  const rows: CostVarianceRow[] = [];
  for (const o of orders) {
    if (o.status !== "received" || typeof o.receivedUnitCost !== "number" || !(o.unitCost > 0)) continue;
    const qty = typeof o.qtyReceived === "number" && o.qtyReceived > 0 ? o.qtyReceived : o.qtyOrdered;
    const variancePct = ((o.receivedUnitCost - o.unitCost) / o.unitCost) * 100;
    rows.push({
      purchaseId: o.id,
      productId: o.productId,
      supplier: (o.supplier ?? "").trim() || "No supplier recorded",
      quotedUnitCost: o.unitCost,
      paidUnitCost: o.receivedUnitCost,
      qty,
      variancePct: r2(variancePct),
      impact: r2((o.receivedUnitCost - o.unitCost) * qty),
    });
  }
  const bySupplierMap = new Map<string, CostVarianceRow[]>();
  for (const r of rows) bySupplierMap.set(r.supplier, [...(bySupplierMap.get(r.supplier) ?? []), r]);
  const bySupplier: SupplierCostVariance[] = [...bySupplierMap.entries()].map(([supplier, list]) => ({
    supplier,
    purchases: list.length,
    averageVariancePct: r2(list.reduce((t, r) => t + r.variancePct, 0) / list.length),
    totalImpact: r2(list.reduce((t, r) => t + r.impact, 0)),
    flagged: list.filter((r) => Math.abs(r.variancePct) >= alertPct).length,
  }));
  return {
    rows: rows.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    bySupplier: bySupplier.sort((a, b) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact)),
  };
}
