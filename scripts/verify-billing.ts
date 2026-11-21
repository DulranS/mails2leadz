// Empirical check for the manual billing rules (lib/billing.ts, lib/pricing.ts).
//
// Run: npx tsx scripts/verify-billing.ts

import {
  addMonthsClamped,
  nextRenewalDate,
  buildPayment,
  buildUndo,
  appendPayment,
  receiptMessage,
  isIsoDate,
  MAX_PAYMENTS_KEPT,
  type BillingPayment,
} from "../lib/billing";
import { TIERS, tierById, periodAmount, monthlyEquivalent, parseInterest, annualSaving } from "../lib/pricing";
import { resolveAccess } from "../lib/accountAccess";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const at = (iso: string, time = "12:00:00") => new Date(`${iso}T${time}Z`);

// ---- Month arithmetic: the JS overflow this replaced ----------------------------
// The old code did setUTCMonth(+1): 31 Jan -> 3 Mar (February skipped).
{
  const d = new Date("2026-01-31T00:00:00Z");
  const old = new Date(d); old.setUTCMonth(old.getUTCMonth() + 1);
  assert(old.toISOString().slice(0, 10) === "2026-03-03", "baseline: the old setUTCMonth approach skips February (2026-03-03)");
  assert(addMonthsClamped(d, 1).toISOString().slice(0, 10) === "2026-02-28", "31 Jan + 1 month clamps to 28 Feb");
  assert(addMonthsClamped(new Date("2028-01-31T00:00:00Z"), 1).toISOString().slice(0, 10) === "2028-02-29", "leap year: 31 Jan 2028 + 1 month = 29 Feb");
  assert(addMonthsClamped(new Date("2026-12-15T00:00:00Z"), 1).toISOString().slice(0, 10) === "2027-01-15", "December rolls into next year");
  assert(addMonthsClamped(new Date("2026-03-31T00:00:00Z"), 1).toISOString().slice(0, 10) === "2026-04-30", "31 Mar + 1 month = 30 Apr");
  assert(addMonthsClamped(new Date("2028-02-29T00:00:00Z"), 12).toISOString().slice(0, 10) === "2029-02-28", "29 Feb + 12 months = 28 Feb (no 1 Mar)");
  assert(addMonthsClamped(new Date("2026-02-28T00:00:00Z"), 1, 31).toISOString().slice(0, 10) === "2026-03-31", "anchor day restores the 31st after a short month");
}

// ---- Next renewal ------------------------------------------------------------------
assert(nextRenewalDate("2026-10-10", "monthly", at("2026-10-05")) === "2026-11-10", "paying 5 days early keeps the paid-for days (10 Oct -> 10 Nov)");
assert(nextRenewalDate("2026-09-01", "monthly", at("2026-10-05")) === "2026-11-05", "paying a month late counts from today, not from the stale date");
assert(nextRenewalDate(undefined, "monthly", at("2026-10-05")) === "2026-11-05", "first payment with no date counts from today");
assert(nextRenewalDate(null, "annual", at("2026-10-05")) === "2027-10-05", "annual first payment = one year");
assert(nextRenewalDate("2026-01-31", "monthly", at("2026-01-20")) === "2026-02-28", "month-end renewal no longer skips February");
assert(nextRenewalDate("garbage", "monthly", at("2026-10-05")) === "2026-11-05", "an unparseable stored date is treated as none");
assert(isIsoDate("2026-02-28") && !isIsoDate("2026-02-31") && !isIsoDate("28/02/2026") && !isIsoDate(undefined), "isIsoDate accepts real dates only");

// ---- Pricing ------------------------------------------------------------------------
assert(TIERS.length === 3 && TIERS.filter((t) => t.recommended).length === 1, "three tiers, exactly one recommended");
assert(TIERS.every((t) => t.annual === t.monthly * 10), "annual = 10 x monthly for every tier (\"2 months free\" is true)");
assert(tierById("growth")?.id === "Growth" && tierById("nope") === null && tierById(null) === null, "tierById is case-insensitive and null-safe");
assert(periodAmount(tierById("Growth")!, "annual") === 49000 && periodAmount(tierById("Growth")!, "monthly") === 4900, "period amount per cycle");
assert(monthlyEquivalent(tierById("Starter")!, "annual") === 2417, "annual card shows the rounded per-month figure");
assert(annualSaving(tierById("Business")!) === 17800, "annual saving = two months");
{
  const p = parseInterest("Growth — annual");
  assert(p?.tier.id === "Growth" && p?.cycle === "annual", "parses the form's \"Growth — annual\" string");
  assert(parseInterest("Starter")?.cycle === null, "plan without a cycle parses with cycle null");
  assert(parseInterest("Growth - monthly")?.cycle === "monthly", "tolerates a plain hyphen");
  assert(parseInterest("Custom thing") === null && parseInterest("") === null && parseInterest(undefined) === null, "unknown/empty interest is null, never guessed");
}

