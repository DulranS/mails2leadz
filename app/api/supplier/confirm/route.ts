// A supplier confirms the delivery day for one of their open orders. The only thing written is supplierAck on that order; the
// expected date the owner set is never changed (so the owner's on-time record stays as it was). Unauthenticated on purpose: the
// signed supplier link names the business and the supplier, and the order must belong to that supplier and still be open.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { confirmOrderPlan } from "@/lib/accountPortal";
import type { PurchaseOrder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    if (await isRateLimited("supplier-confirm", requestIp(req), 60, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { t?: unknown; orderId?: unknown; confirmedDate?: unknown; note?: unknown };
    const subject = verifyLinkToken(typeof body.t === "string" ? body.t : null, "supplier");
    const slash = subject?.indexOf("/") ?? -1;
    if (!subject || slash <= 0) return Response.json({ error: "This link is not valid. Ask the business to send it again." }, { status: 404 });
    const businessId = subject.slice(0, slash);
    const supplierId = subject.slice(slash + 1);
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!ID_RE.test(orderId)) return Response.json({ error: "That order could not be found." }, { status: 404 });

    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const supplierSnap = await base.collection("suppliers").doc(supplierId).get();
    if (!supplierSnap.exists) return Response.json({ error: "This link is not valid. Ask the business to send it again." }, { status: 404 });
    const supplierName = (supplierSnap.data() as { name?: string }).name ?? "";

    const ref = base.collection("purchaseOrders").doc(orderId);
    const orderSnap = await ref.get();
    const order = orderSnap.exists ? ({ ...(orderSnap.data() as PurchaseOrder), id: orderSnap.id } as PurchaseOrder) : undefined;
    const plan = confirmOrderPlan(
      order,
      supplierName,
      { confirmedDate: typeof body.confirmedDate === "string" ? body.confirmedDate : "", note: typeof body.note === "string" ? body.note : "" },
      Date.now(),
    );
    if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });
    await ref.update({ supplierAck: plan.patch.supplierAck });
    return Response.json({ ok: true, confirmedDate: plan.patch.supplierAck.confirmedDate });
  } catch (err) {
    console.error("[supplier confirm]", err);
    return Response.json({ error: "Couldn't record that. Try again in a moment." }, { status: 500 });
  }
}
