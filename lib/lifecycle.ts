// The customer lifecycle, written down once: WHICH email goes to a customer WHEN, and
// WHAT it says. Everything in this file is pure (no network, no database, no clock of its
// own — "today" is always passed in), so scripts/verify-lifecycle.ts can prove the rules
// offline, and the server code that actually sends (lib/lifecycleServer.ts) stays a thin,
// boring wrapper.
//
// The design rules, same spirit as the rest of the pipeline:
//   • Controlled, not clever. Every email is plain text, from a human voice, sent for a
//     reason the customer can see (their account was made, their payment landed, their
//     trial is about to end). Nothing here is marketing, drip or upsell.
//   • Once per fact. A reminder is keyed on the date it is about ("trial_ending:2026-10-20"),
//     so the daily job can run a hundred times without repeating itself, and an extended
//     trial or a new renewal date naturally earns a fresh reminder.
//   • Never the reason something breaks. These only describe; sending is best-effort and
//     lives elsewhere.

import { safeFirstName } from "./emailSafety";
import { formatMoney } from "./format";
import { PRICING_CURRENCY } from "./pricing";
import { TRIAL_GRACE_DAYS, RENEWAL_GRACE_DAYS } from "./accountAccess";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// How far ahead the customer hears about an ending trial / due renewal.
export const TRIAL_REMINDER_DAYS = 3;
export const RENEWAL_REMINDER_DAYS = 7;
// How far ahead an ending trial shows up in the admin's morning digest.
export const ADMIN_TRIAL_HEADS_UP_DAYS = 7;
// An overdue notice is a nudge, not a nag: after this many days late we stop emailing and
// leave it to the admin (the account shows in "needs attention" regardless).
export const OVERDUE_NOTICE_WINDOW_DAYS = 14;
// A trial or renewal gets a second, last-chance email this many days (or fewer) before it ends/falls due. Bank
// transfers take days to land, so one early notice alone is easy to miss.
export const FINAL_NOTICE_DAYS = 1;
// A renewal that is still unpaid this many days late gets one more overdue notice.
export const OVERDUE_SECOND_NOTICE_DAYS = 7;

// ---------------------------------------------------------------------------------------
// Dates (all UTC, ISO "YYYY-MM-DD" — the same convention lib/accountAccess.ts uses)
// ---------------------------------------------------------------------------------------

export function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso || !ISO_DATE.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return t;
}

// Whole days from `fromIso` to `toIso` (positive = toIso is later). Null if either is invalid.
export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

