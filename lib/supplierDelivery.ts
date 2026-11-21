// Supplier delivery reliability, read straight off purchase orders.
// Read-only: no new inputs, nothing written, nothing the books depend on.
//
// A received order is "scored" only when it has BOTH an expected date and a
// received date — without an expected date there is nothing to be late
// against, so it is left out rather than counted as on time. Cancelled
// orders are ignored. Open orders (ordered / in transit) whose expected date
// has already passed are reported separately as "overdue now".
import type { PurchaseOrder } from "./types";

export interface SupplierDelivery {
  scored: number; // received orders that had an expected date
  onTime: number; // received on or before the expected date
  late: number;
  avgDaysLate: number | null; // average over the late ones only; null if none late
  worstDaysLate: number;
  overdueOpen: number; // not yet received and past their expected date today
  onTimePct: number | null; // null when nothing has been scored yet
}

export const supplierKey = (name: string) => name.trim().toLowerCase();

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function computeSupplierDelivery(
  orders: PurchaseOrder[],
  todayIso: string
): Map<string, SupplierDelivery> {
  const acc = new Map<string, { scored: number; onTime: number; lateDays: number[]; overdueOpen: number }>();
  const get = (k: string) => {
    let e = acc.get(k);
    if (!e) acc.set(k, (e = { scored: 0, onTime: 0, lateDays: [], overdueOpen: 0 }));
    return e;
  };
  for (const po of orders) {
    if (!po.supplier || !po.supplier.trim() || po.status === "cancelled") continue;
    const e = get(supplierKey(po.supplier));
    if (po.status === "received") {
      if (!po.expectedDate || !po.receivedDate) continue;
      e.scored += 1;
      const lateBy = daysBetween(po.expectedDate, po.receivedDate);
      if (lateBy <= 0) e.onTime += 1;
      else e.lateDays.push(lateBy);
    } else if (po.expectedDate && daysBetween(po.expectedDate, todayIso) > 0) {
      e.overdueOpen += 1;
    }
  }
  const out = new Map<string, SupplierDelivery>();
  for (const [k, e] of acc) {
    out.set(k, {
      scored: e.scored,
      onTime: e.onTime,
      late: e.lateDays.length,
      avgDaysLate: e.lateDays.length ? e.lateDays.reduce((a, b) => a + b, 0) / e.lateDays.length : null,
      worstDaysLate: e.lateDays.length ? Math.max(...e.lateDays) : 0,
      overdueOpen: e.overdueOpen,
      onTimePct: e.scored > 0 ? (e.onTime / e.scored) * 100 : null,
    });
  }
  return out;
}

// One short line for a supplier row/card; null when there is nothing to say.
export function deliveryLabel(d: SupplierDelivery | undefined): string | null {
  if (!d) return null;
  if (d.scored === 0) return d.overdueOpen > 0 ? `${d.overdueOpen} overdue` : null;
  return `${Math.round(d.onTimePct as number)}% on time (${d.onTime} of ${d.scored})`;
}

// Tone only once there are at least 3 scored orders — one late delivery out of
// one is a data point, not a verdict.
export function deliveryTone(d: SupplierDelivery | undefined): "good" | "warn" | "bad" | "none" {
  if (!d) return "none";
  if (d.scored < 3 || d.onTimePct === null) return d.overdueOpen > 0 ? "warn" : "none";
  if (d.onTimePct >= 90) return "good";
  if (d.onTimePct >= 70) return "warn";
  return "bad";
}
