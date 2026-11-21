// Permanently deletes one business and all of its data (users/{businessId} and everything under it). Platform admins only (the admin passcode), and only when
// the request repeats the business ID exactly, so a stray click cannot delete anything. The Admin SDK bypasses the client rules on purpose: that is what makes
// this the one place a business can be removed. Irreversible: there is no undo. Use it for test accounts or a business that has asked to be removed.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!businessId || businessId.includes("/")) {
      return Response.json({ error: "A business ID is required." }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== businessId) {
      return Response.json({ error: "Type the business ID exactly to confirm the delete." }, { status: 400 });
    }
    const db = getAdminDb();
    await db.recursiveDelete(db.collection("users").doc(businessId));
    return Response.json({ ok: true, deleted: businessId });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/[businessId]/delete POST");
  }
}
