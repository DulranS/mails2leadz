// Optional email notification for the trial-request pipeline — see
// app/api/trial-requests/route.ts, which calls notifyAdminOfTrialRequest
// after saving each request. This is the one third-party integration in
// the whole app; everything else runs on Firebase alone (see
// lib/firebaseAdmin.ts's header). Kept deliberately narrow: one function,
// one purpose — tell a human a lead came in — nothing resembling a CRM,
// drip campaign, or marketing tool.
//
// Uses Resend (resend.com) over a plain fetch call rather than adding
// their SDK as a dependency — the same "direct HTTP call, no extra
// package" choice this app already makes for the AI Assistant (see
// lib/anthropic.ts). One HTTPS request, one job.
//
// Every env var this reads is optional (see .env.local.example). If
// they're unset, both functions below silently no-op — a missing or
// misconfigured email integration must never be the reason a trial
// request fails to save, and the "Trial requests" tab in
// app/admin/new-business/page.tsx is always there as the reliable record
// regardless of whether the email ever sends. This is a convenience on
// top of that queue, not a replacement for it.

import { TRIAL_DAYS } from "@/lib/pricing";
import { safeFirstName } from "@/lib/emailSafety";
import { adminInbox } from "@/lib/envDefaults";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  // Where a reply should go. On the admin notification this is the visitor, so
  // pressing Reply in your inbox answers the lead directly instead of writing to
  // your own sending address. On customer emails it is your support address.
  replyTo?: string;
}

// True when outgoing email is switched on (a Resend key AND a verified sending address).
// The admin panel's Automation card and every "did that actually send?" answer rest on this.
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.TRIAL_NOTIFICATION_FROM_EMAIL;
}

// Resend's test sender. Resend only delivers it to the address on the Resend account, so every visitor's
// email is refused (403) while everything looks configured. Returns the sentence to show the admin, or null.
export function senderProblem(from: string | undefined = process.env.TRIAL_NOTIFICATION_FROM_EMAIL): string | null {
  if (!from || !/@resend\.dev>?$/i.test(from.trim())) return null;
  return "Your sending address is Resend's test address (onboarding@resend.dev). Resend only delivers that to your own Resend login email, so visitors get nothing. Verify a domain at resend.com/domains and set TRIAL_NOTIFICATION_FROM_EMAIL to an address on it.";
}

// Resend's default limit is a few requests per second (2, as far as I know). The daily job can have
// several customers due on the same morning, and without pacing a burst gets "429 rate limited" for
// everything after the first couple: those reminders then silently slip to the next day. So sends from
// one server process are spaced out, and a 429 is retried a couple of times before giving up.
// Mutable only so scripts/verify-email-retry.ts can run without real waiting.
export const emailPacing = { minGapMs: 600, maxWaitMs: 5000, maxRetries: 2 };
let nextSlotAt = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextSlotAt);
  nextSlotAt = startAt + emailPacing.minGapMs;
  if (startAt > now) await sleep(startAt - now);
}

// How long to wait before retrying a rate-limited send: what Resend asked for (Retry-After, seconds),
// else a short growing pause; never longer than maxWaitMs so a cron run cannot stall.
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const secs = Number(retryAfter);
  const asked = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 1000 * (attempt + 1);
  return Math.min(emailPacing.maxWaitMs, Math.ceil(asked));
}

// Returns true when the email was handed to Resend, false when email isn't configured (a
// deliberate no-op — see the header), and throws when Resend itself refuses. Callers that
// only want "best effort" can ignore the result; callers that tell a human "email sent"
// (the activation screen) use it so they never claim a send that didn't happen.
export async function sendEmail({ to, subject, text, replyTo }: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRIAL_NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return false; // not configured — see file header

  const body = JSON.stringify({ from, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) });
  for (let attempt = 0; ; attempt++) {
    await waitForSlot();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) return true;
    if (res.status === 429 && attempt < emailPacing.maxRetries) {
      await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
      continue;
    }
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }
}

// Turns a failed send into one plain sentence for the ADMIN (never shown to a visitor): which setting to
// look at, instead of a bare "couldn't be sent". Pure — scripts/verify-email-abuse.ts proves it offline.
export function explainEmailFailure(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? "");
  const lower = text.toLowerCase();
  const status = Number(/Resend API error \((\d{3})\)/.exec(text)?.[1] ?? 0);
  if (lower.includes("own email address") || lower.includes("testing emails") || lower.includes("only send testing")) {
    return "Resend is still in sandbox mode: it only delivers to the address on your Resend account. Verify a domain in Resend and set TRIAL_NOTIFICATION_FROM_EMAIL to an address on it.";
  }
  if (lower.includes("domain is not verified") || lower.includes("not verified")) {
    return "The sending domain isn't verified in Resend. Finish the DNS records there, or set TRIAL_NOTIFICATION_FROM_EMAIL to an address on a verified domain.";
  }
  if (status === 401 || lower.includes("api key is invalid") || lower.includes("missing api key")) {
    return "Resend rejected the API key. Check RESEND_API_KEY is correct and not revoked.";
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    return "Resend's sending limit was reached. Wait, or upgrade the Resend plan.";
  }
  if (status === 422 || status === 400) {
    return "Resend rejected the message. Check TRIAL_NOTIFICATION_FROM_EMAIL and NEXT_PUBLIC_SUPPORT_EMAIL are valid email addresses (for example Balancr <hello@yourdomain.com>).";
  }
  if (status >= 500) return "Resend had a problem on its side. Try again in a few minutes.";
  if (status === 403) return "Resend refused to send from this address. Check the sending domain is verified and the API key belongs to the same Resend account.";
  return "The email provider couldn't be reached. Check the server's internet access and the Resend settings.";
}

