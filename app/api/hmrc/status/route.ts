// Server-only (v319). The HMRC connection's state for the Integrations page: whether the server is set up (missing settings named, never
// values), whether sending is switched on, and whether the business is connected. No token, number or secret leaves here. Owner only.
import { aiErrorResponse } from "@/lib/apiError";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { hmrcSettings } from "@/lib/hmrcMtd";
import { hmrcStateRef, type HmrcStateDoc } from "@/lib/hmrcServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const s = hmrcSettings(process.env);
    const d = ((await hmrcStateRef(ctx.db, ctx.businessId).get()).data() ?? {}) as HmrcStateDoc;
    const hasBusiness = Boolean(d.ninoSealed && d.businessId); // a yes/no only; the sealed NINO itself never leaves the server
    return Response.json({
      configured: s.configured,
      missing: s.missing,
      submitEnabled: s.submitEnabled,
      connected: d.connected === true,
      connectedAt: d.connectedAt ?? null,
      hasBusiness,
      businessId: d.businessId ?? null,
      lastSubmission: d.lastSubmission ?? null,
    });
  } catch (err) {
    return aiErrorResponse(err, "hmrc-status");
  }
}
