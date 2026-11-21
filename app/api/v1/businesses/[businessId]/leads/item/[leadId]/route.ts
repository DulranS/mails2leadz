// One lead, for the AutoLeads sync (v263). The same lead API key as the lead list.
//   GET   /api/v1/businesses/{businessId}/leads/item/{leadId}            -> { lead }
//   PATCH /api/v1/businesses/{businessId}/leads/item/{leadId}  body: { stage }  -> { lead }
// A stage is one of the lead stages (new, contacted, qualified, follow_up, proposal_sent, won, lost). Moving a lead to won or lost here does not create
// a customer or a sale: that is still done by the owner in Balancr.
import { authoriseLeadApi, businessIdFrom, json } from "@/lib/leadApiAuth";
import { publicLead } from "@/lib/leadIntake";
import { LEAD_STAGES } from "@/lib/types";
import { logSync } from "@/lib/syncLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function leadIdFrom(req: Request): string {
  const parts = new URL(req.url).pathname.split("/");
  return decodeURIComponent(parts[parts.indexOf("item") + 1] ?? "");
}

export async function GET(req: Request) {
  try {
    const auth = await authoriseLeadApi(req, businessIdFrom(req));
    if (!auth.ok) return auth.response;
    const id = leadIdFrom(req);
    if (!id) return json({ error: "Name the lead." }, 400);
    const snap = await auth.found.base.collection("leads").doc(id).get();
    if (!snap.exists) return json({ error: "No lead with that id." }, 404);
    return json({ lead: publicLead(snap.id, snap.data() as Record<string, unknown>) }, 200);
  } catch {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authoriseLeadApi(req, businessIdFrom(req));
    if (!auth.ok) return auth.response;
    const id = leadIdFrom(req);
    if (!id) return json({ error: "Name the lead." }, 400);
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Send the stage as a JSON body." }, 400); }
    const stage = body && typeof body === "object" ? (body as { stage?: unknown }).stage : undefined;
    if (typeof stage !== "string" || !LEAD_STAGES.some((s) => s.value === stage)) {
      return json({ error: "That is not a lead stage." }, 400);
    }
    const ref = auth.found.base.collection("leads").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "No lead with that id." }, 404);
    await ref.update({ stage, updatedAt: Date.now() });
    await logSync(auth.found.base, { action: "lead.stage", recordId: id, ok: true, detail: stage });
    const after = await ref.get();
    return json({ lead: publicLead(after.id, after.data() as Record<string, unknown>) }, 200);
  } catch {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
