// Creates a customer business — the auth login AND its bootstrap documents — on the server
// with the Admin SDK, then emails the owner their welcome. ONE implementation, two callers:
//   • app/api/admin/provision/route.ts   (you press Activate, passcode required)
//   • app/api/trial-requests/route.ts    (only when AUTO_ACTIVATE_TRIALS is on, and only for
//                                         requests that pass every guard in lib/autoActivate.ts)
// so the two can never drift apart (same checks, same batch, same welcome email).
//
// Why it lives on the server at all: see the header of app/api/admin/provision/route.ts — the
// browser used to do this with the client SDK, which is what let strangers create their own
// business. The Admin SDK bypasses firestore.rules, which is what allows the rules to forbid
// self-created businesses entirely.
import { randomUUID } from "crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { TRIAL_DAYS, parseInterest, periodAmount, tierById, type BillingCycle } from "@/lib/pricing";
import { autoActivateConfig, autoActivateVerdict } from "@/lib/autoActivate";
import { SIGN_IN_LINK_DAYS, addDaysIso, isoToday, welcomeEmail } from "@/lib/lifecycle";
import { buildEmailCtx, type SendStatus } from "@/lib/lifecycleServer";
import { sendEmail, explainEmailFailure } from "@/lib/email";
import { signToken } from "@/lib/signedToken";
import { createPasswordSetLink } from "@/lib/resetLink";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// A refusal the caller can turn straight into an HTTP answer (status + a code the admin page
// already understands, e.g. "auth/email-already-in-use").
export class ProvisionError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ProvisionError";
    this.code = code;
    this.status = status;
  }
}

// The link that goes in a welcome / nudge / resend email. OUR durable link when we can sign
// one (valid SIGN_IN_LINK_DAYS days, see lib/signedToken.ts), otherwise Firebase's own
// one-hour link, otherwise null (the email then tells them to use "Forgot password").
export function durableSignInLink(uid: string, origin: string): string | null {
  const token = signToken("start", uid, SIGN_IN_LINK_DAYS * DAY_MS);
  return token ? `${origin}/api/start?t=${encodeURIComponent(token)}` : null;
}

export async function buildSignInLink(
  uid: string,
  email: string,
  origin: string
): Promise<{ url: string | null; days: number | null }> {
  const durable = durableSignInLink(uid, origin);
  if (durable) return { url: durable, days: SIGN_IN_LINK_DAYS };
  try {
    const url = await createPasswordSetLink(email, `${origin}/login`);
    return { url, days: null };
  } catch (err) {
    console.error("provision: could not generate set-password link", err);
    return { url: null, days: null };
  }
}

export interface ProvisionOwnerInput {
  email: unknown;
  ownerName?: unknown;
  businessName?: unknown;
  trialDays?: unknown;
  plan?: unknown;
  billingCycle?: unknown;
  // The trial request this activation answers — marked "provisioned" afterwards.
  requestId?: unknown;
  // Set by the automatic path, so the request card can say it was activated without a human.
  autoActivated?: boolean;
  sendWelcome?: boolean;
  origin: string;
}

export interface ProvisionOwnerResult {
  uid: string;
  email: string;
  welcome: SendStatus;
  // Plain-language reason the welcome email failed (admin-only). Null unless welcome === "failed".
  welcomeError: string | null;
  trialEndsAt: string | null;
  trialDays: number | null;
  plan: string | null;
  billingCycle: BillingCycle | null;
}

