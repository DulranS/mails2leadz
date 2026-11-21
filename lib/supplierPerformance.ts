// Supplier performance (v198b): worked out from purchase orders already recorded, so nobody scores a supplier by hand. For each supplier:
// how often deliveries arrive on or before the expected day, how late the late ones are, how far the price paid strays from the price
// quoted, and how many orders are overdue now. Pure: the caller passes the orders and today.
export type SupplierFlag = "poor" | "watch" | "good" | "too_few";

export interface SupplierPerformance {
  supplier: string;
  received: number; // deliveries received that had an expected day
  onTimePct: number | null; // share of those received on or before the expected day
  averageDaysLate: number; // over the late deliveries only (0 when none)
  priceVariancePct: number | null; // average of (paid - quoted) / quoted over received orders with a price
  overdueNow: number; // open orders past their expected day
  flag: SupplierFlag;
}

export const MIN_DELIVERIES_TO_JUDGE = 3;
export const ON_TIME_POOR_BELOW = 80;
export const ON_TIME_WATCH_BELOW = 90;

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function supplierPerformance(
  orders: { supplier?: string; status: string; expectedDate?: string; receivedDate?: string; unitCost: number; receivedUnitCost?: number; qtyOrdered: number }[],
  today: string,
): SupplierPerformance[] {
  const bySupplier = new Map<string, typeof orders>();
  for (const o of orders) {
    const name = (o.supplier ?? "").trim();
    if (!name) continue;
    bySupplier.set(name, [...(bySupplier.get(name) ?? []), o]);
  }
  const rows: SupplierPerformance[] = [];
  for (const [supplier, list] of bySupplier) {
    const timed = list.filter((o) => o.receivedDate && o.expectedDate);
    const onTime = timed.filter((o) => o.receivedDate! <= o.expectedDate!).length;
    const late = timed.filter((o) => o.receivedDate! > o.expectedDate!).map((o) => dayDiff(o.expectedDate!, o.receivedDate!));
    const priced = list.filter((o) => o.receivedDate && o.unitCost > 0 && typeof o.receivedUnitCost === "number");
    const variance = priced.length ? priced.reduce((t, o) => t + (o.receivedUnitCost! - o.unitCost) / o.unitCost, 0) / priced.length : null;
    const overdueNow = list.filter((o) => (o.status === "ordered" || o.status === "in_transit") && !!o.expectedDate && o.expectedDate < today).length;
    const onTimePct = timed.length ? Math.round((onTime / timed.length) * 1000) / 10 : null;
    let flag: SupplierFlag;
    if (timed.length < MIN_DELIVERIES_TO_JUDGE || onTimePct === null) flag = "too_few";
    else if (onTimePct < ON_TIME_POOR_BELOW) flag = "poor";
    else if (onTimePct < ON_TIME_WATCH_BELOW) flag = "watch";
    else flag = "good";
    rows.push({
      supplier,
      received: timed.length,
      onTimePct,
      averageDaysLate: late.length ? Math.round((late.reduce((t, d) => t + d, 0) / late.length) * 10) / 10 : 0,
      priceVariancePct: variance === null ? null : Math.round(variance * 1000) / 10,
      overdueNow,
      flag,
    });
  }
  const rank: Record<SupplierFlag, number> = { poor: 0, watch: 1, too_few: 2, good: 3 };
  return rows.sort((a, b) => rank[a.flag] - rank[b.flag] || (a.onTimePct ?? 100) - (b.onTimePct ?? 100));
}
