// The server half of the customer lifecycle (rules + wording live in lib/lifecycle.ts).
// Looks up who to write to, sends, and remembers what was sent so nothing goes out twice.
//
// Contract every function here keeps: it NEVER throws. An email is a courtesy on top of a
// state change that has already been saved (an account created, a payment recorded); a
// Resend outage must not turn a successful action into an error screen. Each returns an
// honest status instead, and the admin UI says exactly what happened.

import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { sendEmail, explainEmailFailure } from "@/lib/email";
import { configuredSiteUrl } from "@/lib/envDefaults";
import { firstNameOf, type BuiltEmail, type EmailCtx } from "@/lib/lifecycle";

export type SendStatus = "sent" | "not_configured" | "failed" | "no_owner";

// The public address of this deployment — what links in emails point at. Prefer the
// configured site URL (so an email never links to a preview/localhost origin by accident),
// fall back to the origin the admin is using right now.
export function siteOrigin(req?: Request): string {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  if (req) {
    const origin = req.headers.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
    try {
      return new URL(req.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}

export function buildEmailCtx(origin: string, ownerName: string | null | undefined, businessName?: string | null): EmailCtx {
  return {
    firstName: firstNameOf(ownerName),
    businessName: businessName?.trim() || undefined,
    loginUrl: `${origin}/login`,
    supportEmail: (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim() || undefined,
    supportWhatsapp: (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") || undefined,
    paymentInstructions: (process.env.NEXT_PUBLIC_PAYMENT_INSTRUCTIONS ?? "").trim() || undefined,
  };
}

export interface OwnerInfo {
  email: string;
  name: string;
  businessName: string | null;
}

export async function loadOwner(businessId: string): Promise<OwnerInfo | null> {
  try {
    const db = getAdminDb();
    const [memberSnap, settingsSnap] = await Promise.all([
      db.doc(`users/${businessId}/members/${businessId}`).get(),
      db.doc(`users/${businessId}/meta/settings`).get(),
    ]);
    const member = memberSnap.data() as { email?: string; name?: string } | undefined;
    if (!member?.email) return null;
    const settings = settingsSnap.data() as { businessName?: string } | undefined;
    return { email: member.email, name: member.name ?? "", businessName: settings?.businessName ?? null };
  } catch (err) {
    console.error("lifecycle loadOwner", err);
    return null;
  }
}

// Sends one built email to a business's owner. `owner` can be passed when the caller has
// already loaded it (the daily job does, to avoid a second read).
export async function emailOwnerDetailed(
  businessId: string,
  build: (ctx: EmailCtx, owner: OwnerInfo) => BuiltEmail,
  req?: Request,
  owner?: OwnerInfo | null
): Promise<{ status: SendStatus; reason?: string }> {
  const who = owner ?? (await loadOwner(businessId));
  if (!who) return { status: "no_owner" };
  try {
    const ctx = buildEmailCtx(siteOrigin(req), who.name, who.businessName);
    const { subject, text } = build(ctx, who);
    const sent = await sendEmail({ to: who.email, subject, text, ...(ctx.supportEmail ? { replyTo: ctx.supportEmail } : {}) });
    return { status: sent ? "sent" : "not_configured" };
  } catch (err) {
    console.error("lifecycle email failed", businessId, err);
    // The reason is for the admin's screen only (see app/api/admin/*); a customer never sees it.
    return { status: "failed", reason: explainEmailFailure(err) };
  }
}

export async function emailOwner(
  businessId: string,
  build: (ctx: EmailCtx, owner: OwnerInfo) => BuiltEmail,
  req?: Request,
  owner?: OwnerInfo | null
): Promise<SendStatus> {
  return (await emailOwnerDetailed(businessId, build, req, owner)).status;
}

// ---- "already sent" memory: users/{businessId}/meta/lifecycle -> { sent: { "<key>": ms } } ----
// Server-only: firestore.rules has no rule for this doc, so clients can neither read nor
// write it (default deny), and the Admin SDK ignores rules.

export async function loadSentKeys(businessId: string): Promise<Record<string, number>> {
  try {
    const snap = await getAdminDb().doc(`users/${businessId}/meta/lifecycle`).get();
    return ((snap.data() as { sent?: Record<string, number> } | undefined)?.sent) ?? {};
  } catch (err) {
    console.error("lifecycle loadSentKeys", err);
    return {};
  }
}

export async function markSent(businessId: string, key: string): Promise<void> {
  try {
    await getAdminDb().doc(`users/${businessId}/meta/lifecycle`).set({ sent: { [key]: Date.now() } }, { merge: true });
  } catch (err) {
    console.error("lifecycle markSent", err);
  }
}

// Has the owner ever signed in? Firebase Auth records the last sign-in time once they have.
// Returns null when it cannot be told (a lookup failure) — callers treat "unknown" as "leave
// them alone": a follow-up must never go to someone who is already using the product.
export async function ownerHasSignedIn(uid: string): Promise<boolean | null> {
  try {
    const user = await getAdminAuth().getUser(uid);
    return !!user.metadata.lastSignInTime;
  } catch (err) {
    console.error("lifecycle ownerHasSignedIn", uid, err);
    return null;
  }
}
