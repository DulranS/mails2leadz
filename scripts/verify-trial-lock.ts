// Empirical check for automatic trial locking (lib/accountAccess.ts).
//
// Run: npx tsx scripts/verify-trial-lock.ts

import { resolveAccess, isTrialLocked, trialLastAccessIso, TRIAL_GRACE_DAYS } from "../lib/accountAccess";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const at = (iso: string, time = "12:00:00") => new Date(`${iso}T${time}Z`);

// Trial ends 2026-09-10; grace = 2 days => last working day 2026-09-12.
const trial = { trialEndsAt: "2026-09-10" };
assert(TRIAL_GRACE_DAYS === 2, "grace period is 2 days");
assert(trialLastAccessIso("2026-09-10") === "2026-09-12", "last access day = trial end + grace");
assert(trialLastAccessIso("2026-12-30") === "2027-01-01", "grace crosses a year boundary");
assert(trialLastAccessIso("nonsense") === null, "malformed date has no lock day");

assert(!isTrialLocked(trial, at("2026-09-09")), "day before trial end: open");
assert(!isTrialLocked(trial, at("2026-09-10", "23:59:59")), "trial end day: open");
assert(!isTrialLocked(trial, at("2026-09-11")), "grace day 1: open");
assert(!isTrialLocked(trial, at("2026-09-12", "23:59:59")), "grace day 2 (last): open until midnight UTC");
assert(isTrialLocked(trial, at("2026-09-13", "00:00:01")), "first moment after grace: locked");
assert(isTrialLocked(trial, at("2027-03-01")), "long after: locked");

// Fail-open cases.
assert(!isTrialLocked({}, at("2030-01-01")), "no trial => never trial-locked");
assert(!isTrialLocked({ trialEndsAt: "" }, at("2030-01-01")), "empty trial date => open");
assert(!isTrialLocked({ trialEndsAt: "10/09/2026" }, at("2030-01-01")), "malformed trial date => open (fail open)");
assert(!isTrialLocked({ trialEndsAt: "2026-02-31" }, at("2030-01-01")), "impossible calendar date => open (fail open)");

// Paid-up protection.
const paid = { trialEndsAt: "2026-09-10", lastPaidAt: Date.parse("2026-09-11T00:00:00Z"), renewalDueDate: "2026-10-11" };
assert(!isTrialLocked(paid, at("2026-09-20")), "paid with renewal ahead + stale trial date: NOT locked");
assert(isTrialLocked({ ...paid, renewalDueDate: "2026-09-15" }, at("2026-09-20")), "paid but renewal also passed: locked again");
assert(isTrialLocked({ trialEndsAt: "2026-09-10", renewalDueDate: "2026-10-11" }, at("2026-09-20")), "renewal date alone (no payment recorded) does not protect");

// resolveAccess
let r = resolveAccess(null);
assert(!r.locked && r.kind === null, "no account doc => open");
r = resolveAccess({ suspended: false }, at("2026-09-21"));
assert(!r.locked, "not suspended, no trial => open");
r = resolveAccess({ suspended: true, reason: "Payment overdue" }, at("2026-09-21"));
assert(r.locked && r.kind === "suspended" && r.message === "Payment overdue", "manual suspend keeps the admin's reason");
r = resolveAccess({ suspended: true }, at("2026-09-21"));
assert(r.locked && r.kind === "suspended" && r.message === null, "manual suspend with no reason => null message");
r = resolveAccess({ ...trial }, at("2026-09-21"));
assert(r.locked && r.kind === "trial_expired" && !!r.message, "expired trial => locked with a trial message");
r = resolveAccess({ suspended: true, ...trial, reason: "x" }, at("2026-09-21"));
assert(r.kind === "suspended" && r.message === "x", "manual suspend wins over trial expiry for the message");
r = resolveAccess({ suspended: false, trialEndsAt: "2026-09-25" }, at("2026-09-21"));
assert(!r.locked && r.trialLockDate === "2026-09-27", "active trial: open, exposes lock date");

// Extending (what the admin button does: today + 7) unlocks immediately.
const extended = { trialEndsAt: "2026-09-28" };
assert(!resolveAccess(extended, at("2026-09-21")).locked, "extended trial => open again with no other action");
// Converting to paid (trialEndsAt deleted) unlocks immediately.
assert(!resolveAccess({ suspended: false }, at("2026-09-21")).locked, "converted to paid (trial cleared) => open");

// ---- Overdue renewal (opt-in) ----------------------------------------------
import { isRenewalLocked, renewalLastAccessIso, RENEWAL_GRACE_DAYS } from "../lib/accountAccess";
assert(RENEWAL_GRACE_DAYS === 7, "renewal grace is 7 days");
assert(renewalLastAccessIso("2026-09-10") === "2026-09-17", "renewal last access = due + 7 days");
const ren = { renewalDueDate: "2026-09-10", autoLockOverdue: true };
assert(!isRenewalLocked({ renewalDueDate: "2026-09-10" }, at("2027-01-01")), "auto-lock OFF (default): never locks, however overdue");
assert(!isRenewalLocked({ ...ren, autoLockOverdue: false }, at("2027-01-01")), "auto-lock explicitly false: never locks");
assert(!isRenewalLocked(ren, at("2026-09-09")), "renewal not yet due: open");
assert(!isRenewalLocked(ren, at("2026-09-17", "23:59:59")), "last grace day: open");
assert(isRenewalLocked(ren, at("2026-09-18", "00:00:01")), "after grace: locked");
assert(!isRenewalLocked({ autoLockOverdue: true }, at("2027-01-01")), "no renewal date: never locks");
assert(!isRenewalLocked({ renewalDueDate: "garbage", autoLockOverdue: true }, at("2027-01-01")), "malformed renewal date: open");
assert(!isRenewalLocked({ ...ren, trialEndsAt: "2026-12-01" }, at("2026-09-20")), "running trial is governed by trial rules, not renewal");
// Mark paid advances the date a cycle (billing route) => unlocks instantly.
assert(!isRenewalLocked({ ...ren, renewalDueDate: "2026-10-21" }, at("2026-09-21")), "after Mark paid (date moved forward): open");
r = resolveAccess(ren, at("2026-09-21"));
assert(r.locked && r.kind === "renewal_overdue" && !!r.message && r.renewalLockDate === "2026-09-17", "resolveAccess reports renewal_overdue");
r = resolveAccess({ ...ren, suspended: true, reason: "abuse" }, at("2026-09-21"));
assert(r.kind === "suspended" && r.message === "abuse", "manual suspend still wins over renewal lock");
r = resolveAccess({ ...ren, trialEndsAt: "2026-09-01" }, at("2026-09-21"));
assert(r.kind === "trial_expired", "expired trial reports trial_expired even if renewal fields exist");
