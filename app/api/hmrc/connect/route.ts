// Server-only (v319). Starts the HMRC sign-in: makes a one-time state value, keeps it for ten minutes against this business, and answers
// the HMRC sign-in address for the browser to open. Owner only. Without the HMRC settings it answers 503 and names them.
import { aiErrorResponse } from "@/lib/apiError";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { hmrcSettings } from "@/lib/hmrcMtd";
import { hmrcAuthorizeAddress } from "@/lib/hmrcClient";
import { newOauthState, STATE_TTL_MS } from "@/lib/hmrcServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const s = hmrcSettings(process.env);
    if (!s.configured) {
      return Response.json({ error: `HMRC isn't set up on this server yet. The operator needs to set ${s.missing.join(", ")}.`, missing: s.missing }, { status: 503 });
    }
    const state = newOauthState();
    await ctx.db.collection("hmrcStates").doc(state).set({ businessId: ctx.businessId, uid: ctx.uid, expiresAt: Date.now() + STATE_TTL_MS });
    return Response.json({ url: hmrcAuthorizeAddress(s, state) });
  } catch (err) {
    return aiErrorResponse(err, "hmrc-connect");
  }
}
