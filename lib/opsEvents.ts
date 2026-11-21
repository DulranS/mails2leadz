// Operations events (v209b): the business's own webhook (Integrations > Automations) also hears about the operations events that matter
// most, so an automation tool (Zapier, Make, n8n) can route them: a new incident, and a purchase order approved. The event carries only
// what a routing step needs; costs and personal notes are left out. Pure.
export const OPS_EVENTS = ["incident.opened", "purchaseOrder.approved", "payment.received"] as const;
export type OpsEvent = (typeof OPS_EVENTS)[number];

export const OPS_EVENT_COLLECTION: Record<OpsEvent, string> = { "incident.opened": "incidents", "purchaseOrder.approved": "purchaseOrders", "payment.received": "receivablePayments" };

export function opsEventPayload(event: OpsEvent, id: string, record: Record<string, unknown>, now: number): Record<string, unknown> {
  const base = { event, occurredAt: new Date(now).toISOString(), id };
  if (event === "incident.opened") {
    return { ...base, record: { date: record.date, kind: record.kind, severity: record.severity, place: record.place ?? null, description: record.description, status: record.status } };
  }
  return { ...base, record: { productId: record.productId, qtyOrdered: record.qtyOrdered, supplier: record.supplier ?? null, expectedDate: record.expectedDate ?? null, approvedByName: record.approvedByName ?? null } };
}
