// Writes trialEndsAt on users/{businessId}/meta/account — same doc, same
// Admin-SDK-bypass rationale as the sibling suspend/ and billing/ routes.
// This is deliberately the only place that field is ever set: once at
// provisioning time (see ProvisionForm in app/admin/new-business/page.tsx,
// which calls this right after provisionBusinessOwner creates the account
// — provisioning.ts itself can't touch meta/account, since firestore.rules
// denies client writes to it outright), then again whenever the admin
// extends or clears it from the "Manage accounts" tab.
//
// An expired trial locks itself after a grace period (lib/accountAccess.ts);
// extending or clearing it here is what unlocks it.
//
// Three things this route can do, chosen by which field is on the body:
//   - { days }       set trialEndsAt to (today + days) — initial trial
//   - { extendDays } push trialEndsAt out by that many days from whichever
//                     is later of "today" or the existing date, so
//                     extending an already-expired trial starts counting
//                     from now rather than compounding past lateness
//   - { clear: true } remove trialEndsAt entirely — "this is a paying
//                     account now", not a trial anymore
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import type { AccountStatus } from "@/lib/types";
import { trialExtendedEmail } from "@/lib/lifecycle";
import { emailOwner } from "@/lib/lifecycleServer";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysFrom(base: Date, days: number): string {
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!businessId) {
      return Response.json({ error: "businessId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.doc(`users/${businessId}/meta/account`);

    // Same existence check as suspend/route.ts and billing/route.ts — no
    // reason to let a typo'd id silently create a stray meta/account doc.
    const membershipSnap = await db.collection("memberships").doc(businessId).get();
    const pointerBusinessId = (membershipSnap.data() as { businessId?: string } | undefined)?.businessId;
    if (!membershipSnap.exists || pointerBusinessId !== businessId) {
      return Response.json({ error: "No business found with that id." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date();

    if (body?.clear === true) {
      const before = ((await ref.get()).data() as AccountStatus | undefined) ?? undefined;
      const update: Record<string, unknown> = { trialEndsAt: FieldValue.delete() };
      // Remember that this was a trial that converted (once) — feeds the admin's conversion rate.
      if (before?.trialEndsAt && !before.convertedAt) update.convertedAt = now.getTime();
      await ref.set(update, { merge: true });
      return Response.json({ businessId, trialEndsAt: null });
    }

    const daysRaw = body?.days;
    const extendDaysRaw = body?.extendDays;

    let trialEndsAt: string | undefined;
    let isExtension = false;

    if (typeof daysRaw === "number" && Number.isFinite(daysRaw) && daysRaw > 0) {
      trialEndsAt = isoDaysFrom(now, Math.round(daysRaw));
    } else if (typeof extendDaysRaw === "number" && Number.isFinite(extendDaysRaw) && extendDaysRaw > 0) {
      const existingSnap = await ref.get();
      const existing = existingSnap.data() as AccountStatus | undefined;
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const currentEnd = existing?.trialEndsAt ? new Date(existing.trialEndsAt + "T00:00:00Z") : null;
      const base = currentEnd && currentEnd.getTime() > today.getTime() ? currentEnd : today;
      trialEndsAt = isoDaysFrom(base, Math.round(extendDaysRaw));
      isExtension = true;
    } else {
      return Response.json(
        { error: "Provide days (new trial), extendDays (push out), or clear (end trial)." },
        { status: 400 }
      );
    }

    await ref.set({ trialEndsAt }, { merge: true });
    // An extension is good news the customer should hear from us, not discover on the
    // lock screen's absence. (A brand-new trial gets the welcome email instead.)
    const newEnd = trialEndsAt;
    const trialEmail =
      isExtension && body?.notifyCustomer !== false
        ? await emailOwner(businessId, (ctx) => trialExtendedEmail({ ...ctx, newEnd }), req)
        : "skipped";
    return Response.json({ businessId, trialEndsAt, trialEmail });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/[businessId]/trial POST");
  }
}