export interface TrialRequestNotificationInput {
  // Set when the daily job looks dead (see lib/cronHealth.ts). Rides on the lead email because
  // that is the one email that still arrives when the scheduler has silently stopped.
  cronWarning?: string | null;
  name: string;
  email: string;
  businessName?: string;
  interestedPlan?: string;
  teamSize?: string;
  message?: string;
  ipAddress?: string;
  referer?: string;
  userAgent?: string;
  // True when this email already had an open (pending/contacted) request —
  // see app/api/trial-requests/route.ts. Flagged up front rather than left
  // for the admin to notice on their own, since a repeat submission from
  // the same person is a "look at this sooner" signal, not a duplicate to
  // dismiss.
  followUp?: boolean;
  // Where the admin panel is (the site origin) and which lead this is: the email then links
  // straight to that lead, ready to activate, instead of "go and find it in the queue".
  adminUrl?: string;
  requestId?: string;
  // Why the submission looked odd (lib/trialAbuse.ts), when it did. Listed in the email so the
  // decision to activate is made with the evidence in front of you.
  suspicion?: string[];
  // True only when email sending isn't configured, so no confirmation link could be sent and the
  // address is NOT proven to belong to the sender.
  unconfirmed?: boolean;
  // Set when the request was activated with no human involved (AUTO_ACTIVATE_TRIALS — see
  // lib/autoActivate.ts). The email then reports it rather than asking for a decision.
  autoActivated?: { welcome: "sent" | "not_configured" | "failed" | "no_owner" };
}

// Pings whoever handles new trial requests day to day, so "managing the
// pipeline" doesn't depend on remembering to open the admin panel and
// check. See app/api/trial-requests/route.ts for how failures here are
// swallowed rather than surfaced to the visitor submitting the form —
// they already got their own on-page confirmation; this is purely an
// internal nudge.
export async function notifyAdminOfTrialRequest(input: TrialRequestNotificationInput): Promise<void> {
  const to = adminInbox();
  if (!to) return; // no inbox configured to notify — see .env.local.example

  const reviewUrl =
    input.adminUrl && input.requestId
      ? `${input.adminUrl.replace(/\/+$/, "")}/admin/new-business?tab=requests&lead=${encodeURIComponent(input.requestId)}`
      : null;
  const auto = input.autoActivated;
  const lines = [
    auto
      ? `${input.name} <${input.email}> requested a trial and was activated automatically.`
      : input.followUp
      ? `${input.name} <${input.email}> just followed up on their trial request — they're still waiting to hear back.`
      : `${input.name} <${input.email}> just requested a trial.`,
    input.businessName ? `Business: ${input.businessName}` : null,
    input.interestedPlan ? `Plan: ${input.interestedPlan}` : null,
    input.teamSize ? `Team size: ${input.teamSize}` : null,
    input.message ? `What they want to track: ${input.message}` : null,
    input.suspicion && input.suspicion.length > 0 ? `Looks odd: ${input.suspicion.join("; ")}` : null,
    input.unconfirmed ? "Email NOT confirmed — email sending isn't configured, so nobody has proven this inbox is theirs." : null,
    input.ipAddress ? `IP address: ${input.ipAddress}` : null,
    input.referer ? `Referer: ${input.referer}` : null,
    input.userAgent ? `User agent: ${input.userAgent}` : null,
    input.cronWarning ? `WARNING: ${input.cronWarning}` : null,
    "",
    auto
      ? auto.welcome === "sent"
        ? "Their welcome email (with a link to choose a password) has been sent. Nothing for you to do."
        : "Their account exists, but the welcome email could NOT be sent — open the admin panel and use “Send sign-in link” on their card."
      : reviewUrl
      ? `Activate it in one tap (you'll be asked for your admin passcode): ${reviewUrl}`
      : "Review and provision it from the Trial requests tab of /admin/new-business.",
  ].filter((line): line is string => line !== null);

  await sendEmail({
    to,
    subject: `${auto ? "Auto-activated" : input.followUp ? "Follow-up on trial request" : "New trial request"} — ${input.businessName || input.name}`,
    text: lines.join("\n"),
    replyTo: input.email,
  });
}

