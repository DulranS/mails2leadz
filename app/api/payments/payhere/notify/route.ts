// PayHere's server-to-server notification (notify_url). Only a notice whose md5sig matches the business's own merchant secret, with
// status_code 2 and the amount and currency this app issued, records a payment. The payment is written under a fixed id derived from the
// order, so a repeated notice (PayHere retries) writes the same record again and never a second payment. Anything else is ignored.
import { revealedValues } from "@/lib/secretBox";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isValidBusinessId } from "@/lib/enquiry";
import { loadInvoice } from "@/lib/invoiceServer";
import { payhereNoticeIsPaid, type PayhereNotice } from "@/lib/payhere";
import { todayIso } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const businessId = new URL(req.url).searchParams.get("b") ?? "";
  if (!isValidBusinessId(businessId)) return new Response("invalid", { status: 400 });
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("invalid", { status: 400 });
  const notice: PayhereNotice = {
    merchant_id: field(form, "merchant_id"),
    order_id: field(form, "order_id"),
    payhere_amount: field(form, "payhere_amount"),
    payhere_currency: field(form, "payhere_currency"),
    status_code: field(form, "status_code"),
    md5sig: field(form, "md5sig"),
  };
  if (!notice.order_id) return new Response("invalid", { status: 400 });
  try {
    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [integSnap, orderSnap] = await Promise.all([
      base.collection("integrations").doc("payhere").get(),
      base.collection("onlinePayments").doc(notice.order_id).get(),
    ]);
    const integRaw = integSnap.data() as { values?: Record<string, unknown> } | undefined;
    const integ = integRaw ? { values: revealedValues(integRaw.values) } : undefined;
    const merchantId = integ?.values?.merchantId?.trim();
    const secret = integ?.values?.merchantSecret?.trim();
    const order = orderSnap.data() as { invoiceKey: string; amountText: string; currency: string; status: string } | undefined;
    if (!merchantId || !secret || !order || !orderSnap.exists) return new Response("ignored", { status: 200 });

    const genuine = payhereNoticeIsPaid(
      notice,
      { merchantId, orderId: notice.order_id, amount: order.amountText, currency: order.currency },
      secret
    );
    if (!genuine) {
      if (notice.status_code && notice.status_code !== "2" && order.status === "pending") {
        await orderSnap.ref.update({ status: "not_paid", lastStatusCode: notice.status_code });
      }
      return new Response("ignored", { status: 200 });
    }

    const invoice = await loadInvoice(db, businessId, order.invoiceKey);
    if (!invoice || invoice.sales.length === 0) {
      console.error("[payhere notify] invoice not found for a paid order", notice.order_id);
      return new Response("ignored", { status: 200 });
    }
    const primary = [...invoice.sales].sort((a, b) => a.createdAt - b.createdAt)[0];
    const paymentId = `payhere-${notice.order_id}`;
    const amount = Math.round(Number(order.amountText) * 100) / 100;
    const batch = db.batch();
    batch.set(base.collection("receivablePayments").doc(paymentId), {
      id: paymentId,
      saleId: primary.id,
      amount,
      date: todayIso(),
      method: "card",
      note: `Card payment through PayHere${field(form, "payment_id") ? ` (${field(form, "payment_id")})` : ""}`,
      createdByName: "Online payment (PayHere)",
      createdAt: Date.now(),
    });
    batch.update(orderSnap.ref, { status: "paid", paidAt: Date.now(), paymentId: field(form, "payment_id") || null });
    await batch.commit();
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[payhere notify]", err);
    // A server error makes PayHere retry the same notice, which is safe: the payment id is fixed, so nothing is recorded twice.
    return new Response("retry", { status: 500 });
  }
}
