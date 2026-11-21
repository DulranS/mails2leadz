// Server-only (v319). Forgets the HMRC tokens for this business. Nothing is sent to HMRC. The NINO and business ID are kept so a later
// reconnect needs only the sign-in. Owner only.
import { aiErrorResponse } from "@/lib/apiError";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { hmrcStateRef } from "@/lib/hmrcServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    await hmrcStateRef(ctx.db, ctx.businessId).set({ connected: false, accessTokenSealed: null, refreshTokenSealed: null, expiresAt: null }, { merge: true });
    return Response.json({ ok: true });
  } catch (err) {
    return aiErrorResponse(err, "hmrc-disconnect");
  }
}
