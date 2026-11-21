// Server-only (v319). Sends AutoLeads an "invoice.paid" event when a payment makes an invoice fully paid. Called by the app, signed in as
// the owner, a manager or staff (the same people who can record a payment). The invoice is re-read here, so the event describes the
// database, not what the browser sends; the browser sends only the payment id. Never blocks the payment: a failure is logged and answered.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { invoiceStatus } from "@/lib/invoiceStatus";
import { logSync } from "@/lib/syncLog";
import { buildEvent, eventSkipReason, sendAutoLeadsEvent } from "@/lib/autoleads-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req, { roles: ["owner", "manager", "staff"] });
    const body = (await req.json().catch(() => ({}))) as { paymentId?: unknown };
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
    if (!ID_RE.test(paymentId)) throw new AiAuthError("That payment could not be found.", 400);

    const base = ctx.db.collection("users").doc(ctx.businessId);
    const pay = await base.collection("receivablePayments").doc(paymentId).get();
    if (!pay.exists) throw new AiAuthError("That payment could not be found.", 404);
    const saleId = String((pay.data() as { saleId?: string }).saleId ?? "");
    const saleSnap = saleId ? await base.collection("sales").doc(saleId).get() : null;
    const invoiceId = saleSnap?.exists ? String((saleSnap.data() as { invoiceId?: string }).invoiceId ?? "") : "";
    if (!invoiceId) return Response.json({ ok: true, sent: false, reason: "not on an invoice" });

    const onInvoice = await base.collection("sales").where("invoiceId", "==", invoiceId).get();
    let total = 0;
    let customerEmail: string | null = null;
    const dueDates: string[] = [];
    for (const d of onInvoice.docs) {
      const s = d.data() as { qty?: number; unitPrice?: number; taxAmount?: number; dueDate?: string; customerContact?: string };
      total += (s.qty ?? 0) * (s.unitPrice ?? 0) + (s.taxAmount ?? 0);
      if (s.dueDate) dueDates.push(s.dueDate);
      if (!customerEmail && s.customerContact && EMAIL_RE.test(s.customerContact.trim())) customerEmail = s.customerContact.trim();
    }
    let paid = 0;
    let paidOn = "";
    for (const d of onInvoice.docs) {
      const pays = await base.collection("receivablePayments").where("saleId", "==", d.id).get();
      for (const x of pays.docs) {
        const p = x.data() as { amount?: number; date?: string };
        paid += Number(p.amount ?? 0);
        if (p.date && p.date > paidOn) paidOn = p.date;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = dueDates.length ? [...dueDates].sort()[0] : undefined;
    if (invoiceStatus({ total, paid, dueDate, today }) !== "paid") return Response.json({ ok: true, sent: false, reason: "not fully paid" });

    const ownerSnap = await base.collection("integrations").doc("autoleads").get();
    const ownerUid = (ownerSnap.data() as { values?: { ownerUid?: string } } | undefined)?.values?.ownerUid ?? null;
    const settingsSnap = await base.collection("meta").doc("settings").get();
    const currency = String((settingsSnap.data() as { currency?: string } | undefined)?.currency ?? "").trim().toUpperCase();

    const url = process.env.AUTOLEADS_EVENTS_URL;
    const secret = process.env.BALANCR_EVENT_SECRET;
    const skip = eventSkipReason({ ownerUid, url, secret });
    if (skip) {
      await logSync(base, { action: "invoice.paid", recordId: invoiceId, ok: false, detail: skip });
      return Response.json({ ok: true, sent: false, reason: skip });
    }

    const now = Date.now();
    const event = buildEvent({
      businessId: ctx.businessId,
      ownerUid: ownerUid as string,
      invoiceId,
      customerEmail,
      amount: total,
      currency,
      paidOn: paidOn || today,
      occurredAt: now,
    });
    const result = await sendAutoLeadsEvent(event, { url: url as string, secret: secret as string, now });
    await logSync(base, { action: "invoice.paid", recordId: invoiceId, ok: result.sent, detail: result.sent ? "sent" : result.reason });
    return Response.json({ ok: true, sent: result.sent, reason: result.sent ? undefined : result.reason });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[autoleads/invoice-paid]", err);
    return Response.json({ error: "Couldn't send that event." }, { status: 500 });
  }
}
