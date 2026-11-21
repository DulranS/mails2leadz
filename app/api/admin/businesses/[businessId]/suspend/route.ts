// Flips a business's suspended flag at users/{businessId}/meta/account.
// This is the ONLY place that doc is ever written — firestore.rules denies
// client writes to it outright (see the comment there), specifically so a
// suspended business's owner can't just flip themselves back on with the
// same SDK that runs the rest of the app. The Admin SDK bypasses rules
// entirely, which is what makes that guarantee mean anything.
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { resolveAccess } from "@/lib/accountAccess";
import { reactivatedEmail } from "@/lib/lifecycle";
import { emailOwner } from "@/lib/lifecycleServer";
import type { AccountStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!businessId) {
      return Response.json({ error: "businessId is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const suspended = body?.suspended === true;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "";

    const db = getAdminDb();

    // Confirms this is actually a business (an owner pointer exists) rather
    // than silently creating a meta/account doc for an arbitrary/typo'd id.
    const membershipSnap = await db.collection("memberships").doc(businessId).get();
    const pointerBusinessId = (membershipSnap.data() as { businessId?: string } | undefined)?.businessId;
    if (!membershipSnap.exists || pointerBusinessId !== businessId) {
      return Response.json({ error: "No business found with that id." }, { status: 404 });
    }

    const now = Date.now();
    // FieldValue.delete() rather than omitting/undefined-ing the field —
    // ignoreUndefinedProperties (see lib/firebaseAdmin.ts) means an
    // undefined value is simply left out of the write, not used to clear
    // an existing one, which would leave a stale suspend reason sitting on
    // the doc after a reactivate.
    await db.doc(`users/${businessId}/meta/account`).set(
      suspended
        ? { suspended: true, suspendedAt: now, reason: reason || FieldValue.delete() }
        : { suspended: false, reactivatedAt: now, reason: FieldValue.delete() },
      { merge: true }
    );

    // Switching someone back on is worth a line from us. Only when they can really sign in
    // again: an account that is still locked by an expired trial or an overdue renewal must
    // not be told "you're back".
    let reactivationEmail: string = "skipped";
    if (!suspended && body?.notifyCustomer !== false) {
      const account = (await db.doc(`users/${businessId}/meta/account`).get()).data() as AccountStatus | undefined;
      if (!resolveAccess(account).locked) {
        reactivationEmail = await emailOwner(businessId, (ctx) => reactivatedEmail(ctx), req);
      }
    }
    return Response.json({ businessId, suspended, reactivationEmail });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/[businessId]/suspend POST");
  }
}
