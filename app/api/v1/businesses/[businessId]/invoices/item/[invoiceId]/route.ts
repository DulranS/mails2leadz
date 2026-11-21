// One invoice's status, for the AutoLeads sync (v263). Read only. The invoice is the sales raised under that invoice id; it is paid when the payments
// recorded against those sales cover what they are worth, overdue when something is still owing past the due date, and open otherwise.
//   GET /api/v1/businesses/{businessId}/invoices/item/{invoiceId}  -> { invoice: { id, status, total, paid, dueDate } }
import { authoriseLeadApi, businessIdFrom, json } from "@/lib/leadApiAuth";
import { invoiceStatus } from "@/lib/invoiceStatus";
import { logSync } from "@/lib/syncLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split("/");
    const invoiceId = decodeURIComponent(parts[parts.indexOf("item") + 1] ?? "");
    const auth = await authoriseLeadApi(req, businessIdFrom(req));
    if (!auth.ok) return auth.response;
    if (!invoiceId) return json({ error: "Name the invoice." }, 400);
    const sales = await auth.found.base.collection("sales").where("invoiceId", "==", invoiceId).get();
    if (sales.empty) return json({ error: "No invoice with that id." }, 404);
    let total = 0;
    let paid = 0;
    let dueDate: string | undefined;
    for (const doc of sales.docs) {
      const s = doc.data() as { qty?: number; unitPrice?: number; taxAmount?: number; dueDate?: string };
      total += (s.qty ?? 0) * (s.unitPrice ?? 0) + (s.taxAmount ?? 0);
      if (s.dueDate && (!dueDate || s.dueDate < dueDate)) dueDate = s.dueDate;
      const pays = await auth.found.base.collection("receivablePayments").where("saleId", "==", doc.id).get();
      for (const p of pays.docs) paid += Number((p.data() as { amount?: number }).amount ?? 0);
    }
    const today = new Date().toISOString().slice(0, 10);
    const status = invoiceStatus({ total, paid, dueDate, today });
    await logSync(auth.found.base, { action: "invoice.status", recordId: invoiceId, ok: true, detail: status });
    return json({ invoice: { id: invoiceId, status, total: Math.round(total * 100) / 100, paid: Math.round(paid * 100) / 100, dueDate: dueDate ?? null } }, 200);
  } catch {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
