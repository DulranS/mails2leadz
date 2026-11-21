// Lets the admin panel move a note through its lifecycle (new -> read ->
// resolved, or reopen it) without ever touching Firestore from the
// client — same rationale as app/api/feedback/route.ts: there is no
// client SDK path to `feedback` at all, so this goes through the Admin
// SDK, passcode-gated like every other app/api/admin-style route.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import type { Feedback } from "@/lib/types";

export const runtime = "nodejs";

const VALID_STATUSES: Feedback["status"][] = ["new", "read", "resolved"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminPasscode(req);
    const { id } = params;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body?.status as Feedback["status"] | undefined;
    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: "status must be one of: " + VALID_STATUSES.join(", ") }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("feedback").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json({ error: "No feedback item found with that id." }, { status: 404 });
    }

    await ref.update({ status });
    return Response.json({ id, status });
  } catch (err) {
    return adminErrorResponse(err, "feedback/[id] PATCH");
  }
}
