// Lets the admin panel move a lead through its lifecycle (pending ->
// contacted/provisioned/dismissed, optionally with a block on the sender) without ever touching Firestore from
// the client — same rationale as the collection route: there is no client
// SDK path to `trialRequests` at all, so this has to go through the Admin
// SDK, passcode-gated like every other app/api/admin-style route.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { blockIdentity, unblockIdentity } from "@/lib/trialIntakeServer";
import { canonicalEmail } from "@/lib/emailPolicy";
import type { TrialRequest } from "@/lib/types";

export const runtime = "nodejs";

const VALID_STATUSES: TrialRequest["status"][] = ["pending", "contacted", "provisioned", "dismissed"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminPasscode(req);
    const { id } = params;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body?.status as TrialRequest["status"] | undefined;
    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: "status must be one of: " + VALID_STATUSES.join(", ") }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("trialRequests").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json({ error: "No trial request found with that id." }, { status: 404 });
    }

    await ref.update({ status });

    // "Dismiss & block" stops this Gmail identity (dots / +tags collapsed) from requesting again —
    // quietly: the form still says "check your inbox", so a troll isn't told they were blocked.
    // Reopening the request lifts the block, so a mistaken click is one click to undo. Requests
    // from before emailKey existed are keyed from their stored address.
    const data = snap.data() as { emailKey?: string; email?: string };
    const key = data.emailKey || (data.email ? canonicalEmail(data.email) : "");
    if (key) {
      if (status === "dismissed" && body?.block === true) {
        await blockIdentity(key, "blocked from the admin panel");
      } else if (status !== "dismissed") {
        await unblockIdentity(key).catch((err) => console.error("[trial-requests PATCH] unblock failed", err));
      }
    }
    return Response.json({ id, status });
  } catch (err) {
    return adminErrorResponse(err, "trial-requests/[id] PATCH");
  }
}
