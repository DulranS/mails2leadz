// Issues the customer link for one quote (app/quote/[token]). Owner and Manager only, the same line as "manage:sales".
// The link is a signed token (lib/signedToken.ts) that names this business and this quote and nothing else. Issuing it marks
// a draft as sent, so the Estimates page shows the quote as waiting on the customer.
import { getAdminDb, requireSignedIn, AiAuthError } from "@/lib/firebaseAdmin";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { signToken } from "@/lib/signedToken";
import { QUOTE_LINK_DAYS } from "@/lib/quoteRevision";
import type { Estimate, Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    const { uid, businessId } = await requireSignedIn(req);
    const db = getAdminDb();
    const [memberSnap, accountSnap] = await Promise.all([
      db.collection("users").doc(businessId).collection("members").doc(uid).get(),
      db.doc(`users/${businessId}/meta/account`).get(),
    ]);
    const role = (memberSnap.data() as { role?: Role } | undefined)?.role;
    if (role !== "owner" && role !== "manager") {
      throw new AiAuthError("Only the owner or a manager can send a quote link.", 403);
    }
    if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) {
      throw new AiAuthError("This account is locked, so quote links are paused. Get in touch to continue.", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { estimateId?: unknown };
    const estimateId = typeof body.estimateId === "string" ? body.estimateId.trim() : "";
    if (!ID_RE.test(estimateId)) throw new AiAuthError("That quote could not be found.", 400);

    const ref = db.collection("users").doc(businessId).collection("estimates").doc(estimateId);
    const snap = await ref.get();
    if (!snap.exists) throw new AiAuthError("That quote could not be found.", 404);
    const estimate = snap.data() as Estimate;
    if (estimate.status !== "draft" && estimate.status !== "sent") {
      throw new AiAuthError(`This quote is already ${estimate.status}, so a new link can't be sent for it.`, 409);
    }

    const token = signToken("quote", `${businessId}/${estimateId}`, QUOTE_LINK_DAYS * DAY_MS);
    if (!token) {
      throw new AiAuthError("Customer links are not set up on this server yet. Ask whoever runs Balancr to set LINK_SIGNING_SECRET.", 500);
    }

    const patch: Partial<Estimate> = { sentAt: Date.now() };
    if (estimate.status === "draft") patch.status = "sent";
    await ref.update(patch);

    const origin = new URL(req.url).origin;
    return Response.json({ url: `${origin}/quote/${token}`, validDays: QUOTE_LINK_DAYS });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[quotes/link]", err);
    return Response.json({ error: "Couldn't create the link. Try again." }, { status: 500 });
  }
}
