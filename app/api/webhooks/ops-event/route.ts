// Pushes one operations event (a new incident, or a purchase order approved) to the business's webhook address. Called by the app, signed
// in as the owner or a manager. The record is re-read here, so the event describes what is in the database; nothing the browser sends is
// trusted beyond the event name and the record id. Sends nothing when no webhook address is set.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { resolveAutomations } from "@/lib/leadIntake";
import { pushLeadWebhook } from "@/lib/leadIntakeServer";
import { OPS_EVENTS, OPS_EVENT_COLLECTION, opsEventPayload, type OpsEvent } from "@/lib/opsEvents";
import { invoiceStatusPayload } from "@/lib/invoiceEvents";
import { invoiceStatus } from "@/lib/invoiceStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    // v316: staff may send payment.received only (a payment they recorded). Every other event stays owner and manager.
    const ctx = await requireAiContext(req, { roles: ["owner", "manager", "staff"] });
    if (await isRateLimited("ops-event-hook", ctx.businessId, 600, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { event?: unknown; recordId?: unknown };
    const event = typeof body.event === "string" ? body.event : "";
    const recordId = typeof body.recordId === "string" ? body.recordId : "";
    if (!(OPS_EVENTS as readonly string[]).includes(event) || !ID_RE.test(recordId)) throw new AiAuthError("That event could not be sent.", 400);
    const ev = event as OpsEvent;
    if (ctx.role === "staff" && ev !== "payment.received") throw new AiAuthError("Only owners and managers can send that event.", 403);

    const base = ctx.db.collection("users").doc(ctx.businessId);
    const settingsSnap = await base.collection("meta").doc("settings").get();
    const automations = resolveAutomations((settingsSnap.data() as { automations?: Parameters<typeof resolveAutomations>[0] } | undefined)?.automations);
    if (!automations.outboundWebhookUrl) return Response.json({ ok: true, sent: false });

    if (ev === "payment.received") {
      // A payment: send the status of the invoice it was made against, from the invoice's own totals (v284b).
      const pay = await base.collection("receivablePayments").doc(recordId).get();
      if (!pay.exists) throw new AiAuthError("That record could not be found.", 404);
      const saleId = String((pay.data() as { saleId?: string }).saleId ?? "");
      const saleSnap = saleId ? await base.collection("sales").doc(saleId).get() : null;
      const invoiceId = saleSnap?.exists ? String((saleSnap.data() as { invoiceId?: string }).invoiceId ?? "") : "";
      if (!invoiceId) return Response.json({ ok: true, sent: false, reason: "not on an invoice" });
      const onInvoice = await base.collection("sales").where("invoiceId", "==", invoiceId).get();
      let total = 0;
      for (const d of onInvoice.docs) {
        const s = d.data() as { qty?: number; unitPrice?: number; taxAmount?: number };
        total += (s.qty ?? 0) * (s.unitPrice ?? 0) + (s.taxAmount ?? 0);
      }
      let paid = 0;
      for (const d of onInvoice.docs) {
        const pays = await base.collection("receivablePayments").where("saleId", "==", d.id).get();
        for (const x of pays.docs) paid += Number((x.data() as { amount?: number }).amount ?? 0);
      }
      const dueDates = onInvoice.docs.map((d) => (d.data() as { dueDate?: string }).dueDate).filter((x): x is string => !!x);
      const dueDate = dueDates.length ? dueDates.sort()[0] : undefined;
      const status = invoiceStatus({ total, paid, dueDate, today: new Date().toISOString().slice(0, 10) });
      const sent = await pushLeadWebhook(automations.outboundWebhookUrl, invoiceStatusPayload(invoiceId, status, Date.now()));
      return Response.json({ ok: true, sent, invoiceId, status });
    }
    const snap = await base.collection(OPS_EVENT_COLLECTION[ev]).doc(recordId).get();
    if (!snap.exists) throw new AiAuthError("That record could not be found.", 404);
    const sent = await pushLeadWebhook(automations.outboundWebhookUrl, opsEventPayload(ev, snap.id, snap.data() as Record<string, unknown>, Date.now()));
    return Response.json({ ok: true, sent });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[webhooks/ops-event]", err);
    return Response.json({ error: "Couldn't send that event." }, { status: 500 });
  }
}