// The visitor's own confirmation — "we got it, here is what happens next". Without
// it the only feedback a prospect gets is a message on the page they'll close, and
// "did that actually go through?" is where a lead quietly goes cold. Plain text,
// one email, sent only if Resend is configured, and never a reason for a request to
// fail (the route swallows errors). The promise it makes — a personal reply within a
// working day — is the one the admin's Trial requests tab now tracks with a
// "waiting" timer, so it can be kept.
export async function acknowledgeTrialRequest(input: {
  name: string;
  email: string;
  businessName?: string;
  interestedPlan?: string;
}): Promise<void> {
  const first = safeFirstName(input.name);
  const support = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  const wa = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  const lines = [
    `Hi ${first},`,
    "",
    `Thanks for asking about Balancr${input.businessName ? ` for ${input.businessName}` : ""} — your trial request is in.`,
    "",
    "What happens next:",
    "1. A real person reads your request, usually within one working day.",
    "2. We set up your business account and email you a link to choose your own password.",
    `3. You get a ${TRIAL_DAYS}-day free trial with the whole product. No card, nothing to cancel.`,
    "",
    wa
      ? `Want to talk sooner? Reply to this email or message us on WhatsApp (+${wa}).`
      : "Want to talk sooner? Just reply to this email.",
    "",
    "— Balancr",
    "",
    "If you didn't request this, you can ignore this email — nothing has been created for you.",
  ];
  await sendEmail({
    to: input.email,
    subject: "We've got your Balancr trial request",
    text: lines.join("\n"),
    ...(support ? { replyTo: support } : {}),
  });
}

// "Confirm your email" — the step that makes a trial request real. Sent to the address the visitor
// typed, so it doubles as proof they can read that inbox. It promises nothing yet (no account, no
// trial) and says plainly what to do if the recipient never asked: nothing — so someone whose address
// was typed by a stranger just ignores it. Returns false when email isn't configured.
export async function sendTrialConfirmation(input: {
  name: string;
  email: string;
  confirmUrl: string;
  hours: number;
}): Promise<boolean> {
  const first = safeFirstName(input.name);
  const support = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  const lines = [
    `Hi ${first},`,
    "",
    "Please confirm your email address to finish requesting your Balancr trial:",
    "",
    input.confirmUrl,
    "",
    `The link works for ${input.hours} hours. Once you confirm, a real person (or, on busy days, our automatic setup) takes it from there and you'll get a second email with a link to choose your password.`,
    "",
    "If you didn't ask for this, ignore this email — nothing has been created and nothing will be.",
    "",
    "— Balancr",
  ];
  return sendEmail({
    to: input.email,
    subject: "Confirm your email to start your Balancr trial",
    text: lines.join("\n"),
    ...(support ? { replyTo: support } : {}),
  });
}

// Sent instead of a confirmation when the address already has a login (or already had its trial), so
// a genuine returning customer isn't left with silence — and the page itself never says so, which
// would let a stranger test who is a customer.
export async function sendAlreadyRegistered(input: { name: string; email: string; loginUrl: string }): Promise<boolean> {
  const first = safeFirstName(input.name);
  const support = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  return sendEmail({
    to: input.email,
    subject: "You already have a Balancr account",
    text: [
      `Hi ${first},`,
      "",
      "Someone (hopefully you) asked for a Balancr trial with this address, but it already has an account — so there's nothing new to set up.",
      "",
      `Sign in here: ${input.loginUrl}`,
      'If you\'ve forgotten your password, use "Forgot password" on that page.',
      "",
      "If this wasn't you, ignore this email.",
      "",
      "— Balancr",
    ].join("\n"),
    ...(support ? { replyTo: support } : {}),
  });
}

export interface FeedbackNotificationInput {
  kind: "idea" | "problem" | "other";
  message: string;
  contactEmail?: string;
  memberName?: string;
  page?: string;
}

// Pings the same inbox as notifyAdminOfTrialRequest above, so "someone
// asked for something" and "someone hit a problem" both land somewhere a
// human actually checks, rather than only sitting in the admin panel's
// Feedback tab until someone remembers to open it. See
// app/api/feedback/route.ts for how a failure here is swallowed the same
// way trial-request notification failures are — the note is already
// durably saved in Firestore regardless of whether this send succeeds.
export async function notifyAdminOfFeedback(input: FeedbackNotificationInput): Promise<void> {
  const to = adminInbox();
  if (!to) return; // no inbox configured to notify — see .env.local.example

  const label = input.kind === "problem" ? "Problem reported" : input.kind === "idea" ? "Feature request" : "Feedback";
  const lines = [
    input.memberName ? `${input.memberName} sent this in from inside the app.` : "Sent in from the public site (no account).",
    input.contactEmail ? `Reply to: ${input.contactEmail}` : "No reply email given — nothing to follow up with.",
    input.page ? `Page: ${input.page}` : null,
    "",
    input.message,
    "",
    "Review it from the Feedback tab of /admin/new-business.",
  ].filter((line): line is string => line !== null);

  await sendEmail({
    to,
    subject: `${input.kind === "problem" ? "\u{1F534}" : "\u{1F4A1}"} ${label}${input.memberName ? ` — ${input.memberName}` : ""}`,
    text: lines.join("\n"),
  });
}
