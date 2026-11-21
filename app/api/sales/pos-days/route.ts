// POS days (pass 340): the saved till day checks, newest first. Read only. Owner or Manager.
// The checks are written by the till's signed route and the owner's check (users/{id}/pos_recon/{date}).
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { posDayRow } from "@/lib/pos-ingest";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    const snap = await ctx.db.collection(`users/${ctx.businessId}/pos_recon`).orderBy("date", "desc").limit(60).get();
    const days = snap.docs.map((d) => posDayRow(d.id, d.data() as Record<string, unknown>));
    return Response.json({ days, mismatches: days.filter((d) => d.status === "mismatch").length });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[sales pos-days] failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not load the POS days. Try again." }, { status: 500 });
  }
}
