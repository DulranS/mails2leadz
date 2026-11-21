// The customer's side of one invoice. Unauthenticated on purpose: the only credential is the signed invoice link, which names one
// business and one invoice key. GET shows that invoice's balance and payments. POST records a payment CLAIM, which is only an alert
// for the owner. A claim changes no sale, payment or balance; the owner checks the bank and records the payment themselves.
// Cost prices, stock and every other business record are never sent.
import { revealedValues } from "@/lib/secretBox";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { loadInvoice } from "@/lib/invoiceServer";
import { summariseInvoice, invoiceRefFor, claimProblem } from "@/lib/invoicePortal";
import { todayIso } from "@/lib/format";
import { DEFAULT_SETTINGS, type Product, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link is not valid. Ask the business to send it again.";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Loads the invoice named by an already-verified link subject ("<businessId>/<invoiceKey>"). Callers verify the link first.
async function resolve(subject: string) {
  const slash = subject.indexOf("/");
  if (slash <= 0) return null;
  const businessId = subject.slice(0, slash);
  const key = subject.slice(slash + 1);
  const db = getAdminDb();
  const base = db.collection("users").doc(businessId);
  const [invoice, settingsSnap] = await Promise.all([loadInvoice(db, businessId, key), base.collection("meta").doc("settings").get()]);
  if (!invoice) return null;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((settingsSnap.data() as Partial<Settings> | undefined) ?? {}) };
  return { db, base, businessId, key, invoice, settings };
}

export async function GET(req: Request) {
  try {
    if (await isRateLimited("invoice-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const token = new URL(req.url).searchParams.get("t");
    const subject = verifyLinkToken(token, "invoice");
    if (!subject) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const found = await resolve(subject);
    if (!found) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const { db, base, invoice, settings, key } = found;

    const productIds = [...new Set(invoice.sales.map((s) => s.productId))];
    const snaps = productIds.length ? await db.getAll(...productIds.map((id) => base.collection("products").doc(id))) : [];
    const products = new Map<string, Product>();
    for (const snap of snaps) if (snap.exists) products.set(snap.id, snap.data() as Product);

    const integRaw = (await base.collection("integrations").doc("payhere").get()).data() as { values?: Record<string, unknown>; enabled?: boolean } | undefined;
    const integ = integRaw ? { enabled: integRaw.enabled, values: revealedValues(integRaw.values) } : undefined;
    const onlinePaymentAvailable = !!integ?.enabled && !!integ?.values?.merchantId && !!integ?.values?.merchantSecret;
    const summary = summariseInvoice({ ...invoice, today: todayIso() });
    return Response.json({
      onlinePaymentAvailable,
      businessName: settings.businessName ?? "",
      currency: settings.currency,
      ref: invoiceRefFor(key),
      date: summary.firstDate,
      dueDate: summary.dueDate,
      customer: invoice.sales[0]?.customer ?? null,
      lines: invoice.sales.map((s) => ({
        name: products.get(s.productId)?.name ?? "Item",
        qty: s.qty,
        unitPrice: s.unitPrice,
        amount: Math.round(s.qty * s.unitPrice * 100) / 100,
      })),
      isCredit: summary.isCredit,
      gross: summary.gross,
      adjustments: summary.adjustments,
      net: summary.net,
      tax: summary.tax,
      total: summary.total,
      paid: summary.paid,
      balance: summary.balance,
      status: summary.status,
      payments: invoice.payments
        .map((p) => ({ date: p.date, amount: p.amount }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      paymentInstructions: settings.paymentInstructions?.trim() || null,
    });
  } catch (err) {
    console.error("[invoices/public GET]", err);
    return Response.json({ error: "Couldn't load this invoice. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (await isRateLimited("invoice-claim", requestIp(req), 20, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many messages from this address. Try again later." }, { status: 429 });
    }
    const token = clip(body.t, 2000);
    const amount = typeof body.amount === "number" ? Math.round(body.amount * 100) / 100 : Number(body.amount);
    const paidOn = clip(body.paidOn, 10);
    const reference = clip(body.reference, 120);
    const name = clip(body.name, 120);
    if (name.length < 2) return Response.json({ error: "Type your name so the business knows who paid." }, { status: 400 });
    if (!ISO_DAY.test(paidOn)) return Response.json({ error: "Choose the date you paid." }, { status: 400 });

    const subject = verifyLinkToken(token, "invoice");
    if (!subject) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const found = await resolve(subject);
    if (!found) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const { base, invoice, settings, key } = found;
    const summary = summariseInvoice({ ...invoice, today: todayIso() });
    const problem = claimProblem(Number.isFinite(amount) ? amount : 0, summary);
    if (problem) return Response.json({ error: problem }, { status: 409 });

    const ref = invoiceRefFor(key);
    const money = `${settings.currency} ${amount.toFixed(2)}`;
    // Best effort for the alert itself is not enough here: the claim IS the alert, so a failure is reported to the customer.
    await base.collection("notifications").add({
      type: "payment_claimed",
      priority: "high",
      title: `Customer says they paid ${money} on ${ref}`,
      message: `${name} says they paid ${money} on ${paidOn}. Reference given: ${reference || "none"}. Balancr has NOT recorded this. Check your bank, then record the payment on the Receivables page.`,
      entityId: key,
      entityType: "sale",
      isRead: false,
      createdAt: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[invoices/public POST]", err);
    return Response.json({ error: "Couldn't send your message. Try again in a moment." }, { status: 500 });
  }
}