// ---- Recording a payment --------------------------------------------------------------
const now = at("2026-10-05");
// First payment on a trial account that has a plan preset from its trial request.
{
  const acct = { suspended: false, plan: "Growth", billingCycle: "annual" as const, billingAmount: 49000, trialEndsAt: "2026-10-03" };
  const r = buildPayment(acct, { method: "bank_transfer", reference: "  TXN-991  ", autoLockOverdue: true }, now, "p1");
  assert(r.ok, "first payment on a trial account succeeds");
  if (r.ok) {
    assert(r.payment.amount === 49000 && r.payment.cycle === "annual", "amount defaults to the account's billing amount");
    assert(r.set.renewalDueDate === "2027-10-05", "annual first payment sets the renewal a year out");
    assert(r.remove.includes("trialEndsAt"), "payment clears the trial date");
    assert(typeof r.set.convertedAt === "number", "payment on a trial stamps convertedAt");
    assert(r.set.autoLockOverdue === true, "first payment turns on auto-lock when asked and unset");
    assert(r.payment.reference === "TXN-991", "reference is trimmed");
    assert(r.payment.prev.trialEndsAt === "2026-10-03" && r.payment.prev.renewalDueDate === null, "the payment remembers what it replaced");
    // The account must NOT be locked after that payment even though the trial date passed.
    const after = { ...acct, ...r.set } as Record<string, unknown>;
    delete after.trialEndsAt;
    assert(!resolveAccess(after as never, at("2026-10-06")).locked, "a paid account is not trial-locked");
  }
}
// Amount fallbacks and validation
{
  const r = buildPayment({ suspended: false, plan: "Starter" }, { cycle: "monthly" }, now, "p2");
  assert(r.ok && r.payment.amount === 2900, "no amount anywhere: falls back to the plan's public list price");
  const bad = buildPayment({ suspended: false }, {}, now, "p3");
  assert(!bad.ok, "no amount and no known plan: refuses rather than inventing a figure");
  assert(!buildPayment({ suspended: false, billingAmount: 100 }, { amount: 0 }, now, "p4").ok, "amount 0 refused");
  assert(!buildPayment({ suspended: false, billingAmount: 100 }, { amount: -5 }, now, "p5").ok, "negative amount refused");
  assert(!buildPayment({ suspended: false, billingAmount: 100 }, { amount: NaN }, now, "p6").ok, "NaN amount refused");
  assert(!buildPayment({ suspended: false, billingAmount: 100 }, { renewalDueDate: "2026-02-31" }, now, "p7").ok, "impossible renewal date refused");
  assert(!buildPayment({ suspended: false, billingAmount: 100, complimentary: true }, {}, now, "p8").ok, "complimentary account refuses a payment");
  const explicit = buildPayment({ suspended: false, billingAmount: 100, renewalDueDate: "2026-10-20" }, { renewalDueDate: "2026-12-01" }, now, "p9");
  assert(explicit.ok && explicit.set.renewalDueDate === "2026-12-01", "an explicit renewal date wins over the computed one");
}
// Existing auto-lock choice is never overridden by the default
{
  const r = buildPayment({ suspended: false, billingAmount: 100, autoLockOverdue: true, renewalDueDate: "2026-10-01" }, { autoLockOverdue: true }, now, "p10");
  assert(r.ok && !("autoLockOverdue" in r.set), "an account that already has the setting keeps it untouched");
  const off = buildPayment({ suspended: false, billingAmount: 100 }, { autoLockOverdue: false }, now, "p11");
  assert(off.ok && !("autoLockOverdue" in off.set), "not asking for auto-lock leaves it unset");
}
// An overdue, auto-locked account is unlocked by a payment
{
  const acct = { suspended: false, billingAmount: 4900, billingCycle: "monthly" as const, renewalDueDate: "2026-09-01", autoLockOverdue: true, lastPaidAt: 1 };
  assert(resolveAccess(acct, now).locked, "baseline: 34 days overdue with auto-lock on is locked");
  const r = buildPayment(acct, {}, now, "p12");
  assert(r.ok, "payment on an overdue account succeeds");
  if (r.ok) assert(!resolveAccess({ ...acct, ...r.set } as never, now).locked, "recording the payment unlocks it instantly");
}

