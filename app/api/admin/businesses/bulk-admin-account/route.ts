// Admin accounts (pass 308): the admin ticks accounts and marks them. They are never billed or locked by trial or
// renewal (suspension still applies), and they may use the operator's DeepSeek key. Admin passcode only.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MAX = 200;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body?.adminAccount !== "boolean") {
      return Response.json({ error: "Say whether to mark or unmark them." }, { status: 400 });
    }
    const ids: unknown[] = Array.isArray(body?.businessIds) ? body.businessIds : [];
    const businessIds = [...new Set(ids.filter((x): x is string => typeof x === "string" && ID.test(x)))];
    if (businessIds.length === 0) return Response.json({ error: "Pick at least one account." }, { status: 400 });
    if (businessIds.length > MAX) return Response.json({ error: `Up to ${MAX} accounts at a time.` }, { status: 400 });

    const db = getAdminDb();
    const batch = db.batch();
    const at = new Date().toISOString();
    for (const id of businessIds) {
      batch.set(db.doc(`users/${id}/meta/account`), { adminAccount: body.adminAccount, adminAccountSetAt: at }, { merge: true });
    }
    await batch.commit();
    return Response.json({ ok: true, updated: businessIds.length, adminAccount: body.adminAccount });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/bulk-admin-account POST");
  }
}
