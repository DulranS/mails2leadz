// Pushes one lead's stage change to the business's webhook (Integrations > Automations > Webhook address). Called by the app itself,
// signed in as the owner or a manager (requireAiContext allows only those), when a lead moves stage. Sends nothing to anyone else and
// changes no record. The lead is re-read here, so the stage recorded is the one in the database, not one the browser claims.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { publicLead, resolveAutomations } from "@/lib/leadIntake";
import { pushLeadWebhook } from "@/lib/leadIntakeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = new Set(["new", "contacted", "qualified", "follow_up", "proposal_sent", "won", "lost"]);
const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    if (await isRateLimited("lead-stage-hook", ctx.businessId, 600, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { leadId?: unknown; from?: unknown; to?: unknown };
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const to = typeof body.to === "string" ? body.to : "";
    const from = typeof body.from === "string" ? body.from : "";
    if (!ID_RE.test(leadId) || !STAGES.has(to) || (from && !STAGES.has(from))) throw new AiAuthError("That change could not be sent.", 400);

    const base = ctx.db.collection("users").doc(ctx.businessId);
    const [settingsSnap, leadSnap] = await Promise.all([base.collection("meta").doc("settings").get(), base.collection("leads").doc(leadId).get()]);
    const automations = resolveAutomations((settingsSnap.data() as { automations?: Parameters<typeof resolveAutomations>[0] } | undefined)?.automations);
    if (!automations.outboundWebhookUrl) return Response.json({ ok: true, sent: false });
    if (!leadSnap.exists) throw new AiAuthError("That lead could not be found.", 404);
    const data = leadSnap.data() as Record<string, unknown>;
    const sent = await pushLeadWebhook(automations.outboundWebhookUrl, {
      event: "lead.stage_changed",
      from: from || null,
      to,
      lead: publicLead(leadSnap.id, data),
    });
    return Response.json({ ok: true, sent });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[webhooks/lead-stage]", err);
    return Response.json({ error: "Couldn't send that change." }, { status: 500 });
  }
}
