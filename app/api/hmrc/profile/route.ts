// Server-only (v319). Saves the National Insurance number (sealed with BALANCR_ENC_KEY) and the self-employment business ID for the HMRC
// quarterly updates. Neither is returned. Owner only.
import { aiErrorResponse } from "@/lib/apiError";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { normaliseBusinessId, normaliseNino } from "@/lib/hmrcMtd";
import { hmrcStateRef, sealKey } from "@/lib/hmrcServer";
import { sealValue, SecretKeyMissingError } from "@/lib/secretBox";
import { AiAuthError } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const key = sealKey(process.env.BALANCR_ENC_KEY);
    if (!key) throw new SecretKeyMissingError();
    const body = (await req.json().catch(() => ({}))) as { nino?: unknown; businessId?: unknown };
    const nino = typeof body.nino === "string" ? normaliseNino(body.nino) : null;
    const businessId = typeof body.businessId === "string" ? normaliseBusinessId(body.businessId) : null;
    if (!nino) throw new AiAuthError("That National Insurance number doesn't look right. It is two letters, six digits and a letter A to D.", 400);
    if (!businessId) throw new AiAuthError("That business ID doesn't look right. HMRC gives it as an X, letters, IS and eleven digits.", 400);
    await hmrcStateRef(ctx.db, ctx.businessId).set({ ninoSealed: sealValue(nino, key), businessId }, { merge: true });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "hmrc-profile");
  }
}