export function addDaysIso(iso: string, days: number): string | null {
  const t = parseIso(iso);
  if (t === null) return null;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

// "20 October 2026" — unambiguous for a reader anywhere (11/10 means two different days).
export function longDateIso(iso: string): string {
  const t = parseIso(iso);
  if (t === null) return iso;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------------------
// Reminder rules
// ---------------------------------------------------------------------------------------

export interface LifecycleAccount {
  suspended?: boolean;
  complimentary?: boolean;
  trialEndsAt?: string;
  renewalDueDate?: string;
  lastPaidAt?: number;
  autoLockOverdue?: boolean;
  plan?: string;
  billingAmount?: number;
  billingCycle?: "monthly" | "annual";
}

export type ReminderKind = "trial_ending" | "trial_ended" | "renewal_due" | "renewal_overdue";

export interface ReminderDue {
  kind: ReminderKind;
  // The dedupe key stored once sent: "<kind>:<the date it is about>", or "<kind>_final:<date>" for the
  // second, last-chance email of the same kind.
  key: string;
  // The date the reminder is about (trial end / renewal date).
  date: string;
  // Days until (positive) or since (negative) that date. 0 = today.
  days: number;
}

// Returns the single reminder this account should get today, or null. At most ONE per
// account per day — a customer never gets two emails from the pipeline on the same morning.
//
// Rules, each mirroring what lib/accountAccess.ts will actually do to the account:
//   suspended / complimentary ................ never (a manual decision, or never invoiced)
//   on trial, ends in 0..3 days .............. trial_ending (first at 3 days, again at 1 day / the last day)
//   on trial, ended, still inside the grace .. trial_ended  (tells them the real lock date)
//   paid, renewal in 0..7 days ............... renewal_due (first at 7 days, again at 1 day / due day)
//   paid, renewal passed (≤14 days ago) ...... renewal_overdue (day 1 late, and again 7 days late)
// A recorded payment whose renewal is still ahead overrides a leftover trial date, exactly as
// it does for access (isTrialLocked's paid-up protection) — such an account is not "on trial".
export function reminderDue(account: LifecycleAccount | null | undefined, todayIso: string): ReminderDue | null {
  const a = account ?? {};
  if (a.suspended === true || a.complimentary === true) return null;

  const renewalDays = a.renewalDueDate ? daysBetween(todayIso, a.renewalDueDate) : null;
  const paidUp = !!a.lastPaidAt && renewalDays !== null && renewalDays >= 0;
  const trialDays = a.trialEndsAt && !paidUp ? daysBetween(todayIso, a.trialEndsAt) : null;

  if (a.trialEndsAt && trialDays !== null && !paidUp) {
    if (trialDays >= 0 && trialDays <= TRIAL_REMINDER_DAYS) {
      // First heads-up when the window opens, then one last nudge on the final day or two (its own key,
      // so it is sent once even though the first one already went out).
      const key = trialDays <= FINAL_NOTICE_DAYS ? `trial_ending_final:${a.trialEndsAt}` : `trial_ending:${a.trialEndsAt}`;
      return { kind: "trial_ending", key, date: a.trialEndsAt, days: trialDays };
    }
    if (trialDays < 0 && -trialDays <= TRIAL_GRACE_DAYS) {
      return { kind: "trial_ended", key: `trial_ended:${a.trialEndsAt}`, date: a.trialEndsAt, days: trialDays };
    }
    return null;
  }

  // A trial date that is still set on a not-paid-up account means trial rules govern it
  // (see isRenewalLocked) — a renewal reminder on top would contradict the trial emails.
  if (a.trialEndsAt && !paidUp) return null;

  if (a.renewalDueDate && renewalDays !== null) {
    if (renewalDays >= 0 && renewalDays <= RENEWAL_REMINDER_DAYS) {
      const key = renewalDays <= FINAL_NOTICE_DAYS ? `renewal_due_final:${a.renewalDueDate}` : `renewal_due:${a.renewalDueDate}`;
      return { kind: "renewal_due", key, date: a.renewalDueDate, days: renewalDays };
    }
    if (renewalDays < 0 && -renewalDays <= OVERDUE_NOTICE_WINDOW_DAYS) {
      // One notice the first day it is late, one more a week in (the day the lock date arrives for accounts
      // that lock automatically), then it's left to the admin.
      const key = -renewalDays >= OVERDUE_SECOND_NOTICE_DAYS ? `renewal_overdue_final:${a.renewalDueDate}` : `renewal_overdue:${a.renewalDueDate}`;
      return { kind: "renewal_overdue", key, date: a.renewalDueDate, days: renewalDays };
    }
  }
  return null;
}

// One line for the admin digest: why this account needs a human today. Broader than
// reminderDue (it also covers accounts that are already locked, and idle trials are left to
// the dashboard). Null = nothing to do.
export function attentionReason(account: LifecycleAccount | null | undefined, todayIso: string): string | null {
  const a = account ?? {};
  if (a.complimentary === true) return null;
  if (a.suspended === true) return null; // deliberate; already in the admin's hands

  const renewalDays = a.renewalDueDate ? daysBetween(todayIso, a.renewalDueDate) : null;
  const paidUp = !!a.lastPaidAt && renewalDays !== null && renewalDays >= 0;
  const trialDays = a.trialEndsAt && !paidUp ? daysBetween(todayIso, a.trialEndsAt) : null;

  if (trialDays !== null) {
    // The admin hears a week ahead (same lead time as renewals): enough to message them personally and for a bank
    // transfer to land. The customer's own first email still goes at TRIAL_REMINDER_DAYS.
    if (trialDays > ADMIN_TRIAL_HEADS_UP_DAYS) return null;
    if (trialDays >= 0) return trialDays === 0 ? "trial ends today" : `trial ends in ${plural(trialDays, "day", "days")}`;
    if (-trialDays <= TRIAL_GRACE_DAYS) return `trial ended ${plural(-trialDays, "day", "days")} ago (locks soon)`;
    return `trial ended ${plural(-trialDays, "day", "days")} ago — locked`;
  }
  if (renewalDays !== null && !a.trialEndsAt) {
    if (renewalDays < 0) {
      const late = -renewalDays;
      const locked = a.autoLockOverdue === true && late > RENEWAL_GRACE_DAYS;
      return `renewal ${plural(late, "day", "days")} overdue${locked ? " — locked" : ""}`;
    }
    if (renewalDays <= RENEWAL_REMINDER_DAYS) {
      return renewalDays === 0 ? "renewal due today" : `renewal due in ${plural(renewalDays, "day", "days")}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------------------

export interface EmailCtx {
  firstName: string;
  businessName?: string;
  loginUrl: string;
  supportEmail?: string;
  supportWhatsapp?: string; // digits only
  paymentInstructions?: string;
}

export interface BuiltEmail {
  subject: string;
  text: string;
}

export function firstNameOf(name: string | null | undefined): string {
  return safeFirstName(name);
}

function contactLine(ctx: EmailCtx): string {
  if (ctx.supportWhatsapp) return `Questions? Reply to this email or message us on WhatsApp (+${ctx.supportWhatsapp}).`;
  return "Questions? Just reply to this email.";
}

function signoff(): string[] {
  return ["", "— Balancr"];
}

function payLine(ctx: EmailCtx): string[] {
  return ctx.paymentInstructions ? ["", "How to pay:", ctx.paymentInstructions.trim()] : [];
}

// Sent the moment an admin activates an account. The set-password link is generated by the
// server (Firebase Admin) so the customer gets ONE email with everything, from a name they
// recognise, instead of a context-free system message.
export function welcomeEmail(
  ctx: EmailCtx & {
    setPasswordUrl?: string | null;
    // When the link is OUR durable one (see lib/signedToken.ts) this says for how many days it
    // stays valid; omitted for Firebase's own link, which only lasts about an hour.
    setPasswordLinkDays?: number | null;
    trialDays?: number | null;
    trialEndsAt?: string | null;
  }
): BuiltEmail {
  const biz = ctx.businessName?.trim();
  const lines: string[] = [`Hi ${ctx.firstName},`, "", `Your Balancr account${biz ? ` for ${biz}` : ""} is ready.`, ""];
  if (ctx.setPasswordUrl && ctx.setPasswordLinkDays && ctx.setPasswordLinkDays > 0) {
    lines.push(
      "1. Choose your password (no rush — this link stays valid for " + plural(ctx.setPasswordLinkDays, "day", "days") + "):",
      ctx.setPasswordUrl,
      "",
      `2. Sign in: ${ctx.loginUrl}`
    );
  } else if (ctx.setPasswordUrl) {
    lines.push(
      "1. Choose your password:",
      ctx.setPasswordUrl,
      "   (This link works for about an hour. If it has expired, open the sign-in page below,",
      '   press "Forgot password" and enter this email address — you will get a fresh link.)',
      "",
      `2. Sign in: ${ctx.loginUrl}`
    );
  } else {
    lines.push(
      `1. Open ${ctx.loginUrl}`,
      '2. Press "Forgot password" and enter this email address — you will get a link to choose your password.'
    );
  }
  lines.push("");
  if (ctx.trialEndsAt && ctx.trialDays && ctx.trialDays > 0) {
    lines.push(
      `You have ${ctx.trialDays} days free to try everything (until ${longDateIso(ctx.trialEndsAt)}). No card, nothing to cancel.`
    );
  }
  lines.push(
    "A good first step: add your products or customers, then create one real invoice — you will see the books, stock and reports update on their own.",
    "",
    contactLine(ctx),
    ...signoff()
  );
  return { subject: "Your Balancr account is ready", text: lines.join("\n") };
}

export function paymentReceivedEmail(
  ctx: EmailCtx & {
    amount: number;
    currency?: string;
    plan?: string | null;
    cycle?: "monthly" | "annual" | null;
    methodLabel?: string | null;
    reference?: string | null;
    coveredUntil: string;
  }
): BuiltEmail {
  const currency = ctx.currency ?? PRICING_CURRENCY;
  const lines = [
    `Hi ${ctx.firstName},`,
    "",
    "Thank you — we've received your payment.",
    "",
    `Amount: ${formatMoney(ctx.amount, currency)}`,
    ctx.plan ? `Plan: ${ctx.plan}${ctx.cycle ? ` (${ctx.cycle})` : ""}` : null,
    ctx.methodLabel ? `Method: ${ctx.methodLabel}` : null,
    ctx.reference ? `Reference: ${ctx.reference}` : null,
    `Covered until: ${longDateIso(ctx.coveredUntil)}`,
    "",
    "Keep this email as your receipt. We'll remind you a week before the next payment is due.",
    "",
    contactLine(ctx),
    ...signoff(),
  ].filter((l): l is string => l !== null);
  return { subject: "Payment received — thank you", text: lines.join("\n") };
}

export function trialExtendedEmail(ctx: EmailCtx & { newEnd: string }): BuiltEmail {
  return {
    subject: "Your Balancr trial has been extended",
    text: [
      `Hi ${ctx.firstName},`,
      "",
      `Good news — your free trial now runs until ${longDateIso(ctx.newEnd)}. Everything you've entered is still there.`,
      "",
      `Sign in: ${ctx.loginUrl}`,
      "",
      contactLine(ctx),
      ...signoff(),
    ].join("\n"),
  };
}

export function reactivatedEmail(ctx: EmailCtx): BuiltEmail {
  return {
    subject: "Your Balancr account is back on",
    text: [
      `Hi ${ctx.firstName},`,
      "",
      "Your account is active again. All your data is exactly as you left it.",
      "",
      `Sign in: ${ctx.loginUrl}`,
      "",
      contactLine(ctx),
      ...signoff(),
    ].join("\n"),
  };
}

export function reminderEmail(ctx: EmailCtx & { due: ReminderDue; account: LifecycleAccount }): BuiltEmail {
  const { due, account } = ctx;
  const hi = [`Hi ${ctx.firstName},`, ""];
  const date = longDateIso(due.date);

  if (due.kind === "trial_ending") {
    const when = due.days === 0 ? "today" : due.days === 1 ? "tomorrow" : `in ${due.days} days (${date})`;
    return {
      subject: due.days <= 1 ? "Your Balancr trial ends " + (due.days === 0 ? "today" : "tomorrow") : `Your Balancr trial ends in ${due.days} days`,
      text: [
        ...hi,
        `Your free trial ends ${when}. To keep going without a break, just reply to this email and we'll set up your plan — all your data stays exactly where it is.`,
        ...(account.plan && account.billingAmount
          ? ["", `Your plan: ${account.plan} — ${formatMoney(account.billingAmount, PRICING_CURRENCY)}${account.billingCycle ? ` per ${account.billingCycle === "annual" ? "year" : "month"}` : ""}.`]
          : []),
        ...payLine(ctx),
        "",
        contactLine(ctx),
        ...signoff(),
      ].join("\n"),
    };
  }

  if (due.kind === "trial_ended") {
    const lockDate = addDaysIso(due.date, TRIAL_GRACE_DAYS);
    return {
      subject: "Your Balancr trial has ended",
      text: [
        ...hi,
        `Your free trial ended on ${date}. You can still sign in until ${lockDate ? longDateIso(lockDate) : "the end of the grace period"} — after that the account pauses (nothing is deleted, and it switches back on as soon as you're set up).`,
        "",
        "To continue, just reply to this email and we'll sort out your plan.",
        ...payLine(ctx),
        "",
        contactLine(ctx),
        ...signoff(),
      ].join("\n"),
    };
  }

  if (due.kind === "renewal_due") {
    const when = due.days === 0 ? "today" : due.days === 1 ? "tomorrow" : `in ${due.days} days (${date})`;
    return {
      subject: due.days === 0 ? "Your Balancr renewal is due today" : `Your Balancr renewal is due in ${plural(due.days, "day", "days")}`,
      text: [
        ...hi,
        `A quick reminder: your Balancr renewal is due ${when}.`,
        ...(account.billingAmount
          ? ["", `Amount: ${formatMoney(account.billingAmount, PRICING_CURRENCY)}${account.billingCycle ? ` (${account.billingCycle})` : ""}`]
          : []),
        ...payLine(ctx),
        "",
        "Once you've paid, reply with the reference and we'll confirm it by email.",
        "",
        contactLine(ctx),
        ...signoff(),
      ].join("\n"),
    };
  }

  // renewal_overdue
  const late = -due.days;
  const lockDate = account.autoLockOverdue === true ? addDaysIso(due.date, RENEWAL_GRACE_DAYS) : null;
  return {
    subject: "Your Balancr renewal is overdue",
    text: [
      ...hi,
      `Your renewal was due on ${date} (${plural(late, "day", "days")} ago) and we haven't seen the payment yet. If you've already paid, thank you — just reply with the reference and we'll update your account.`,
      ...(lockDate && due.days >= -RENEWAL_GRACE_DAYS ? ["", `To avoid any interruption, please pay by ${longDateIso(lockDate)}.`] : []),
      ...payLine(ctx),
      "",
      contactLine(ctx),
      ...signoff(),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------------------
// "Activated but never signed in" — the quiet way a lead is lost
// ---------------------------------------------------------------------------------------
// The welcome email is the only thing a freshly activated customer has. If they miss it, or
// open it after the first link has died, nothing else ever happens and the account just sits
// there. So: two gentle follow-ups, each carrying a FRESH sign-in link, then stop — after
// that it is a human's job (the admin digest lists them).
//
// These describe a fact the customer can verify ("you haven't signed in yet"), carry the one
// thing they need (a link that works) and stop on their own. They are not marketing.

export const ACTIVATION_NUDGE_AFTER_DAYS = [2, 6] as const;
export const ACTIVATION_NUDGE_LAST_DAY = 14;
// The admin digest keeps listing a never-signed-in account for this long, then lets it go.
export const NEVER_SIGNED_IN_LIST_DAYS = 60;
// How long the link inside a welcome / nudge / resend email stays valid.
export const SIGN_IN_LINK_DAYS = 7;

export interface ActivationState {
  // When the account was activated (ms since epoch). Unknown (older accounts) = never nudged.
  activatedAtMs: number | null | undefined;
  // True once the owner has signed in at least once (Firebase Auth's last-sign-in time).
  hasSignedIn: boolean;
  suspended?: boolean;
  complimentary?: boolean;
}

export interface ActivationNudgeDue {
  nth: 1 | 2;
  // Dedupe key stored once sent: "never_signed_in:<nth>:<activation date>".
  key: string;
  ageDays: number;
}

function eligibleForActivationFollowUp(a: ActivationState): number | null {
  if (a.hasSignedIn || a.suspended === true || a.complimentary === true) return null;
  if (typeof a.activatedAtMs !== "number" || !Number.isFinite(a.activatedAtMs) || a.activatedAtMs <= 0) return null;
  return a.activatedAtMs;
}

// The follow-up this account is owed today, or null. At most one; the caller sends it only
// if its key is not already recorded as sent.
export function activationNudgeDue(a: ActivationState, todayIso: string): ActivationNudgeDue | null {
  const at = eligibleForActivationFollowUp(a);
  if (at === null) return null;
  const activatedIso = isoToday(new Date(at));
  const age = daysBetween(activatedIso, todayIso);
  if (age === null || age < ACTIVATION_NUDGE_AFTER_DAYS[0] || age > ACTIVATION_NUDGE_LAST_DAY) return null;
  const nth: 1 | 2 = age >= ACTIVATION_NUDGE_AFTER_DAYS[1] ? 2 : 1;
  return { nth, key: `never_signed_in:${nth}:${activatedIso}`, ageDays: age };
}

// Days since activation for the admin digest's "never signed in" list, or null when the
// account does not belong on it.
export function neverSignedInDays(a: ActivationState, todayIso: string): number | null {
  const at = eligibleForActivationFollowUp(a);
  if (at === null) return null;
  const age = daysBetween(isoToday(new Date(at)), todayIso);
  if (age === null || age < ACTIVATION_NUDGE_AFTER_DAYS[0] || age > NEVER_SIGNED_IN_LIST_DAYS) return null;
  return age;
}

export function activationNudgeEmail(
  ctx: EmailCtx & { startUrl?: string | null; nth: 1 | 2; ageDays: number; trialEndsAt?: string | null }
): BuiltEmail {
  const biz = ctx.businessName?.trim();
  const lines: string[] = [
    `Hi ${ctx.firstName},`,
    "",
    `Your Balancr account${biz ? ` for ${biz}` : ""} was set up ${plural(ctx.ageDays, "day", "days")} ago, but you haven't signed in yet — no problem. Here is a fresh link to choose your password (it stays valid for ${plural(SIGN_IN_LINK_DAYS, "day", "days")}):`,
    "",
  ];
  if (ctx.startUrl) {
    lines.push(ctx.startUrl, "", `Then sign in any time at ${ctx.loginUrl}`);
  } else {
    lines.push(`Open ${ctx.loginUrl}, press "Forgot password" and enter this email address — you will get a link to choose your password.`);
  }
  if (ctx.trialEndsAt) lines.push("", `Your free trial runs until ${longDateIso(ctx.trialEndsAt)}, so there is plenty of time.`);
  lines.push(
    "",
    ctx.nth === 1
      ? "Stuck on anything? Reply to this email and a real person will help you get started."
      : "If Balancr isn't for you right now, no hard feelings — just reply and tell us, or ignore this and we'll leave you be.",
    "",
    contactLine(ctx),
    ...signoff()
  );
  return {
    subject: ctx.nth === 1 ? "Your Balancr account is waiting for you" : "Your Balancr account is still ready",
    text: lines.join("\n"),
  };
}

// Sent when the admin presses "Send sign-in link" on an account.
export function signInLinkEmail(ctx: EmailCtx & { startUrl?: string | null }): BuiltEmail {
  const lines: string[] = [`Hi ${ctx.firstName},`, ""];
  if (ctx.startUrl) {
    lines.push(
      `Here is a fresh link to choose your Balancr password (it stays valid for ${plural(SIGN_IN_LINK_DAYS, "day", "days")}):`,
      "",
      ctx.startUrl,
      "",
      `Then sign in at ${ctx.loginUrl}`
    );
  } else {
    lines.push(`Open ${ctx.loginUrl}, press "Forgot password" and enter this email address — you will get a link to choose your password.`);
  }
  lines.push("", contactLine(ctx), ...signoff());
  return { subject: "Your Balancr sign-in link", text: lines.join("\n") };
}

// ---------------------------------------------------------------------------------------
// Admin morning digest
// ---------------------------------------------------------------------------------------

export interface DigestInput {
  todayIso: string;
  waitingLeads: { name: string; businessName?: string; waitingHours: number }[];
  attention: { label: string; reason: string }[];
  customerEmailsSent: { label: string; kind: ReminderKind }[];
  // Activated more than a couple of days ago and the owner has still never signed in — the
  // customers most likely to quietly vanish, and the ones a personal message helps most.
  neverSignedIn?: { label: string; days: number }[];
  // Sign-in reminders the automation sent today (separate from trial/renewal reminders).
  nudgesSent?: { label: string }[];
  adminUrl: string;
}

// Null when there is nothing worth an email — a digest that arrives empty every morning
// teaches you to ignore it.
export function buildAdminDigest(input: DigestInput): BuiltEmail | null {
  const { waitingLeads, attention, customerEmailsSent } = input;
  const neverSignedIn = input.neverSignedIn ?? [];
  const nudgesSent = input.nudgesSent ?? [];
  if (
    waitingLeads.length === 0 &&
    attention.length === 0 &&
    customerEmailsSent.length === 0 &&
    neverSignedIn.length === 0 &&
    nudgesSent.length === 0
  ) {
    return null;
  }

  const lines: string[] = [`Balancr — ${longDateIso(input.todayIso)}`, ""];
  if (waitingLeads.length > 0) {
    lines.push(`Trial requests waiting (${waitingLeads.length}):`);
    for (const l of waitingLeads.slice(0, 15)) {
      const h = l.waitingHours;
      const age = h < 1 ? "just in" : h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
      lines.push(`  • ${l.businessName || l.name} — waiting ${age}${h >= 24 ? "  ← over a day" : ""}`);
    }
    if (waitingLeads.length > 15) lines.push(`  …and ${waitingLeads.length - 15} more`);
    lines.push("");
  }
  if (attention.length > 0) {
    lines.push(`Accounts needing you (${attention.length}):`);
    for (const a of attention.slice(0, 20)) lines.push(`  • ${a.label} — ${a.reason}`);
    if (attention.length > 20) lines.push(`  …and ${attention.length - 20} more`);
    lines.push("");
  }
  if (neverSignedIn.length > 0) {
    lines.push(`Activated but never signed in (${neverSignedIn.length}) — a personal message may help:`);
    for (const n of neverSignedIn.slice(0, 15)) lines.push(`  • ${n.label} — activated ${plural(n.days, "day", "days")} ago`);
    if (neverSignedIn.length > 15) lines.push(`  …and ${neverSignedIn.length - 15} more`);
    lines.push("");
  }
  if (customerEmailsSent.length > 0) {
    lines.push("Reminders sent to customers automatically today:");
    for (const s of customerEmailsSent.slice(0, 20)) lines.push(`  • ${s.label} — ${s.kind.replace("_", " ")}`);
    lines.push("");
  }
  if (nudgesSent.length > 0) {
    lines.push("Sign-in reminders (with a fresh link) sent automatically today:");
    for (const s of nudgesSent.slice(0, 20)) lines.push(`  • ${s.label}`);
    lines.push("");
  }
  lines.push(`Open the admin panel: ${input.adminUrl}`);

  const bits: string[] = [];
  if (waitingLeads.length) bits.push(`${waitingLeads.length} lead${waitingLeads.length === 1 ? "" : "s"} waiting`);
  if (attention.length) bits.push(`${attention.length} account${attention.length === 1 ? " needs" : "s need"} you`);
  if (neverSignedIn.length) bits.push(`${neverSignedIn.length} never signed in`);
  if (bits.length === 0) {
    const n = customerEmailsSent.length + nudgesSent.length;
    bits.push(`${n} reminder${n === 1 ? "" : "s"} sent`);
  }
  return { subject: `Balancr today: ${bits.join(", ")}`, text: lines.join("\n") };
}
