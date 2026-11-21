// Starts a card payment for one invoice (customer side). Public: the signed invoice link is the only credential. The server builds
// the PayHere checkout fields and the hash, so the merchant secret never reaches the browser. Only an amount that is still owed can be
// paid, and an order record is kept so the later notification can be checked against exactly what was asked for.
import { revealedValues } from "@/lib/secretBox";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { loadInvoice } from "@/lib/invoiceServer";
import { summariseInvoice, invoiceRefFor, claimProblem } from "@/lib/invoicePortal";
import { formatPayhereAmount, newPayhereOrderId, payhereCheckoutHash, PAYHERE_CHECKOUT_URL } from "@/lib/payhere";
import { customerEmail } from "@/lib/overdueReminders";
import { todayIso } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link is not valid. Ask the business to send it again.";

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "Customer", last: parts.slice(1).join(" ") || "-" };
}

export async function POST(req: Request) {
  try {
    if (await isRateLimited("pay-checkout", requestIp(req), 20, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { t?: unknown; amount?: unknown };
    const token = typeof body.t === "string" ? body.t : null;
    const subject = verifyLinkToken(token, "invoice");
    if (!subject) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const slash = subject.indexOf("/");
    if (slash <= 0) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const businessId = subject.slice(0, slash);
    const key = subject.slice(slash + 1);

    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [invoice, settingsSnap, integSnap] = await Promise.all([
      loadInvoice(db, businessId, key),
      base.collection("meta").doc("settings").get(),
      base.collection("integrations").doc("payhere").get(),
    ]);
    if (!invoice) return Response.json({ error: NOT_FOUND }, { status: 404 });

    const integRaw = integSnap.data() as { values?: Record<string, unknown>; enabled?: boolean } | undefined;
    const integ = integRaw ? { enabled: integRaw.enabled, values: revealedValues(integRaw.values) } : undefined;
    const merchantId = integ?.values?.merchantId?.trim();
    const secret = integ?.values?.merchantSecret?.trim();
    if (!integ?.enabled || !merchantId || !secret) {
      return Response.json({ error: "Card payment is not set up for this business. Pay by the bank details shown instead." }, { status: 409 });
    }
    const mode = (integ.values?.mode ?? "sandbox").trim().toLowerCase().startsWith("live") ? "live" : "sandbox";

    const amount = Math.round(Number(body.amount) * 100) / 100;
    const summary = summariseInvoice({ ...invoice, today: todayIso() });
    const problem = claimProblem(amount, summary);
    if (problem) return Response.json({ error: problem }, { status: 409 });

    const currency = (settingsSnap.data() as { currency?: string } | undefined)?.currency ?? "LKR";
    const amountText = formatPayhereAmount(amount);
    const orderId = newPayhereOrderId();
    await base.collection("onlinePayments").doc(orderId).set({
      invoiceKey: key,
      amount,
      amountText,
      currency,
      mode,
      status: "pending",
      createdAt: Date.now(),
    });

    const origin = new URL(req.url).origin;
    const first = invoice.sales[0];
    const { first: firstName, last: lastName } = splitName(first?.customer ?? "");
    const hash = payhereCheckoutHash(merchantId, orderId, amountText, currency, secret);
    return Response.json({
      url: PAYHERE_CHECKOUT_URL[mode],
      fields: {
        merchant_id: merchantId,
        return_url: `${origin}/invoice/${token}`,
        cancel_url: `${origin}/invoice/${token}`,
        notify_url: `${origin}/api/payments/payhere/notify?b=${encodeURIComponent(businessId)}`,
        order_id: orderId,
        items: `Invoice ${invoiceRefFor(key)}`,
        currency,
        amount: amountText,
        first_name: firstName,
        last_name: lastName,
        email: customerEmail(first?.customerContact) ?? "",
        phone: "",
        address: "Not provided",
        city: "Not provided",
        country: "Sri Lanka",
        hash,
      },
    });
  } catch (err) {
    console.error("[payhere checkout]", err);
    return Response.json({ error: "Couldn't start the card payment. Try again in a moment." }, { status: 500 });
  }
}
