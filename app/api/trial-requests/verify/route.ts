// The second half of "Request a trial": the visitor clicked the link we emailed to the address they
// typed, which proves they can read that inbox. Only now does the submission leave the holding area
// (`trialIntake`, see lib/trialIntakeServer.ts) and become a real lead — the admin is told, and if
// AUTO_ACTIVATE_TRIALS is on the account is made, in that order and no earlier.
//
// Why POST and not GET: the link in the email opens /verify-trial, a page that makes this POST from
// the browser. A mail scanner or link-preview bot that merely FETCHES the URL (many corporate and
// consumer mail systems do, before the human ever sees the message) therefore can't confirm an
// address on the owner's behalf — it would have to run the page's JavaScript.
//
// Like /api/start, every failure looks the same (expired, tampered, already used) so the response
// teaches a guesser nothing, and it is rate limited because each call reads and writes Firestore.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { verifyLinkToken } from "@/lib/signedToken";
import { finishTrialRequest } from "@/lib/trialCommitServer";
import { INTAKE_COLLECTION, identityHasAccount, isIdentityBlocked, trustedOrigin, type IntakeDoc } from "@/lib/trialIntakeServer";
import type { TrialRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gone = () =>
  Response.json(
    { error: "This confirmation link has expired or was already used. If you haven't heard from us, request your trial again." },
    { status: 410 }
  );

export async function POST(req: Request) {
  try {
    if (await isRateLimited("trial-verify", requestIp(req), 30, 60 * 60 * 1000)) {
      return Response.json({ error: "Please try again in a little while." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const id = verifyLinkToken(typeof body?.t === "string" ? body.t : null, "verify-trial");
    if (!id) return gone();

    // Claim the submission atomically: whoever deletes the holding document owns it, so two taps of
    // the button (or a double-fired request) can't both create a lead and both email the admin.
    const db = getAdminDb();
    const ref = db.collection(INTAKE_COLLECTION).doc(id);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      tx.delete(ref);
      return snap.data() as IntakeDoc;
    });
    if (!claimed || claimed.shadowRejected) return gone();

    // The world may have moved since the form was submitted (they were blocked, or got an account
    // some other way). Re-check rather than trust a link that is up to 24 hours old.
    if (await isIdentityBlocked(claimed.emailKey)) return gone();
    if (await identityHasAccount(claimed.email, claimed.emailKey)) {
      return Response.json({ ok: true, state: "has_account" });
    }

    try {
      const result = await finishTrialRequest({
        name: claimed.name,
        email: claimed.email,
        emailKey: claimed.emailKey,
        fields: claimed.fields as Partial<TrialRequest>,
        suspicionScore: claimed.suspicionScore ?? 0,
        suspicionReasons: claimed.suspicionReasons ?? [],
        emailVerified: true,
        origin: trustedOrigin(req),
      });
      return Response.json({ ok: true, state: result.activated ? "activated" : "confirmed" });
    } catch (err) {
      // Saving the lead failed: put the submission back so the same link still works on a retry.
      await ref.set(claimed).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("[trial-requests/verify POST]", err);
    return Response.json({ error: "Something went wrong. Please try the link again in a moment." }, { status: 500 });
  }
}
