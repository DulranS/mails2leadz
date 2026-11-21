// Pure billing rules for the manual (no payment gateway) billing system.
//
// Everything that decides "what happens to an account when I record a payment"
// lives here as plain functions over plain objects, so scripts/verify-billing.ts
// can exercise it without Firebase. app/api/admin/businesses/[businessId]/billing
// is the only caller that writes; it just turns the `set` / `remove` lists these
// functions return into a Firestore transaction.
//
// Why a payment RECORD and not just "lastPaidAt": Mark paid used to move the
// renewal date and stamp one timestamp — no amount, no method, no reference, and
// no way to take back a mis-click short of remembering the old date. Each payment
// is now stored (users/{id}/meta/billingHistory, owner-readable, client-write-
// denied) together with what it replaced, so the latest one can be undone exactly.

import type { AccountStatus } from "./types";
import { tierById, periodAmount, type BillingCycle } from "./pricing";

export type PaymentMethod = "bank_transfer" | "cash" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

// What a payment overwrote — enough to restore the account exactly on undo.
export interface PaymentPrev {
  renewalDueDate: string | null;
  lastPaidAt: number | null;
  trialEndsAt: string | null;
  convertedAt: number | null;
  autoLockOverdue: boolean | null;
  plan: string | null;
  billingAmount: number | null;
  billingCycle: BillingCycle | null;
}

export interface BillingPayment {
  id: string;
  at: number; // when it was recorded (ms)
  amount: number;
  cycle: BillingCycle;
  plan: string | null;
  method: PaymentMethod;
  reference: string | null; // bank ref / receipt no., free text
  coveredUntil: string; // the renewal date this payment set (ISO)
  prev: PaymentPrev;
}

// Keep the history bounded so the doc can never grow without limit (5 years of
// monthly payments). Older entries drop off the front.
export const MAX_PAYMENTS_KEPT = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Adds whole months WITHOUT the JavaScript overflow: Date#setUTCMonth turns
// 31 Jan + 1 month into 3 Mar (it skips February entirely), which silently
// pushed month-end customers' renewals a few days late and, once the date had
// drifted, kept it there. This clamps to the last day of the target month
// instead (31 Jan → 28/29 Feb). `anchorDay` lets a caller keep the original
// billing day (e.g. 31) across a short month; without it the base day is used.
export function addMonthsClamped(base: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? base.getUTCDate();
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDayOfTarget)));
}

// The renewal date after ONE paid billing period. Counts from whichever is later
// of the current due date or today: renewing early keeps the days already paid
// for; renewing late counts from today instead of compounding lateness.
export function nextRenewalDate(
  currentDueDate: string | undefined | null,
  cycle: BillingCycle,
  now: Date
): string {
  const today = utcMidnight(now);
  const current = isIsoDate(currentDueDate) ? new Date(`${currentDueDate}T00:00:00Z`) : null;
  const base = current && current.getTime() > today.getTime() ? current : today;
  return addMonthsClamped(base, cycle === "annual" ? 12 : 1).toISOString().slice(0, 10);
}

export interface RecordPaymentInput {
  amount?: number; // defaults to the account's billing amount, then the plan's list price
  plan?: string; // optional: set/replace the plan in the same step
  cycle?: BillingCycle;
  method?: PaymentMethod;
  reference?: string;
  renewalDueDate?: string; // explicit override; otherwise one cycle from now/current
  autoLockOverdue?: boolean; // only honoured when the account has no setting yet
}

export interface PaymentResult {
  ok: true;
  // Fields to write onto meta/account, and fields to delete from it.
  set: Record<string, unknown>;
  remove: string[];
  payment: BillingPayment;
}
export interface PaymentError {
  ok: false;
  error: string;
}

