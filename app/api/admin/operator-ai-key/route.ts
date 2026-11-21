// Operator DeepSeek key (pass 308): the admin pastes it in the admin panel instead of on Vercel. It is stored
// encrypted under BALANCR_ENC_KEY, is used only by admin accounts and AI_OPERATOR_BUSINESS_IDS, and is never returned.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadSecretKey, sealValue, secretHint } from "@/lib/secretBox";

export const runtime = "nodejs";

const DOC = "system/operator_ai";

export async function GET(req: Request) {
  try {
    await requireAdminPasscode(req);
    const snap = await getAdminDb().doc(DOC).get();
    const data = snap.data() as { hint?: string | null } | undefined;
    return Response.json({ hint: data?.hint ?? null });
  } catch (err) {
    return adminErrorResponse(err, "admin/operator-ai-key GET");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const body = await req.json().catch(() => ({}));
    const plain = typeof body?.deepseekKey === "string" ? body.deepseekKey.trim() : "";
    const db = getAdminDb();
    if (!plain) {
      await db.doc(DOC).set({ deepseekKey: null, hint: null, updatedAt: new Date().toISOString() }, { merge: true });
      return Response.json({ ok: true, hint: null });
    }
    if (plain.length > 300) return Response.json({ error: "That does not look like an API key." }, { status: 400 });
    const key = loadSecretKey(process.env.BALANCR_ENC_KEY);
    if (!key) {
      return Response.json({ error: "Set BALANCR_ENC_KEY on the server first: it encrypts the key you save here." }, { status: 503 });
    }
    const hint = secretHint(plain);
    await db.doc(DOC).set({ deepseekKey: sealValue(plain, key), hint, updatedAt: new Date().toISOString() }, { merge: true });
    return Response.json({ ok: true, hint });
  } catch (err) {
    return adminErrorResponse(err, "admin/operator-ai-key POST");
  }
}
