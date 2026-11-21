// Public intake for "Request a trial" on the marketing site (app/page.tsx,
// app/request-trial/page.tsx). POST is deliberately the one unauthenticated
// write path into this whole app's Firestore project — and even that isn't
// a Firestore rule opening the door, it's this route using the Admin SDK
// (see lib/firebaseAdmin.ts) to write on the visitor's behalf. There is no
// `match /trialRequests` (or /trialIntake, /trialBlocks) block in
// firestore.rules at all, so the client SDK has zero access to them in
// either direction; a visitor's browser never touches Firestore directly
// here, only this route.
//
// A trial request is a lead, not an account — nothing here calls
// createUserWithEmailAndPassword. And since the confirm-your-email step, a
// submission isn't even a lead yet: it is held in `trialIntake` until its
// sender clicks the link emailed to the address they typed
// (app/api/trial-requests/verify/route.ts), and only THEN enters the
// `trialRequests` queue the admin works. The layers, in the order they run:
//
//   1. honeypot                      silent (looks like success)
//   2. field + email-policy checks   explicit: tells an honest visitor what to fix
//      (Gmail-only by default — lib/emailPolicy.ts)
//   3. per-IP hourly + daily limits  explicit 429 (real people share IPs)
//   4. blocked identity              silent
//   5. suspicion score >= SHADOW_AT  silent (lib/trialAbuse.ts)
//   6. address already has a login   silent on the page; the owner of the inbox is emailed
//   7. per-identity email limits     silent (one confirmation email / 10 min, 4 / day)
//   8. confirmation email            the check that actually proves the inbox is theirs
//
// "Silent" means the response is byte-for-byte the normal success, so a troll gets no signal about
// which layer caught them and nothing to iterate against. Only layers 2 and 3 ever show an error,
// and both describe the published rule (use Gmail; try again later), not the detection.
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { isRateLimited } from "@/lib/rateLimit";
import { reservePublicEmail } from "@/lib/emailBudget";
import { explainEmailFailure, isEmailConfigured, sendAlreadyRegistered, sendTrialConfirmation } from "@/lib/email";
import { recordEmailOutcome } from "@/lib/emailHealth";
import { checkTrialEmail } from "@/lib/emailPolicy";
import { scoreTrialSubmission } from "@/lib/trialAbuse";
import { signToken } from "@/lib/signedToken";
import {
  CONFIRM_LINK_HOURS,
  INTAKE_COLLECTION,
  distinctIdentitiesFromIp,
  identityHasAccount,
  intakeId,
  isIdentityBlocked,
  trustedOrigin,
  type IntakeDoc,
} from "@/lib/trialIntakeServer";
import { finishTrialRequest } from "@/lib/trialCommitServer";
import { siteOrigin } from "@/lib/lifecycleServer";
import type { TrialRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads headers + live data; never prerender or cache

const TEAM_SIZES = new Set(["solo", "2-5", "6-10", "10+"]);

// Every submission this route accepts is capped in size before it ever
// reaches Firestore — an unauthenticated endpoint is exactly the kind of
// place someone could try to shove megabytes of text into a free-text field.
function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Server-derived, not client-supplied — read from request headers so a
// submitter has no way to spoof or blank it out. `x-forwarded-for` can
// carry a chain of proxies; the first entry is the original client. Falls
// back to `x-real-ip` for hosts that set that instead. Both are missing in
// some local/dev setups, hence the "unknown" fallback rather than throwing.
function clientIp(req: Request): { ip: string; chain?: string } {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return { ip: fwd.split(",")[0].trim(), chain: fwd };
  const real = req.headers.get("x-real-ip")?.trim();
  return { ip: real || "unknown" };
}

// The one success shape. Every silent layer returns exactly this, so it is indistinguishable
// from a genuine submission.
const quiet = () => Response.json({ ok: true, confirm: true });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: a field named to look worth filling in to a bot, hidden
    // from real visitors by app/request-trial/page.tsx via CSS rather than
    // omitted from the DOM (an empty-but-present field is what actually
    // baits form-filling bots — a field that doesn't exist can't). Any
    // value here means it wasn't a person. Returning success rather than
    // an error keeps a bot from learning it got caught and adjusting.
    if (clip(body?.website, 1)) return quiet();

    const name = clip(body?.name, 120);
    const businessName = clip(body?.businessName, 120);
    const interestedPlan = clip(body?.interestedPlan, 60);
    const message = clip(body?.message, 1000);
    const teamSizeRaw = clip(body?.teamSize, 10);
    const teamSize = TEAM_SIZES.has(teamSizeRaw) ? (teamSizeRaw as TrialRequest["teamSize"]) : undefined;

    if (!name) {
      return Response.json({ error: "Your name is required." }, { status: 400 });
    }
    const policy = checkTrialEmail(clip(body?.email, 200));
    if (!policy.ok) {
      return Response.json({ error: policy.message }, { status: 400 });
    }
    const { email, emailKey } = policy;

    // Captured here, not trusted from the body — see clientIp's header for
    // why. Kept alongside the lead so a spam/abusive submission has an
    // actual trail attached to it in the admin panel, not just free text.
    const { ip: ipAddress, chain: ipChain } = clientIp(req);
    const userAgent = clip(req.headers.get("user-agent"), 300) || "unknown";
    const referer = clip(req.headers.get("referer"), 300);
    const acceptLanguage = clip(req.headers.get("accept-language"), 200);
    const clientHintsUa = clip(req.headers.get("sec-ch-ua"), 200);
    const clientHintsPlatform = clip(req.headers.get("sec-ch-ua-platform"), 60);

    // Best-effort, browser-supplied — see app/request-trial/page.tsx. A
    // script-only submission simply omits `clientHints`, so these stay
    // undefined rather than throwing.
    const hints = body?.clientHints;
    const browserTimezone = clip(hints?.timezone, 80);
    const browserScreen = clip(hints?.screen, 30);
    const browserLanguage = clip(hints?.language, 40);
    const elapsedRaw = typeof body?.elapsedMs === "number" && Number.isFinite(body.elapsedMs) ? body.elapsedMs : undefined;

    // Every accepted submission can write a document and send an email, so one script looping on
    // this endpoint would flood both. A handful per IP per hour is far more than any real prospect
    // (or an office sharing one IP) needs; the daily ceiling is deliberately loose because many
    // mobile carriers put whole neighbourhoods behind one address. Counted only after validation,
    // so typos don't burn the budget.
    if (
      (await isRateLimited("trial-request", ipAddress, 5, 60 * 60 * 1000)) ||
      (await isRateLimited("trial-request-day", ipAddress, 15, 24 * 60 * 60 * 1000))
    ) {
      return Response.json(
        { error: "We've received several requests from your connection already — please try again in a little while." },
        { status: 429 }
      );
    }

    const fields: Partial<TrialRequest> = {
      ipAddress,
      userAgent,
      ...(ipChain ? { ipChain } : {}),
      ...(referer ? { referer } : {}),
      ...(acceptLanguage ? { acceptLanguage } : {}),
      ...(clientHintsUa ? { clientHintsUa } : {}),
      ...(clientHintsPlatform ? { clientHintsPlatform } : {}),
      ...(browserTimezone ? { browserTimezone } : {}),
      ...(browserScreen ? { browserScreen } : {}),
      ...(browserLanguage ? { browserLanguage } : {}),
      ...(businessName ? { businessName } : {}),
      ...(interestedPlan ? { interestedPlan } : {}),
      ...(teamSize ? { teamSize } : {}),
      ...(message ? { message } : {}),
    };

    const db = getAdminDb();
    const now = Date.now();
    const id = intakeId(emailKey);

    // Layer 4 — an identity the admin has blocked ("Dismiss & block" on a lead card).
    if (await isIdentityBlocked(emailKey)) return quiet();

    // Layer 5 — soft signals, scored together (lib/trialAbuse.ts).
    const scored = scoreTrialSubmission({
      name,
      businessName,
      message,
      elapsedMs: elapsedRaw,
      hasClientHints: !!(browserTimezone || browserScreen || browserLanguage),
      distinctIdentitiesFromIp: 1 + (await distinctIdentitiesFromIp(ipAddress, emailKey, now)),
    });

    const intake: IntakeDoc = {
      name,
      email,
      emailKey,
      fields: fields as Record<string, unknown>,
      suspicionScore: scored.score,
      suspicionReasons: scored.reasons,
      ipAddress,
      createdAt: now,
      updatedAt: now,
    };

    if (scored.verdict === "shadow") {
      console.warn("[trial-requests] discarded quietly", { emailKey, score: scored.score, reasons: scored.reasons });
      await db.collection(INTAKE_COLLECTION).doc(id).set({ ...intake, shadowRejected: true });
      return quiet();
    }

    // Layer 6 — already has a login (or already had this person's trial).
    if (await identityHasAccount(email, emailKey)) {
      try {
        // Same per-address ceiling as the confirmation email below (1 / 10 min AND 4 / day), so an existing
        // customer's inbox can't be mailed over and over by someone typing their address into this form —
        // and the same global daily budget, so many addresses can't be used to drain the email allowance.
        const tooSoon =
          (await isRateLimited("trial-confirm-10m", emailKey, 1, 10 * 60 * 1000)) ||
          (await isRateLimited("trial-confirm-day", emailKey, 4, 24 * 60 * 60 * 1000));
        if (!tooSoon && (await reservePublicEmail("confirm"))) {
          await sendAlreadyRegistered({ name, email, loginUrl: `${trustedOrigin(req)}/login` });
        }
      } catch (err) {
        console.error("[trial-requests] already-registered email failed", err);
      }
      return quiet();
    }

    // No way to send a confirmation link (email not configured, or no signing key): keep the lead
    // rather than lose it, flagged unconfirmed. See lib/trialCommitServer.ts and the launch
    // readiness check — this is the degraded mode, not the intended one.
    const token = signToken("verify-trial", id, CONFIRM_LINK_HOURS * 3_600_000);
    if (!isEmailConfigured() || !token) {
      console.warn("[trial-requests] email confirmation unavailable — saving the request UNCONFIRMED");
      await recordEmailOutcome("trialConfirmation", {
        ok: false,
        reason: !isEmailConfigured()
          ? "Email isn't set up: RESEND_API_KEY or TRIAL_NOTIFICATION_FROM_EMAIL is missing, so requests are saved without a confirmation email."
          : "No link-signing secret is set (LINK_SIGNING_SECRET or FIREBASE_PRIVATE_KEY), so the confirmation link can't be made.",
      });
      await finishTrialRequest({
        name,
        email,
        emailKey,
        fields,
        suspicionScore: scored.score,
        suspicionReasons: scored.reasons,
        emailVerified: false,
        origin: siteOrigin(req),
      });
      return quiet();
    }

    // Layer 7 — one confirmation email per identity per 10 minutes, 4 per day, so this form can't be
    // used to mail someone else's inbox over and over (the per-IP limit only slows one connection).
    if (
      (await isRateLimited("trial-confirm-10m", emailKey, 1, 10 * 60 * 1000)) ||
      (await isRateLimited("trial-confirm-day", emailKey, 4, 24 * 60 * 60 * 1000))
    ) {
      return quiet();
    }

    // Layer 7b — a hard daily ceiling on confirmation emails across EVERYONE (lib/emailBudget.ts). Past
    // it nothing is saved or sent until tomorrow, and the visitor sees the normal page, so a flood of
    // distinct addresses can't use up the email allowance real prospects and customers depend on.
    if (!(await reservePublicEmail("confirm"))) {
      console.warn("[trial-requests] daily confirmation-email budget used up — request not processed");
      await recordEmailOutcome("trialConfirmation", {
        ok: false,
        reason: "Today's allowance of confirmation emails is used up, so new trial requests are dropped until tomorrow. Raise PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY if this traffic is real.",
      });
      return quiet();
    }

    // Layer 8 — hold the submission and ask the inbox to confirm it.
    await db.collection(INTAKE_COLLECTION).doc(id).set(intake);
    try {
      const handedOver = await sendTrialConfirmation({
        name,
        email,
        confirmUrl: `${trustedOrigin(req)}/verify-trial?t=${encodeURIComponent(token)}`,
        hours: CONFIRM_LINK_HOURS,
      });
      await recordEmailOutcome("trialConfirmation", handedOver ? { ok: true } : { ok: false, reason: "Email isn't set up, so no confirmation was sent." });
    } catch (err) {
      console.error("[trial-requests] confirmation email failed", err);
      await recordEmailOutcome("trialConfirmation", { ok: false, reason: explainEmailFailure(err) });
    }
    return quiet();
  } catch (err) {
    console.error("[trial-requests POST]", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// Admin-only listing, feeding the "Trial requests" tab on
// app/admin/new-business/page.tsx — same passcode gate as every other
// app/api/admin/* route, checked here too rather than trusted from the
// client for the same reason documented in lib/adminAuth.ts.
export async function GET(req: Request) {
  try {
    await requireAdminPasscode(req);
    const db = getAdminDb();
    const snap = await db.collection("trialRequests").orderBy("createdAt", "desc").limit(200).get();
    const requests: TrialRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrialRequest, "id">) }));

    // For leads still open, check whether that email already has a login. Provisioning
    // would fail with "an account already exists" only AFTER the admin has filled in the
    // form; this surfaces it on the card up front (an old customer asking again, or a
    // request already handled some other way). Computed here, never stored.
    const auth = getAdminAuth();
    await Promise.all(
      requests
        .filter((r) => r.status === "pending" || r.status === "contacted")
        .map(async (r) => {
          try {
            await auth.getUserByEmail(r.email);
            r.hasAccount = true;
          } catch {
            r.hasAccount = false;
          }
        })
    );
    return Response.json({ requests });
  } catch (err) {
    return adminErrorResponse(err, "trial-requests GET");
  }
}