export function buildPayment(
  account: Partial<AccountStatus>,
  input: RecordPaymentInput,
  now: Date,
  id: string
): PaymentResult | PaymentError {
  const cycle: BillingCycle = input.cycle ?? account.billingCycle ?? "monthly";
  const plan = (input.plan ?? account.plan ?? "").trim() || null;

  // Amount: what the admin typed, else what's on the account, else the public
  // list price for that plan and cycle. Never guess silently beyond that.
  let amount = input.amount;
  if (amount === undefined) amount = account.billingAmount;
  if (amount === undefined) {
    const tier = tierById(plan);
    if (tier) amount = periodAmount(tier, cycle);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter the amount received (it must be more than 0)." };
  }
  if (input.renewalDueDate !== undefined && !isIsoDate(input.renewalDueDate)) {
    return { ok: false, error: "That renewal date isn't a valid date." };
  }
  if (account.complimentary === true) {
    return { ok: false, error: "This account is marked complimentary — untick that in Edit billing before recording a payment." };
  }

  const coveredUntil = input.renewalDueDate ?? nextRenewalDate(account.renewalDueDate, cycle, now);
  const reference = (input.reference ?? "").trim().slice(0, 120) || null;

  const prev: PaymentPrev = {
    renewalDueDate: account.renewalDueDate ?? null,
    lastPaidAt: account.lastPaidAt ?? null,
    trialEndsAt: account.trialEndsAt ?? null,
    convertedAt: account.convertedAt ?? null,
    autoLockOverdue: typeof account.autoLockOverdue === "boolean" ? account.autoLockOverdue : null,
    plan: account.plan ?? null,
    billingAmount: account.billingAmount ?? null,
    billingCycle: account.billingCycle ?? null,
  };

  const set: Record<string, unknown> = {
    renewalDueDate: coveredUntil,
    lastPaidAt: now.getTime(),
    billingCycle: cycle,
    billingAmount: amount,
  };
  if (plan) set.plan = plan;
  const remove: string[] = [];

  // A payment means this is a paying account, not a trial. Clearing the trial
  // date is what stops the automatic trial lock ever catching a customer who has
  // paid; convertedAt feeds the trial → paid figure (stamped once).
  if (account.trialEndsAt) {
    remove.push("trialEndsAt");
    if (!account.convertedAt) set.convertedAt = now.getTime();
  }
  // First time only: honour the caller's choice about locking on overdue. An
  // account that already has a setting keeps it.
  if (typeof account.autoLockOverdue !== "boolean" && input.autoLockOverdue === true) {
    set.autoLockOverdue = true;
  }

  const method: PaymentMethod =
    input.method && input.method in PAYMENT_METHOD_LABELS ? input.method : "bank_transfer";

  return {
    ok: true,
    set,
    remove,
    payment: {
      id,
      at: now.getTime(),
      amount,
      cycle,
      plan,
      method,
      reference,
      coveredUntil,
      prev,
    },
  };
}

export interface UndoResult {
  ok: true;
  set: Record<string, unknown>;
  remove: string[];
}

// Reverses the LATEST payment exactly. Refused if the renewal date has been
// edited since (the account no longer matches what that payment produced), so an
// undo can never silently clobber a later manual correction.
export function buildUndo(
  account: Partial<AccountStatus>,
  payment: BillingPayment
): UndoResult | PaymentError {
  if (account.renewalDueDate !== payment.coveredUntil) {
    return {
      ok: false,
      error:
        "The renewal date was changed after this payment was recorded, so it can't be undone automatically. Correct the date in Edit billing instead.",
    };
  }
  const p = payment.prev;
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined) remove.push(key);
    else set[key] = value;
  };
  put("renewalDueDate", p.renewalDueDate);
  put("lastPaidAt", p.lastPaidAt);
  put("trialEndsAt", p.trialEndsAt);
  put("convertedAt", p.convertedAt);
  put("plan", p.plan);
  put("billingAmount", p.billingAmount);
  put("billingCycle", p.billingCycle);
  // autoLockOverdue: prev null means it had no setting before this payment.
  if (p.autoLockOverdue === null) remove.push("autoLockOverdue");
  else set.autoLockOverdue = p.autoLockOverdue;
  return { ok: true, set, remove };
}

