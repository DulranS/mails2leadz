// The customer's side of a quote. Unauthenticated on purpose: the only credential is the signed link (lib/signedToken.ts,
// purpose "quote"), which names one business and one quote. It can do exactly two things: show that quote, and record
// accept or decline on it. It can't change a price, a line, a date or anything else, and it never shows cost prices,
// stock or any other business data. Reads and writes go through the Admin SDK, same as the trial and feedback routes.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { quoteDecisionBlock, quoteSubtotal, QUOTE_BLOCK_MESSAGE } from "@/lib/quoteRevision";
import { taxFor } from "@/lib/tax";
import { todayIso } from "@/lib/format";
import { DEFAULT_SETTINGS, type Estimate, type Product, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link is not valid. Ask the business to send it again.";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function estimateRef(id: string) {
  return `EST-${id.slice(-6).toUpperCase()}`;
}

// Loads the quote named by an already-verified link subject ("<businessId>/<estimateId>"). Callers verify the token first.
async function loadQuote(subject: string) {
  const slash = subject.indexOf("/");
  if (slash <= 0) return null;
  const businessId = subject.slice(0, slash);
  const estimateId = subject.slice(slash + 1);
  const db = getAdminDb();
  const base = db.collection("users").doc(businessId);
  const [estSnap, settingsSnap] = await Promise.all([base.collection("estimates").doc(estimateId).get(), base.collection("meta").doc("settings").get()]);
  if (!estSnap.exists) return null;
  const estimate = estSnap.data() as Estimate;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((settingsSnap.data() as Partial<Settings> | undefined) ?? {}) };
  return { db, businessId, estimateId, estimate, settings, base };
}

export async function GET(req: Request) {
  try {
    // Viewing is throttled per address too, so a link cannot be hammered by a script.
    if (await isRateLimited("quote-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const token = new URL(req.url).searchParams.get("t");
    const subject = verifyLinkToken(token, "quote");
    if (!subject) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const found = await loadQuote(subject);
    if (!found) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const { db, base, estimate, settings, estimateId } = found;

    const productIds = [...new Set(estimate.lines.map((l) => l.productId))];
    const productSnaps = productIds.length
      ? await db.getAll(...productIds.map((id) => base.collection("products").doc(id)))
      : [];
    const products = new Map<string, Product>();
    for (const snap of productSnaps) if (snap.exists) products.set(snap.id, snap.data() as Product);

    const lines = estimate.lines.map((l) => {
      const amount = Math.round(l.qty * l.unitPrice * 100) / 100;
      return { name: products.get(l.productId)?.name ?? "Item", qty: l.qty, unitPrice: l.unitPrice, amount };
    });
    const subtotal = quoteSubtotal(estimate.lines);
    const tax = Math.round(
      estimate.lines.reduce((sum, l) => sum + taxFor(l.qty * l.unitPrice, products.get(l.productId), settings), 0) * 100
    ) / 100;
    const today = todayIso();
    const block = quoteDecisionBlock(estimate, today);

    return Response.json({
      businessName: settings.businessName ?? "",
      currency: settings.currency,
      ref: estimateRef(estimateId),
      date: estimate.date,
      validUntil: estimate.validUntil ?? null,
      customer: estimate.customer ?? null,
      notes: estimate.notes ?? null,
      lines,
      subtotal,
      tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      status: estimate.status,
      decidedAs: estimate.status === "accepted" || estimate.status === "declined" ? estimate.status : null,
      block,
      blockMessage: block ? QUOTE_BLOCK_MESSAGE[block] : null,
    });
  } catch (err) {
    console.error("[quotes/public GET]", err);
    return Response.json({ error: "Couldn't load this quote. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { t?: unknown; decision?: unknown; name?: unknown };
    const token = clip(body.t, 2000);
    const decision = body.decision === "accept" || body.decision === "decline" ? body.decision : null;
    if (!decision) return Response.json({ error: "Choose accept or decline." }, { status: 400 });

    // Throttle guesses and repeat submissions from one address. Fails open, like every rate limit in this app.
    if (await isRateLimited("quote-answer", requestIp(req), 40, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many answers from this address. Try again later." }, { status: 429 });
    }

    const name = clip(body.name, 120);
    if (decision === "accept" && name.length < 2) {
      return Response.json({ error: "Type your name to accept this quote." }, { status: 400 });
    }

    const subject = verifyLinkToken(token, "quote");
    if (!subject) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const found = await loadQuote(subject);
    if (!found) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const { estimate, base, estimateId } = found;

    const block = quoteDecisionBlock(estimate, todayIso());
    if (block) return Response.json({ error: QUOTE_BLOCK_MESSAGE[block], block }, { status: 409 });

    const status = decision === "accept" ? "accepted" : "declined";
    await base.collection("estimates").doc(estimateId).update({
      status,
      decidedAt: Date.now(),
      decidedByName: name || null,
      decisionFrom: "customer_link",
    });
    // Tell the owner straight away. Best effort: a failed alert never undoes the answer the customer already gave.
    try {
      await base.collection("notifications").add({
        type: "quote_answered",
        priority: "high",
        title: `${status === "accepted" ? "Quote accepted" : "Quote declined"}: ${estimateRef(estimateId)}`,
        message: `${name || "The customer"} ${status === "accepted" ? "accepted" : "declined"} this quote online. ${
          status === "accepted" ? "Convert it to an invoice on the Estimates page." : "No action needed unless you want to follow up."
        }`,
        entityId: estimateId,
        entityType: "estimate",
        isRead: false,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error("[quotes/public POST] owner alert failed", err);
    }
    return Response.json({ ok: true, status });
  } catch (err) {
    console.error("[quotes/public POST]", err);
    return Response.json({ error: "Couldn't record your answer. Try again in a moment." }, { status: 500 });
  }
}