// One call does the whole activation — login, business, trial date, plan and price, the
// lead's "provisioned" mark, and the welcome email — so nothing can be left half done. The
// account, trial and plan are written in ONE batch: they all land or none do.
export async function provisionOwner(input: ProvisionOwnerInput): Promise<ProvisionOwnerResult> {
  const email = clip(input.email, 200).toLowerCase();
  const ownerName = clip(input.ownerName, 120);
  const businessName = clip(input.businessName, 120);

  if (!email || !EMAIL_RE.test(email)) {
    throw new ProvisionError("That email address doesn't look right.", "auth/invalid-email", 400);
  }

  // Optional extras. Prices are looked up here from the one price list — never taken from
  // the browser — so a stale or tampered form can't save the wrong amount.
  const rawDays = typeof input.trialDays === "number" ? input.trialDays : Number(input.trialDays);
  const trialDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(90, Math.round(rawDays)) : null;
  const tier = typeof input.plan === "string" ? tierById(input.plan) : null;
  const cycle: BillingCycle = input.billingCycle === "monthly" ? "monthly" : "annual";
  const requestId = clip(input.requestId, 120);
  const sendWelcome = input.sendWelcome !== false;

  const trialEndsAt = trialDays ? addDaysIso(isoToday(new Date()), trialDays) : null;

  const auth = getAdminAuth();
  let uid: string;
  try {
    // A random password nobody ever sees: the owner sets their own via the
    // welcome email's link (or "Forgot password" on the login page).
    const created = await auth.createUser({
      email,
      password: randomUUID(),
      ...(ownerName ? { displayName: ownerName } : {}),
    });
    uid = created.uid;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      throw new ProvisionError("An account already exists for that email.", "auth/email-already-in-use", 409);
    }
    if (code === "auth/invalid-email") {
      throw new ProvisionError("That email address doesn't look right.", "auth/invalid-email", 400);
    }
    throw err;
  }

  try {
    const db = getAdminDb();
    const batch = db.batch();
    batch.set(db.doc(`memberships/${uid}`), { businessId: uid });
    batch.set(db.doc(`users/${uid}/members/${uid}`), {
      role: "owner",
      name: ownerName || email.split("@")[0],
      email,
      active: true,
      createdAt: Date.now(),
    });
    if (businessName) {
      batch.set(db.doc(`users/${uid}/meta/settings`), { ...DEFAULT_SETTINGS, businessName });
    }
    const account: Record<string, unknown> = {};
    if (trialEndsAt) account.trialEndsAt = trialEndsAt;
    if (tier) {
      account.plan = tier.id;
      account.billingCycle = cycle;
      account.billingAmount = periodAmount(tier, cycle);
    }
    if (Object.keys(account).length > 0) {
      batch.set(db.doc(`users/${uid}/meta/account`), { suspended: false, ...account }, { merge: true });
    }
    await batch.commit();
  } catch (err) {
    // Don't leave a login with no business behind: it would make a retry
    // fail with "account already exists" for an account that can't be used.
    await auth.deleteUser(uid).catch(() => {});
    throw err;
  }

  // Everything below is a courtesy on top of an account that now exists — it must never
  // turn a successful activation into an error.
  if (requestId) {
    await getAdminDb()
      .collection("trialRequests")
      .doc(requestId)
      .update({ status: "provisioned", provisionedAt: Date.now(), ...(input.autoActivated ? { autoActivated: true } : {}) })
      .catch((err) => console.error("provision: could not mark request provisioned", err));
  }

  let welcome: SendStatus = "not_configured";
  let welcomeError: string | null = null;
  if (sendWelcome) {
    try {
      const link = await buildSignInLink(uid, email, input.origin);
      const ctx = buildEmailCtx(input.origin, ownerName || email.split("@")[0], businessName);
      const mail = welcomeEmail({
        ...ctx,
        setPasswordUrl: link.url,
        setPasswordLinkDays: link.days,
        trialDays,
        trialEndsAt,
      });
      const sent = await sendEmail({
        to: email,
        subject: mail.subject,
        text: mail.text,
        ...(ctx.supportEmail ? { replyTo: ctx.supportEmail } : {}),
      });
      welcome = sent ? "sent" : "not_configured";
    } catch (err) {
      console.error("provision: welcome email failed", err);
      welcome = "failed";
      welcomeError = explainEmailFailure(err);
    }
  }

  return {
    uid,
    email,
    welcome,
    welcomeError,
    trialEndsAt,
    trialDays: trialDays ?? null,
    plan: tier?.id ?? null,
    billingCycle: tier ? cycle : null,
  };
}

// ---------------------------------------------------------------------------------------
// Daily cap for automatic activation. A transaction on one counter doc (platform/autoActivate,
// which firestore.rules gives no access to, so only the server can touch it). Unlike the
// rate limiter this FAILS CLOSED: if the counter can't be read, the lead goes to the manual
// queue rather than risking an uncapped run.
// ---------------------------------------------------------------------------------------

const AUTO_ACTIVATE_DOC = "platform/autoActivate";

export async function reserveAutoActivationSlot(maxPerDay: number, now = new Date()): Promise<boolean> {
  try {
    const db = getAdminDb();
    const ref = db.doc(AUTO_ACTIVATE_DOC);
    const today = isoToday(now);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.data() as { day?: string; count?: number } | undefined) ?? {};
      const count = data.day === today ? data.count ?? 0 : 0;
      if (count >= maxPerDay) return false;
      tx.set(ref, { day: today, count: count + 1 });
      return true;
    });
  } catch (err) {
    console.error("[auto-activate] could not reserve a slot — leaving the lead for a human", err);
    return false;
  }
}

// Gives a slot back when the activation it was reserved for failed (best effort).
export async function releaseAutoActivationSlot(now = new Date()): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.doc(AUTO_ACTIVATE_DOC);
    const today = isoToday(now);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.data() as { day?: string; count?: number } | undefined) ?? {};
      if (data.day === today && (data.count ?? 0) > 0) tx.set(ref, { day: today, count: (data.count ?? 0) - 1 });
    });
  } catch (err) {
    console.error("[auto-activate] could not release a slot", err);
  }
}

// ---------------------------------------------------------------------------------------
// Automatic activation of a freshly submitted trial request (opt-in — see lib/autoActivate.ts).
// Returns the activation result when the lead was activated, or null when it was left for a
// human — which is every case except "switch on AND every guard passed AND the cap has room
// AND the account was created". It never throws: a lead must always be saved and shown in the
// queue whatever happens here.
// ---------------------------------------------------------------------------------------
export async function autoActivateRequest(input: {
  requestId: string;
  name: string;
  email: string;
  businessName?: string;
  interestedPlan?: string;
  origin: string;
}): Promise<ProvisionOwnerResult | null> {
  try {
    const config = autoActivateConfig();
    if (!config.enabled) return null;

    let hasAccount = false;
    try {
      await getAdminAuth().getUserByEmail(input.email);
      hasAccount = true;
    } catch {
      hasAccount = false;
    }
    if (!autoActivateVerdict({ email: input.email, hasAccount, config }).ok) return null;
    if (!(await reserveAutoActivationSlot(config.maxPerDay))) return null;

    const interest = parseInterest(input.interestedPlan);
    try {
      return await provisionOwner({
        email: input.email,
        ownerName: input.name,
        businessName: input.businessName,
        trialDays: TRIAL_DAYS,
        plan: interest?.tier.id ?? null,
        billingCycle: interest?.cycle ?? "annual",
        requestId: input.requestId,
        autoActivated: true,
        origin: input.origin,
      });
    } catch (err) {
      await releaseAutoActivationSlot();
      if (!(err instanceof ProvisionError)) console.error("[auto-activate] activation failed — left for a human", err);
      return null;
    }
  } catch (err) {
    console.error("[auto-activate] unexpected error — left for a human", err);
    return null;
  }
}