// A short, ready-to-send receipt — copied and sent by whatever channel the
// customer uses (WhatsApp, email). Nothing is sent from the app.
export function receiptMessage(
  payment: BillingPayment,
  opts: { ownerName?: string; currency: string; businessName?: string | null }
): string {
  const first = (opts.ownerName || opts.businessName || "there").trim().split(/\s+/)[0];
  const when = new Date(payment.at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const until = new Date(`${payment.coveredUntil}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const amt = `${opts.currency} ${payment.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const via = PAYMENT_METHOD_LABELS[payment.method].toLowerCase();
  return `Hi ${first}, thank you — I've received your Balancr payment of ${amt} on ${when} (${via}${
    payment.reference ? `, ref ${payment.reference}` : ""
  }). Your ${payment.plan ? `${payment.plan} ` : ""}plan is paid up until ${until}.`;
}

// Appends a payment and trims to MAX_PAYMENTS_KEPT.
export function appendPayment(history: BillingPayment[], payment: BillingPayment): BillingPayment[] {
  const next = [...history, payment];
  return next.length > MAX_PAYMENTS_KEPT ? next.slice(next.length - MAX_PAYMENTS_KEPT) : next;
}

// ---- Monthly recurring revenue --------------------------------------------------------
//
// The admin's MRR tile used to add up billingAmount over every account that wasn't
// locked. But provisioning stores the plan's LIST PRICE on a new trial account (so
// "Record first payment" is one click), which meant every free trial with a chosen
// plan counted as revenue, as did any complimentary account that still carried an
// amount. This is the single definition of "this account is paying us":
//   - no trial date (a trial hasn't paid anything yet),
//   - not complimentary (never invoiced),
//   - not suspended / locked (the caller passes only accounts that still have access),
//   - has an amount, AND has evidence of actual billing: a recorded payment or a
//     renewal date (a customer set up by hand before payments were recorded has a
//     renewal date; a bare list price with neither is just a default).
// Annual amounts are divided by 12 for this one figure only.
export interface MrrAccount {
  suspended?: boolean;
  autoLocked?: boolean;
  complimentary?: boolean;
  trialEndsAt?: string | null;
  billingAmount?: number | null;
  billingCycle?: BillingCycle | null;
  lastPaidAt?: number | null;
  renewalDueDate?: string | null;
}

export function countsTowardMrr(a: MrrAccount): boolean {
  if (a.suspended || a.autoLocked || a.complimentary) return false;
  if (a.trialEndsAt) return false;
  if (typeof a.billingAmount !== "number" || !Number.isFinite(a.billingAmount) || a.billingAmount <= 0) return false;
  return a.lastPaidAt != null || !!a.renewalDueDate;
}

export function monthlyRecurringRevenue(accounts: MrrAccount[]): number {
  return accounts.reduce((sum, a) => {
    if (!countsTowardMrr(a)) return sum;
    const amount = a.billingAmount as number;
    return sum + (a.billingCycle === "annual" ? amount / 12 : amount);
  }, 0);
}

// ---- Duplicate-payment guard ------------------------------------------------------------
//
// Recording a payment moves the renewal a whole cycle, so the same payment recorded twice
// (a request that timed out after it had actually saved, then a retry) silently gives a
// customer an extra month or year. The button is disabled while a request is in flight, but
// that can't help across a timeout. An identical payment (same amount, cycle, method and
// reference) landing within a minute of the previous one is almost certainly that retry
// rather than a genuine second payment, so the route refuses it with an explanation. It is
// undoable either way; this just stops it happening by accident.
export const DUPLICATE_WINDOW_MS = 60 * 1000;

export function isLikelyDuplicate(history: BillingPayment[], candidate: BillingPayment, now: Date): boolean {
  const last = history[history.length - 1];
  if (!last) return false;
  const age = now.getTime() - last.at;
  if (age < 0 || age > DUPLICATE_WINDOW_MS) return false;
  return (
    last.amount === candidate.amount &&
    last.cycle === candidate.cycle &&
    last.method === candidate.method &&
    (last.reference ?? null) === (candidate.reference ?? null)
  );
}