// ---- Undo -------------------------------------------------------------------------------
{
  const before = { suspended: false, plan: "Growth", billingCycle: "monthly" as const, billingAmount: 4900, renewalDueDate: "2026-10-10", lastPaidAt: 111, autoLockOverdue: undefined as boolean | undefined };
  const r = buildPayment(before, { autoLockOverdue: true }, now, "u1");
  assert(r.ok, "setup: payment recorded");
  if (r.ok) {
    const afterAcct = { ...before, ...r.set } as typeof before;
    const u = buildUndo(afterAcct, r.payment);
    assert(u.ok, "undo of the latest payment succeeds");
    if (u.ok) {
      const restored: Record<string, unknown> = { ...afterAcct, ...u.set };
      for (const k of u.remove) delete restored[k];
      assert(restored.renewalDueDate === "2026-10-10", "undo restores the previous renewal date");
      assert(restored.lastPaidAt === 111, "undo restores the previous lastPaidAt");
      assert(!("autoLockOverdue" in restored), "undo removes an auto-lock setting the payment introduced");
    }
    const edited = { ...afterAcct, renewalDueDate: "2027-01-01" };
    const refused = buildUndo(edited, r.payment);
    assert(!refused.ok, "undo is refused once the renewal date was edited afterwards");
  }
  // Undoing a trial conversion puts the trial back
  const trialAcct = { suspended: false, billingAmount: 2900, trialEndsAt: "2026-10-08" };
  const r2 = buildPayment(trialAcct, { cycle: "monthly" }, now, "u2");
  if (r2.ok) {
    const afterAcct: Record<string, unknown> = { ...trialAcct, ...r2.set };
    for (const k of r2.remove) delete afterAcct[k];
    const u = buildUndo(afterAcct as never, r2.payment);
    assert(u.ok && u.set.trialEndsAt === "2026-10-08", "undoing a first payment restores the trial date");
    assert(u.ok && u.remove.includes("convertedAt") && u.remove.includes("renewalDueDate"), "…and removes convertedAt and the renewal date it created");
  } else assert(false, "setup: trial payment recorded");
}

// ---- History bound + receipt ----------------------------------------------------------------
{
  let h: BillingPayment[] = [];
  const base = buildPayment({ suspended: false, billingAmount: 100 }, {}, now, "x");
  if (!base.ok) throw new Error("setup");
  for (let i = 0; i < MAX_PAYMENTS_KEPT + 7; i++) h = appendPayment(h, { ...base.payment, id: `id${i}` });
  assert(h.length === MAX_PAYMENTS_KEPT, `history is capped at ${MAX_PAYMENTS_KEPT}`);
  assert(h[h.length - 1].id === `id${MAX_PAYMENTS_KEPT + 6}` && h[0].id === "id7", "the oldest entries drop off, the newest is kept");
  const msg = receiptMessage(base.payment, { ownerName: "Kamal Perera", currency: "LKR" });
  assert(msg.startsWith("Hi Kamal,") && msg.includes("LKR 100") && msg.includes("paid up until"), "receipt message reads correctly");
}

// ---- Complimentary never locks ------------------------------------------------------------------
{
  const comp = { complimentary: true, trialEndsAt: "2020-01-01", renewalDueDate: "2020-01-01", autoLockOverdue: true };
  assert(!resolveAccess(comp, now).locked, "a complimentary account never auto-locks");
  assert(resolveAccess({ ...comp, suspended: true }, now).kind === "suspended", "…but a manual Suspend still works on it");
  assert(resolveAccess({ trialEndsAt: "2020-01-01" }, now).locked, "control: the same dates without the flag do lock");
}

