// Invoice status for the sync (v263). An invoice is the sales raised under one invoice id. Its total is what those sales are worth (quantity times price,
// plus any tax on them); what has been paid is the receivable payments recorded against them. Paid when nothing is left owing; overdue when something is
// still owing past the due date; open otherwise. Pure.

export function invoiceStatus(i: { total: number; paid: number; dueDate?: string; today: string }): "paid" | "overdue" | "open" {
  const r = Math.round((i.total - i.paid) * 100) / 100;
  if (r <= 0) return "paid";
  if (i.dueDate && i.dueDate < i.today) return "overdue";
  return "open";
}
