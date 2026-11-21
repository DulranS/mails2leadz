// Server-side storage for the trial form's "confirm your email first" step.
//
// The rule that makes the rest simple: `trialRequests` (the queue the admin works, the daily
// digest counts, the auto-activation reads) only ever receives a submission AFTER its sender has
// clicked the link emailed to the address they typed. Everything before that — and everything we
// decided to quietly discard — lives in `trialIntake`, a holding area nothing else reads. So a
// flood of junk can never push real leads out of the admin's list, inflate the "leads waiting"
// count, or reach auto-activation; at worst it fills a collection that expires on its own.
//
// Neither collection has a firestore.rules entry, so the client SDK is denied both ways; only the
// Admin SDK (these helpers) can touch them.
import { createHash } from "crypto";
import { configuredSiteUrl } from "@/lib/envDefaults";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const INTAKE_COLLECTION = "trialIntake";
export const BLOCKS_COLLECTION = "trialBlocks";
// How long an unconfirmed submission is kept. The emailed link lives 24h; the rest is slack so a
// late click gets a clear "expired" rather than looking like it never existed.
export const INTAKE_KEEP_DAYS = 7;
// How long the emailed confirmation link works.
export const CONFIRM_LINK_HOURS = 24;

export interface IntakeDoc {
  name: string;
  email: string; // as typed, lowercased — what we email and what the login will be created with
  emailKey: string;
  fields: Record<string, unknown>; // businessName, interestedPlan, teamSize, message + forensic headers
  suspicionScore: number;
  suspicionReasons: string[];
  // Discarded at intake (blocked identity, or score ≥ SHADOW_AT): kept for audit, never emailed,
  // and its id can never be confirmed.
  shadowRejected?: boolean;
  ipAddress?: string;
  createdAt: number;
  updatedAt: number;
}

// One document per identity: resubmitting overwrites it, so one person (or one troll) can only ever
// occupy one slot however often they press the button.
export function intakeId(emailKey: string): string {
  return createHash("sha256").update(`trial-intake:${emailKey}`).digest("hex").slice(0, 32);
}

export async function isIdentityBlocked(emailKey: string): Promise<boolean> {
  try {
    const snap = await getAdminDb().collection(BLOCKS_COLLECTION).doc(intakeId(emailKey)).get();
    return snap.exists;
  } catch (err) {
    // Fails open, like the rate limiter: a lookup hiccup shouldn't turn away a real prospect.
    console.error("[trial-intake] block lookup failed, failing open", err);
    return false;
  }
}

export async function blockIdentity(emailKey: string, note?: string): Promise<void> {
  await getAdminDb()
    .collection(BLOCKS_COLLECTION)
    .doc(intakeId(emailKey))
    .set({ emailKey, ...(note ? { note: note.slice(0, 200) } : {}), createdAt: Date.now() });
}

export async function unblockIdentity(emailKey: string): Promise<void> {
  await getAdminDb().collection(BLOCKS_COLLECTION).doc(intakeId(emailKey)).delete();
}

// Does this person already have a login — under the address as typed, under its Gmail-collapsed
// form, or through an earlier request that was provisioned for the same collapsed identity (which
// is what catches "john.doe@" after "johndoe@" was given a trial)? One trial per person.
export async function identityHasAccount(email: string, emailKey: string): Promise<boolean> {
  const auth = getAdminAuth();
  for (const candidate of new Set([email, emailKey])) {
    try {
      await auth.getUserByEmail(candidate);
      return true;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") console.error("[trial-intake] account lookup failed", err);
    }
  }
  try {
    const snap = await getAdminDb().collection("trialRequests").where("emailKey", "==", emailKey).limit(10).get();
    if (snap.docs.some((d) => (d.data() as { status?: string }).status === "provisioned")) return true;
  } catch (err) {
    console.error("[trial-intake] provisioned-request lookup failed", err);
  }
  return false;
}

// How many different identities this IP has submitted in the last 24h (this one excluded).
// Best effort and single-field only (no composite index to deploy); 0 on any failure.
export async function distinctIdentitiesFromIp(ip: string, exceptKey: string, now = Date.now()): Promise<number> {
  if (!ip || ip === "unknown") return 0;
  try {
    const snap = await getAdminDb().collection(INTAKE_COLLECTION).where("ipAddress", "==", ip).limit(40).get();
    const keys = new Set<string>();
    for (const d of snap.docs) {
      const r = d.data() as { emailKey?: string; createdAt?: number };
      if (r.emailKey && r.emailKey !== exceptKey && typeof r.createdAt === "number" && now - r.createdAt < 24 * 3_600_000) {
        keys.add(r.emailKey);
      }
    }
    return keys.size;
  } catch (err) {
    console.error("[trial-intake] ip lookup failed", err);
    return 0;
  }
}

// Daily housekeeping (lib/dailyJob.ts): drop unconfirmed / discarded submissions past their keep
// window, and old rate-limit counters aren't touched here. Returns how many were removed.
export async function purgeExpiredIntake(now = Date.now()): Promise<number> {
  const db = getAdminDb();
  const cutoff = now - INTAKE_KEEP_DAYS * 24 * 3_600_000;
  let removed = 0;
  for (let round = 0; round < 5; round++) {
    const snap = await db.collection(INTAKE_COLLECTION).where("createdAt", "<", cutoff).limit(300).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 300) break;
  }
  return removed;
}

// The link in the confirmation email must point at OUR site. siteOrigin() will fall back to the
// request's Origin header when NEXT_PUBLIC_SITE_URL is unset — fine for a link going to the admin,
// but here the email goes to a third party, and an attacker-chosen Origin would turn it into a
// phishing mail from our own sender. So: the configured URL, else the host the request really
// arrived on, never the Origin header.
export function trustedOrigin(req: Request): string {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
