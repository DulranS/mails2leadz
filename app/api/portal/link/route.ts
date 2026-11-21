// Issues the account link for one customer, or the order link for one supplier. Owner and Manager only (the same line as
// "manage:sales"). The link is a signed token that names this business and this one customer or supplier and nothing else.
import { getAdminDb, requireSignedIn, AiAuthError } from "@/lib/firebaseAdmin";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { signToken } from "@/lib/signedToken";
import { PORTAL_LINK_DAYS } from "@/lib/accountPortal";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    const { uid, businessId } = await requireSignedIn(req);
    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [memberSnap, accountSnap] = await Promise.all([base.collection("members").doc(uid).get(), base.collection("meta").doc("account").get()]);
    const role = (memberSnap.data() as { role?: Role } | undefined)?.role;
    if (role !== "owner" && role !== "manager") throw new AiAuthError("Only the owner or a manager can send a link.", 403);
    if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) {
      throw new AiAuthError("This account is locked, so links are paused. Get in touch to continue.", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { kind?: unknown; id?: unknown };
    const kind = body.kind === "customer" || body.kind === "supplier" ? body.kind : null;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!kind || !ID_RE.test(id)) throw new AiAuthError("That record could not be found.", 400);
    const snap = await base.collection(kind === "customer" ? "customers" : "suppliers").doc(id).get();
    if (!snap.exists) throw new AiAuthError("That record could not be found.", 404);

    const token = signToken(kind === "customer" ? "portal" : "supplier", `${businessId}/${id}`, PORTAL_LINK_DAYS * DAY_MS);
    if (!token) throw new AiAuthError("Links are not set up on this server yet. Ask whoever runs Balancr to set LINK_SIGNING_SECRET.", 500);
    const origin = new URL(req.url).origin;
    return Response.json({ url: `${origin}/${kind === "customer" ? "portal" : "supplier"}?t=${token}`, validDays: PORTAL_LINK_DAYS });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[portal/link]", err);
    return Response.json({ error: "Couldn't create the link. Try again." }, { status: 500 });
  }
}
