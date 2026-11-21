// Issues a customer link to one invoice (app/invoice/[token]). Owner and Manager only. The signed token names the business and
// the invoice key and nothing else. Creating a link changes no sale, payment or balance.
import { getAdminDb, requireSignedIn, AiAuthError } from "@/lib/firebaseAdmin";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { signToken } from "@/lib/signedToken";
import { loadInvoice } from "@/lib/invoiceServer";
import { QUOTE_LINK_DAYS } from "@/lib/quoteRevision";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const KEY_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    const { uid, businessId } = await requireSignedIn(req);
    const db = getAdminDb();
    const [memberSnap, accountSnap] = await Promise.all([
      db.collection("users").doc(businessId).collection("members").doc(uid).get(),
      db.doc(`users/${businessId}/meta/account`).get(),
    ]);
    const role = (memberSnap.data() as { role?: Role } | undefined)?.role;
    if (role !== "owner" && role !== "manager") throw new AiAuthError("Only the owner or a manager can send an invoice link.", 403);
    if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) {
      throw new AiAuthError("This account is locked, so invoice links are paused. Get in touch to continue.", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!KEY_RE.test(key)) throw new AiAuthError("That invoice could not be found.", 400);
    const invoice = await loadInvoice(db, businessId, key);
    if (!invoice) throw new AiAuthError("That invoice could not be found.", 404);

    const token = signToken("invoice", `${businessId}/${key}`, QUOTE_LINK_DAYS * DAY_MS);
    if (!token) throw new AiAuthError("Customer links are not set up on this server yet. Ask whoever runs Balancr to set LINK_SIGNING_SECRET.", 500);
    return Response.json({ url: `${new URL(req.url).origin}/invoice/${token}`, validDays: QUOTE_LINK_DAYS });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[invoices/link]", err);
    return Response.json({ error: "Couldn't create the link. Try again." }, { status: 500 });
  }
}
