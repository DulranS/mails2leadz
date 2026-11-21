// Puts a trial submission into the real queue (`trialRequests`) and does everything that used to
// happen the moment the form was submitted: merge a repeat ask from the same person, email the
// admin, optionally activate the account, and send the visitor their "we've got it".
//
// Two callers, deliberately the only two:
//   • app/api/trial-requests/verify/route.ts — the visitor clicked the link emailed to the address
//     they typed (`emailVerified: true`). This is the normal path.
//   • app/api/trial-requests/route.ts — ONLY when email sending isn't configured, so a confirmation
//     link can't be sent at all. The lead is then kept rather than lost, flagged as unconfirmed;
//     scripts/check-launch-readiness.mjs warns loudly about that state.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { acknowledgeTrialRequest, notifyAdminOfTrialRequest } from "@/lib/email";
import { cronWarningText } from "@/lib/cronHealth";
import { mergeFollowUpTrialRequest } from "@/lib/trialRequestDedup";
import { autoActivateRequest, type ProvisionOwnerResult } from "@/lib/provisionServer";
import { isRateLimited } from "@/lib/rateLimit";
import type { TrialRequest } from "@/lib/types";

export interface CommitInput {
  name: string;
  email: string;
  emailKey: string;
  // businessName / interestedPlan / teamSize / message plus the forensic headers, already clipped.
  fields: Partial<TrialRequest>;
  suspicionScore: number;
  suspicionReasons: string[];
  emailVerified: boolean;
  origin: string;
}

export interface CommitResult {
  requestId: string;
  isFollowUp: boolean;
  activated: ProvisionOwnerResult | null;
}

const OPEN = ["pending", "contacted"];

async function findOpenRequest(email: string, emailKey: string): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const db = getAdminDb();
  // Same address, still open — the lookup that already existed (composite index in
  // firestore.indexes.json); catches requests from before emailKey was stored.
  try {
    const byEmail = await db
      .collection("trialRequests")
      .where("email", "==", email)
      .where("status", "in", OPEN)
      .limit(1)
      .get();
    if (!byEmail.empty) return byEmail.docs[0];
  } catch (err) {
    console.error("[trial-commit] email follow-up lookup failed, falling back to a new request", err);
  }
  // Same Gmail inbox typed differently (john.doe@ vs johndoe@). Single-field query, no index.
  try {
    const byKey = await db.collection("trialRequests").where("emailKey", "==", emailKey).limit(10).get();
    const open = byKey.docs.find((d) => OPEN.includes((d.data() as { status?: string }).status ?? ""));
    if (open) return open;
  } catch (err) {
    console.error("[trial-commit] emailKey follow-up lookup failed", err);
  }
  return null;
}

export async function commitTrialRequest(input: CommitInput): Promise<{ requestId: string; isFollowUp: boolean; eligibleForAuto: boolean }> {
  const db = getAdminDb();
  const { name, email, emailKey, fields } = input;
  const extra: Partial<TrialRequest> = {
    emailKey,
    ...(input.emailVerified ? { emailVerifiedAt: Date.now() } : {}),
    ...(input.suspicionScore > 0
      ? { suspicionScore: input.suspicionScore, suspicionReasons: input.suspicionReasons }
      : {}),
  };

  const existing = await findOpenRequest(email, emailKey);
  if (existing) {
    const prior = existing.data() as Omit<TrialRequest, "id">;
    const merged = mergeFollowUpTrialRequest(prior, fields.message);
    // Newer name wins; createdAt is bumped so a renewed ask resurfaces at the top of the queue;
    // anything left blank this time is kept from the first submission (`fields` only carries
    // keys the visitor actually filled in).
    await existing.ref.update({ ...fields, ...extra, name, createdAt: Date.now(), ...merged });
    return { requestId: existing.id, isFollowUp: true, eligibleForAuto: prior.status === "pending" };
  }

  const doc: Omit<TrialRequest, "id"> = {
    name,
    email,
    status: "pending",
    createdAt: Date.now(),
    ...fields,
    ...extra,
  };
  const ref = await db.collection("trialRequests").add(doc);
  return { requestId: ref.id, isFollowUp: false, eligibleForAuto: true };
}

// commit + the courtesies around it. Never throws for anything after the request is saved.
export async function finishTrialRequest(input: CommitInput): Promise<CommitResult> {
  const { requestId, isFollowUp, eligibleForAuto } = await commitTrialRequest(input);
  const { name, email, fields, origin } = input;

  // Only an untouched request may be activated automatically — one the admin has already replied
  // to is a conversation a human started. And only a CONFIRMED address: instant access for an
  // address nobody has proven they can read is exactly what this whole step exists to prevent.
  const activated =
    eligibleForAuto && input.emailVerified
      ? await autoActivateRequest({
          requestId,
          name,
          email,
          businessName: fields.businessName,
          interestedPlan: fields.interestedPlan,
          origin,
        })
      : null;

  try {
    await notifyAdminOfTrialRequest({
      name,
      email,
      businessName: fields.businessName,
      interestedPlan: fields.interestedPlan,
      teamSize: fields.teamSize,
      message: fields.message,
      ipAddress: fields.ipAddress,
      referer: fields.referer,
      userAgent: fields.userAgent,
      followUp: isFollowUp,
      adminUrl: origin,
      requestId,
      suspicion: input.suspicionScore > 0 ? input.suspicionReasons : undefined,
      unconfirmed: !input.emailVerified,
      cronWarning: await cronWarningText(),
      ...(activated ? { autoActivated: { welcome: activated.welcome } } : {}),
    });
  } catch (err) {
    console.error("[trial-commit] admin notification failed", err);
  }

  try {
    // An activated lead already has the welcome email, which says everything this one would.
    if (!activated && !(await isRateLimited("trial-ack", email, 1, 24 * 60 * 60 * 1000))) {
      await acknowledgeTrialRequest({ name, email, businessName: fields.businessName, interestedPlan: fields.interestedPlan });
    }
  } catch (err) {
    console.error("[trial-commit] acknowledgement failed", err);
  }

  return { requestId, isFollowUp, activated };
}
