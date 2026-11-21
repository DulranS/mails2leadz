// Invoice status events (v284b): when a payment is recorded against an invoice, the business's webhook is told the invoice's new status (paid, overdue or open),
// so the other system does not have to wait for its next read. The event carries the invoice id and its status only. Pure.
export type InvoiceStatus = "paid" | "overdue" | "open";

export function invoiceStatusPayload(invoiceId: string, status: InvoiceStatus, now: number): Record<string, unknown> {
  return { event: "invoice.status_changed", invoiceId, status, occurredAt: new Date(now).toISOString() };
}

// The invoice a payment belongs to: the sale it was made against, and that sale's invoice id (if the sale was raised on an invoice).
export function invoiceForPayment(paymentSaleId: string | undefined, sales: { id: string; invoiceId?: string }[]): string | null {
  if (!paymentSaleId) return null;
  const sale = sales.find((s) => s.id === paymentSaleId);
  return sale?.invoiceId ?? null;
}
