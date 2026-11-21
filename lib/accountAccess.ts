// The single definition of "is this business locked out right now?".
//
// Three things can lock a business:
//   1. `suspended: true` — the admin pressed Suspend (app/api/admin/.../suspend).
//   2. An expired trial — `trialEndsAt` passed more than TRIAL_GRACE_DAYS ago
//      and the account has not been converted to paid.
//   3. An overdue renewal — ONLY for accounts where the admin switched on
//      `autoLockOverdue` (off by default, per account), and only once the
//      renewal date is more than RENEWAL_GRACE_DAYS in the past. Mark paid
//      pushes the renewal date a cycle forward, which unlocks it.
//
// (2) and (3) are computed on read, never written. The daily job (app/api/cron/daily) sends
// reminders and tidies up but never changes a business's access, so nothing "flips a flag" when a trial ends; instead the same
// pure function below is asked by both the browser (contexts/AuthContext.tsx)
// and the server (requireAiContext in lib/firebaseAdmin.ts). Because it is
// derived from trialEndsAt, extending the trial or converting to paid unlocks
// the account instantly with no second action, and there is no stale
// "suspended" flag to forget to clear.
//
// Safety rails, because the worst failure is locking out a paying customer:
//   - A malformed/missing trialEndsAt never locks (fail open).
//   - Marking a payment clears trialEndsAt (billing route), and an account
//     with a recorded payment and a renewal date that is still in the future is
//     never trial-locked even if a stale trialEndsAt is left behind.
//   - Dates are compared as UTC calendar days, the same way the rest of the
//     app treats ISO dates.

export const TRIAL_GRACE_DAYS = 2;
export const RENEWAL_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AccessInput {
  // Admin accounts (pass 308): never billed or locked by trial or renewal. Suspension still applies.
  adminAccount?: boolean;
  suspended?: boolean;
  reason?: string;
  trialEndsAt?: string;
  renewalDueDate?: string;
  lastPaidAt?: number;
  // Opt-in per account; absent/false means an overdue renewal never locks.
  autoLockOverdue?: boolean;
  // Never-invoiced account (the platform owner's own business, a partner):
  // neither computed lock applies. A manual suspend still does.
  complimentary?: boolean;
}

export type LockKind = "suspended" | "trial_expired" | "renewal_overdue";

export interface AccessResult {
  locked: boolean;
  kind: LockKind | null;
  // Shown on the lockout screen / returned by the API.
  message: string | null;
  // Last day (ISO) the business can still sign in, when there is a trial.
  trialLockDate: string | null;
  // Same, for an overdue renewal — only when autoLockOverdue is on.
  renewalLockDate: string | null;
}

function parseIso(iso: string | undefined | null): number | null {
  if (!iso || !ISO_DATE.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  // Round-trip so "2026-02-31" (which JS silently rolls into March) is rejected.
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return t;
}

function utcToday(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// The last day the business can still sign in after the trial date.
export function trialLastAccessIso(trialEndsAt: string): string | null {
  const t = parseIso(trialEndsAt);
  if (t === null) return null;
  return new Date(t + TRIAL_GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export function renewalLastAccessIso(renewalDueDate: string): string | null {
  const t = parseIso(renewalDueDate);
  if (t === null) return null;
  return new Date(t + RENEWAL_GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export function isRenewalLocked(input: AccessInput, now: Date = new Date()): boolean {
  if (input.complimentary === true) return false;
  if (input.autoLockOverdue !== true) return false;
  const due = parseIso(input.renewalDueDate);
  if (due === null) return false;
  // An account still carrying a trial date is governed by the trial rules.
  if (parseIso(input.trialEndsAt) !== null) return false;
  return utcToday(now) > due + RENEWAL_GRACE_DAYS * DAY_MS;
}

export function isTrialLocked(input: AccessInput, now: Date = new Date()): boolean {
  if (input.complimentary === true) return false;
  const end = parseIso(input.trialEndsAt);
  if (end === null) return false;
  const today = utcToday(now);

  // Paid-up protection: a recorded payment with a renewal still ahead wins
  // over a leftover trial date.
  const renewal = parseIso(input.renewalDueDate);
  if (input.lastPaidAt && renewal !== null && renewal >= today) return false;

  return today > end + TRIAL_GRACE_DAYS * DAY_MS;
}

export function resolveAccess(input: AccessInput | null | undefined, now: Date = new Date()): AccessResult {
  const a = input ?? {};
  const lockDate = a.trialEndsAt ? trialLastAccessIso(a.trialEndsAt) : null;
  const renewalDate =
    a.autoLockOverdue === true && a.renewalDueDate ? renewalLastAccessIso(a.renewalDueDate) : null;

  if (a.suspended === true) {
    return {
      locked: true,
      kind: "suspended",
      message: a.reason?.trim() || null,
      trialLockDate: lockDate,
      renewalLockDate: renewalDate,
    };
  }
  if (a.adminAccount === true) {
    return { locked: false, kind: null, message: null, trialLockDate: lockDate, renewalLockDate: renewalDate };
  }
  if (isTrialLocked(a, now)) {
    return {
      locked: true,
      kind: "trial_expired",
      message: "Your free trial has ended. Get in touch and we'll get you back in — your data is safe.",
      trialLockDate: lockDate,
      renewalLockDate: renewalDate,
    };
  }
  if (isRenewalLocked(a, now)) {
    return {
      locked: true,
      kind: "renewal_overdue",
      message: "Your renewal is overdue. Get in touch and we'll get you back in — your data is safe.",
      trialLockDate: lockDate,
      renewalLockDate: renewalDate,
    };
  }
  return { locked: false, kind: null, message: null, trialLockDate: lockDate, renewalLockDate: renewalDate };
}
