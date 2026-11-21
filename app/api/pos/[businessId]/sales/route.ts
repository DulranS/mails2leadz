// POS sales (passes 309-310). A point-of-sale posts sales lines, signed with the account's POS key (lib/pos-ingest.ts).
// Each line goes through the same importer the sales CSV uses, so product names/SKUs, dates and amounts are checked the
// same way. All or nothing: if any line is wrong, nothing is posted. A line already posted (same txId) is skipped.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadSecretKey, openValue } from "@/lib/secretBox";
import { verifyPosSignature, validatePosSales, posSaleDocId } from "@/lib/pos-ingest";
import { importSalesRows } from "@/lib/csv";
import type { Product } from "@/lib/types";

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
    const v = validatePosSales(parsed);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

    const productsSnap = await db.collection(`users/${businessId}/products`).get();
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as unknown as Product[];
    const records = v.value.map((s) => ({
      product: s.product,
      qty: String(s.qty),
      unitPrice: String(s.unitPrice),
      date: s.date,
      customer: s.customer,
      notes: s.notes,
    }));
    const imported = importSalesRows(records, products);
    if (imported.errors.length > 0) {
      return Response.json(
        { error: "Nothing was posted. Fix these lines and send again.", errors: imported.errors.slice(0, 50) },
        { status: 400 }
      );
    }

    const refs = v.value.map((s, i) => db.doc(`users/${businessId}/sales/${posSaleDocId(businessId, s.txId, i)}`));
    const existing = await db.getAll(...refs);
    const at = new Date().toISOString();
    const batch = db.batch();
    let posted = 0;
    let duplicates = 0;
    existing.forEach((snap, i) => {
      if (snap.exists) {
        duplicates++;
        return;
      }
      batch.set(refs[i], {
        ...imported.rows[i],
        id: refs[i].id,
        paymentMethod: v.value[i].paymentMethod,
        posRef: v.value[i].txId,
        createdAt: at,
        createdByUid: "pos",
      });
      posted++;
    });
    if (posted > 0) await batch.commit();
    return Response.json({ ok: true, posted, duplicates });
  } catch (err) {
    console.error("[pos sales] failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not record the sales. Try again." }, { status: 500 });
  }
}
