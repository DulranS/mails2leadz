// What the delivery came to against the order: short, over, exact, or not received yet. Used to flag short and damaged deliveries
// on the purchase order list. Information only: the stock and cost use the quantity actually received, as before. Pure.

export function receiptVariance(qtyOrdered: number, qtyReceived: number | undefined): { kind: "none" | "short" | "over" | "exact"; units: number } {
  if (qtyReceived === undefined || !Number.isFinite(qtyReceived)) return { kind: "none", units: 0 };
  const diff = Math.round((qtyReceived - qtyOrdered) * 1000) / 1000;
  if (diff === 0) return { kind: "exact", units: 0 };
  return diff < 0 ? { kind: "short", units: -diff } : { kind: "over", units: diff };
}
