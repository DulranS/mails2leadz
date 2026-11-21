// The customer's side of the unsubscribe link at the foot of a marketing email. Open to anyone holding the signed link, which names
// one business and one customer and grants one thing: switching that customer's offers off. Nothing is read back except the
// business name for the confirmation. A POST, not a GET, so a mail scanner that opens links cannot unsubscribe anyone.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { todayIso } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_VALID = "This link is not valid. Reply to the email and ask to be taken off the list.";

export async function POST(req: Request) {
  try {
    if (await isRateLimited("unsubscribe", requestIp(req), 60, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { t?: unknown };
    const token = typeof body.t === "string" ? body.t : null;
    const subject = verifyLinkToken(token, "unsubscribe");
    if (!subject) return Response.json({ error: NOT_VALID }, { status: 404 });
    const slash = subject.indexOf("/");
    if (slash <= 0) return Response.json({ error: NOT_VALID }, { status: 404 });
    const businessId = subject.slice(0, slash);
    const customerId = subject.slice(slash + 1);
    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const ref = base.collection("customers").doc(customerId);
    const snap = await ref.get();
    // A customer deleted since the email went out is already off the list.
    if (snap.exists) await ref.update({ marketingOptIn: false, marketingOptOutAt: todayIso() });
    const settings = (await base.collection("meta").doc("settings").get()).data() as { businessName?: string } | undefined;
    return Response.json({ ok: true, businessName: settings?.businessName ?? "" });
  } catch (err) {
    console.error("[unsubscribe]", err instanceof Error ? err.message : "failed");
    return Response.json({ error: "Couldn't update your choice. Try again." }, { status: 500 });
  }
}
