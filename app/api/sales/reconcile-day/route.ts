// Owner check of one till day (pass 313). The owner types the till's end-of-day total and sale count; Balancr compares them
// with the sales that came from the till for that date (createdByUid "pos"), using the same rule as the till's signed check.
// Signed in as Owner or Manager. Nothing is changed in the sales; the result is kept at users/{id}/pos_recon/{date}.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { validatePosDayTotal, reconcileDay, summarisePostedPos, type PostedSaleLike } from "@/lib/pos-ingest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Send the day and the till totals." }, { status: 400 });
    }
    const v = validatePosDayTotal(body);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

    const snap = await ctx.db
      .collection(`users/${ctx.businessId}/sales`)
      .where("date", "==", v.value.date)
      .where("createdByUid", "==", "pos")
      .get();
    const posted = summarisePostedPos(snap.docs.map((d) => d.data() as PostedSaleLike));
    const result = reconcileDay({
      expectedTotal: v.value.expectedTotal,
      expectedTransactions: v.value.expectedTransactions,
      postedTotal: posted.postedTotal,
      postedTransactions: posted.postedTransactions,
    });
    await ctx.db.doc(`users/${ctx.businessId}/pos_recon/${v.value.date}`).set({
      ...result,
      date: v.value.date,
      checkedAt: new Date().toISOString(),
      checkedBy: "owner",
    });
    return Response.json({ ok: true, date: v.value.date, ...result });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[sales reconcile-day] failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not check the day. Try again." }, { status: 500 });
  }
}
