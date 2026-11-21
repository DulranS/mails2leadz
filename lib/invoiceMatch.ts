// Three-way match (v210c): each received purchase order should have exactly one purchase (the supplier's invoice, as booked), and every
// purchase should trace back to an order. This finds receipts with no purchase, purchases with no order, and quantities that disagree
// between the order receipt and the purchase. Pure: the caller passes the records; nothing is posted or changed.

export interface MatchIssue {
  kind: "receipt_not_invoiced" | "purchase_not_on_order" | "quantity_mismatch";
  reference: string; // the purchase order id, or the purchase id
  supplier: string;
  detail: string;
}

export function threeWayMatch(
  orders: { id: string; status: string; supplier?: string; productId: string; qtyOrdered: number; qtyReceived?: number }[],
  purchases: { id: string; productId: string; qty: number; supplier?: string; purchaseOrderId?: string }[],
): { issues: MatchIssue[]; matched: number } {
  const issues: MatchIssue[] = [];
  let matched = 0;
  const purchasesByOrder = new Map<string, typeof purchases>();
  for (const p of purchases) {
    if (!p.purchaseOrderId) continue;
    purchasesByOrder.set(p.purchaseOrderId, [...(purchasesByOrder.get(p.purchaseOrderId) ?? []), p]);
  }
  const knownOrders = new Set(orders.map((o) => o.id));
  for (const o of orders) {
    if (o.status !== "received") continue;
    const linked = purchasesByOrder.get(o.id) ?? [];
    const supplier = (o.supplier ?? "").trim() || "No supplier recorded";
    if (linked.length === 0) {
      issues.push({ kind: "receipt_not_invoiced", reference: o.id, supplier, detail: "Received, but no purchase (supplier invoice) is recorded against it." });
      continue;
    }
    const received = typeof o.qtyReceived === "number" && o.qtyReceived > 0 ? o.qtyReceived : o.qtyOrdered;
    const booked = linked.reduce((t, p) => t + p.qty, 0);
    if (booked !== received) {
      issues.push({ kind: "quantity_mismatch", reference: o.id, supplier, detail: `Received ${received}, but the purchase records ${booked}.` });
    } else {
      matched++;
    }
  }
  for (const p of purchases) {
    if (p.purchaseOrderId && knownOrders.has(p.purchaseOrderId)) continue;
    issues.push({
      kind: "purchase_not_on_order",
      reference: p.id,
      supplier: (p.supplier ?? "").trim() || "No supplier recorded",
      detail: p.purchaseOrderId ? "Refers to a purchase order that no longer exists." : "Bought without a purchase order.",
    });
  }
  const rank: Record<MatchIssue["kind"], number> = { receipt_not_invoiced: 0, quantity_mismatch: 1, purchase_not_on_order: 2 };
  return { issues: issues.sort((a, b) => rank[a.kind] - rank[b.kind]), matched };
}

// Suggested matches (v243): for each purchase with no order, the received orders it most likely came from (same product, supplier and quantity,
// not already used by another purchase). A suggestion only: linking stays a person's decision, so the records remain trustworthy.
export function suggestOrdersForPurchases(
  orders: { id: string; status: string; supplier?: string; productId: string; qtyOrdered: number; qtyReceived?: number }[],
  purchases: { id: string; productId: string; qty: number; supplier?: string; purchaseOrderId?: string }[],
): { purchaseId: string; orderIds: string[] }[] {
  const linked = new Set(purchases.map((p) => p.purchaseOrderId).filter((x): x is string => !!x));
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  return purchases
    .filter((p) => !p.purchaseOrderId)
    .map((p) => ({
      purchaseId: p.id,
      orderIds: orders
        .filter((o) => o.status === "received" && !linked.has(o.id) && o.productId === p.productId && norm(o.supplier) === norm(p.supplier))
        .filter((o) => (typeof o.qtyReceived === "number" && o.qtyReceived > 0 ? o.qtyReceived : o.qtyOrdered) === p.qty)
        .map((o) => o.id),
    }))
    .filter((s) => s.orderIds.length > 0);
}
