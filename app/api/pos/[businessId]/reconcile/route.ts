// POS daily reconciliation (pass 311). The POS posts its own total for one day (signed, same as sales). Balancr sums the
// POS sales it has posted for that date and records whether they match. The result is kept at
// users/{businessId}/pos_recon/{date} so a mismatch is visible, not silent.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadSecretKey, openValue } from "@/lib/secretBox";
import { verifyPosSignature, validatePosDayTotal, reconcileDay, summarisePostedPos, type PostedSaleLike } from "@/lib/pos-ingest";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    const { businessId } = params;
    if (!ID.test(businessId)) return Response.json({ error: "Unknown account." }, { status: 404 });
    const db = getAdminDb();
    const meta = await db.doc(`users/${businessId}/meta/posIngest`).get();
    const sealed = (meta.data() as { secretSealed?: unknown } | undefined)?.secretSealed;
    if (typeof sealed !== "string") return Response.json({ error: "No POS key for this account." }, { status: 401 });
    const secret = openValue(sealed, loadSecretKey(process.env.BALANCR_ENC_KEY));
    if (!secret) return Response.json({ error: "The POS key cannot be read on the server." }, { status: 503 });

    const body = await req.text();
    const auth = verifyPosSignature({
      secret,
      timestamp: req.headers.get("x-pos-timestamp") ?? "",
      body,
      signature: req.headers.get("x-pos-signature") ?? "",
      nowMs: Date.now(),
    });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return Response.json({ error: "Body is not JSON." }, { status: 400 });
    }
    const v = validatePosDayTotal(parsed);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

    const snap = await db
      .collection(`users/${businessId}/sales`)
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
    await db.doc(`users/${businessId}/pos_recon/${v.value.date}`).set({
      ...result,
      date: v.value.date,
      checkedAt: new Date().toISOString(),
      checkedBy: "till",
    });
    return Response.json({ ok: true, date: v.value.date, ...result });
  } catch (err) {
    console.error("[pos reconcile] failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not check the day. Try again." }, { status: 500 });
  }
}