// ---- MRR counts only accounts that actually pay ----------------------------------------------------
import { countsTowardMrr, monthlyRecurringRevenue } from "../lib/billing";
{
  const paidMonthly = { billingAmount: 4900, billingCycle: "monthly" as const, lastPaidAt: 1, renewalDueDate: "2026-11-01" };
  const paidAnnual = { billingAmount: 49000, billingCycle: "annual" as const, lastPaidAt: 1, renewalDueDate: "2027-10-01" };
  const trialWithListPrice = { billingAmount: 49000, billingCycle: "annual" as const, trialEndsAt: "2026-10-08" };
  const comp = { billingAmount: 8900, billingCycle: "monthly" as const, complimentary: true, renewalDueDate: "2026-11-01" };
  const bareDefault = { billingAmount: 4900, billingCycle: "monthly" as const }; // trial cleared, nothing ever paid
  const handSetUp = { billingAmount: 2900, billingCycle: "monthly" as const, renewalDueDate: "2026-10-15" }; // pre-existing customer
  const locked = { ...paidMonthly, autoLocked: true };
  const suspended = { ...paidMonthly, suspended: true };

  assert(countsTowardMrr(paidMonthly) && countsTowardMrr(paidAnnual), "paying accounts count");
  assert(!countsTowardMrr(trialWithListPrice), "a free trial carrying the plan's list price does NOT count (the bug this replaced)");
  // Isolates the trial rule itself: this account HAS a renewal date, so only the trial date keeps it out.
  const trialWithRenewal = { ...trialWithListPrice, renewalDueDate: "2026-10-08" };
  assert(!countsTowardMrr(trialWithRenewal), "a trial that also carries a renewal date still does not count (trial rules govern it)");
  assert(!countsTowardMrr(comp), "a complimentary account never counts, even with an amount");
  assert(!countsTowardMrr(bareDefault), "a default amount with no payment and no renewal date does not count");
  assert(countsTowardMrr(handSetUp), "a customer set up by hand with a renewal date counts");
  assert(!countsTowardMrr(locked) && !countsTowardMrr(suspended), "locked and suspended accounts do not count");
  assert(!countsTowardMrr({ ...paidMonthly, billingAmount: 0 }) && !countsTowardMrr({ ...paidMonthly, billingAmount: NaN }), "zero / NaN amounts do not count");

  const total = monthlyRecurringRevenue([paidMonthly, paidAnnual, trialWithListPrice, comp, bareDefault, handSetUp, locked, suspended]);
  assert(Math.round(total) === Math.round(4900 + 49000 / 12 + 2900), "MRR = 4,900 + 49,000/12 + 2,900 only (trials, complimentary, defaults, locked excluded)");
  assert(monthlyRecurringRevenue([]) === 0, "no accounts => 0");

  // The old formula, for contrast: it would have reported every one of the unpaid trials.
  const oldMrr = [paidMonthly, paidAnnual, trialWithListPrice, comp, bareDefault, handSetUp].reduce(
    (s, b) => s + (b.billingCycle === "annual" ? b.billingAmount / 12 : b.billingAmount), 0);
  assert(oldMrr > total, "control: the old sum-everything formula overstates the same book");
}

// ---- Duplicate-payment guard ----------------------------------------------------------------------
import { isLikelyDuplicate, DUPLICATE_WINDOW_MS } from "../lib/billing";
{
  const t0 = at("2026-10-05");
  const first = buildPayment({ suspended: false }, { plan: "Growth", cycle: "annual", amount: 49000, method: "bank_transfer", reference: "TXN-1" }, t0, "p1");
  if (!first.ok) throw new Error("setup");
  const hist = [first.payment];
  const same = (offsetMs: number, over: Partial<{ amount: number; method: "bank_transfer" | "cash" | "other"; reference: string; cycle: "monthly" | "annual" }> = {}) => {
    const r = buildPayment({ suspended: false }, { plan: "Growth", cycle: "annual", amount: 49000, method: "bank_transfer", reference: "TXN-1", ...over }, new Date(t0.getTime() + offsetMs), "p2");
    if (!r.ok) throw new Error("setup");
    return isLikelyDuplicate(hist, r.payment, new Date(t0.getTime() + offsetMs));
  };
  assert(same(5_000), "the same payment 5 s later is flagged as a duplicate");
  assert(same(DUPLICATE_WINDOW_MS), "…right up to the window edge");
  assert(!same(DUPLICATE_WINDOW_MS + 1), "…but not after the window");
  assert(!same(5_000, { amount: 4900 }), "a different amount is not a duplicate");
  assert(!same(5_000, { reference: "TXN-2" }), "a different bank reference is not a duplicate");
  assert(!same(5_000, { method: "cash" }), "a different method is not a duplicate");
  assert(!same(5_000, { cycle: "monthly" }), "a different cycle is not a duplicate");
  assert(!isLikelyDuplicate([], first.payment, t0), "empty history: never a duplicate");
  assert(!isLikelyDuplicate(hist, first.payment, new Date(t0.getTime() - 1000)), "a clock going backwards is not treated as a duplicate");
}
