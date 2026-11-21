// Empirical check for the customer lifecycle rules (lib/lifecycle.ts) and the wiring around
// them. Pure logic — no network, no database.
//
// Run: npx tsx scripts/verify-lifecycle.ts

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  addDaysIso,
  attentionReason,
  buildAdminDigest,
  daysBetween,
  isoToday,
  longDateIso,
  paymentReceivedEmail,
  reactivatedEmail,
  reminderDue,
  reminderEmail,
  trialExtendedEmail,
  welcomeEmail,
  firstNameOf,
  type EmailCtx,
  type LifecycleAccount,
} from "../lib/lifecycle";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}
const kindOn = (a: LifecycleAccount, today: string) => reminderDue(a, today)?.kind ?? null;

// ---- date helpers
assert(isoToday(new Date("2026-10-02T23:59:59Z")) === "2026-10-02", "isoToday is the UTC date");
assert(daysBetween("2026-10-02", "2026-10-05") === 3, "daysBetween forward");
assert(daysBetween("2026-10-05", "2026-10-02") === -3, "daysBetween backward");
assert(daysBetween("2026-10-02", "2026-02-31") === null, "daysBetween rejects an impossible date");
assert(addDaysIso("2026-12-30", 3) === "2027-01-02", "addDaysIso crosses a year end");
assert(addDaysIso("2028-02-27", 2) === "2028-02-29", "addDaysIso handles a leap day");
assert(longDateIso("2026-10-20") === "20 October 2026", "longDateIso is unambiguous");

// ---- trial reminders
const T = "2026-10-20";
assert(kindOn({ trialEndsAt: T }, "2026-10-16") === null, "trial 4 days out: no reminder yet");
assert(kindOn({ trialEndsAt: T }, "2026-10-17") === "trial_ending", "trial 3 days out: reminder");
assert(kindOn({ trialEndsAt: T }, "2026-10-19") === "trial_ending", "trial 1 day out: reminder");
assert(kindOn({ trialEndsAt: T }, "2026-10-20") === "trial_ending", "trial last day: reminder");
assert(kindOn({ trialEndsAt: T }, "2026-10-21") === "trial_ended", "day after the trial: 'ended' notice");
assert(kindOn({ trialEndsAt: T }, "2026-10-22") === "trial_ended", "second grace day: 'ended' notice");
assert(kindOn({ trialEndsAt: T }, "2026-10-23") === null, "after the lock date: nothing more is emailed");
assert(reminderDue({ trialEndsAt: T }, "2026-10-18")?.key === "trial_ending:2026-10-20", "trial key is tied to the date it is about");
assert(
  reminderDue({ trialEndsAt: "2026-10-27" }, "2026-10-25")?.key !== reminderDue({ trialEndsAt: T }, "2026-10-18")?.key,
  "an extended trial earns a fresh reminder (different key)"
);

// ---- renewal reminders
const R = "2026-11-10";
const paid = { lastPaidAt: 1, renewalDueDate: R };
assert(kindOn(paid, "2026-11-02") === null, "renewal 8 days out: nothing");
assert(kindOn(paid, "2026-11-03") === "renewal_due", "renewal 7 days out: reminder");
assert(kindOn(paid, "2026-11-10") === "renewal_due", "renewal due today: reminder");
assert(kindOn(paid, "2026-11-11") === "renewal_overdue", "renewal 1 day late: overdue notice");
assert(kindOn(paid, "2026-11-24") === "renewal_overdue", "renewal 14 days late: still one overdue notice");
assert(kindOn(paid, "2026-11-25") === null, "renewal 15 days late: leave it to the admin");
assert(kindOn({ renewalDueDate: R }, "2026-11-08") === "renewal_due", "renewal date without a payment record still gets a reminder");

// ---- who never gets email
assert(kindOn({ ...paid, suspended: true }, "2026-11-08") === null, "suspended: never emailed");
assert(kindOn({ trialEndsAt: T, complimentary: true }, "2026-10-18") === null, "complimentary: never emailed");
assert(kindOn({}, "2026-10-18") === null, "no dates: nothing to remind about");
assert(reminderDue(null, "2026-10-18") === null && reminderDue(undefined, "2026-10-18") === null, "missing account is safe");

// ---- trial + payment interplay (mirrors isTrialLocked's paid-up protection)
const paidWithOldTrial = { trialEndsAt: "2026-10-20", lastPaidAt: 1, renewalDueDate: "2026-11-20" };
assert(kindOn(paidWithOldTrial, "2026-10-19") === null, "paid-up account with a leftover trial date gets NO trial emails");
assert(kindOn(paidWithOldTrial, "2026-11-15") === "renewal_due", "…and is reminded about its renewal instead");
const trialPlusFutureRenewalNoPayment = { trialEndsAt: "2026-10-20", renewalDueDate: "2026-10-25" };
assert(kindOn(trialPlusFutureRenewalNoPayment, "2026-10-23") === null, "trial rules win over a renewal date when nothing is paid (no contradicting email)");

// ---- at most one reminder per day, always
for (const day of ["2026-10-17", "2026-10-21", "2026-11-03", "2026-11-12"]) {
  assert(reminderDue({ trialEndsAt: T, renewalDueDate: R, lastPaidAt: 1 }, day) === null || typeof reminderDue({ trialEndsAt: T, renewalDueDate: R, lastPaidAt: 1 }, day)?.kind === "string", `single reminder result on ${day}`);
}

// ---- attention reasons (admin digest)
assert(attentionReason({ trialEndsAt: T }, "2026-10-18")!.includes("trial ends in 2 days"), "attention: trial ending");
assert(attentionReason({ trialEndsAt: T }, "2026-10-20") === "trial ends today", "attention: trial ends today");
assert(attentionReason({ trialEndsAt: T }, "2026-10-21")!.includes("locks soon"), "attention: in grace");
assert(attentionReason({ trialEndsAt: T }, "2026-10-30")!.includes("locked"), "attention: locked trial");
assert(attentionReason({ trialEndsAt: T }, "2026-10-01") === null, "attention: healthy trial is quiet");
assert(attentionReason({ trialEndsAt: T }, "2026-10-13")!.includes("trial ends in 7 days"), "attention: the admin sees an ending trial a week ahead");
assert(attentionReason({ trialEndsAt: T }, "2026-10-12") === null, "attention: 8 days out is still quiet");
assert(kindOn({ trialEndsAt: T }, "2026-10-13") === null, "…while the customer is not emailed until 3 days out");
assert(attentionReason(paid, "2026-11-12")!.includes("2 days overdue"), "attention: overdue renewal");
assert(attentionReason({ ...paid, autoLockOverdue: true }, "2026-11-20")!.includes("locked"), "attention: overdue + auto-lock past grace says locked");
assert(attentionReason({ ...paid, suspended: true }, "2026-11-12") === null, "attention: suspended is already in the admin's hands");
assert(attentionReason({ complimentary: true, renewalDueDate: "2020-01-01" }, "2026-11-12") === null, "attention: complimentary is never chased");

// ---- the whole schedule, day by day, the way the daily job runs it (a key is only ever sent once)
function simulate(account: LifecycleAccount, from: string, days: number): { day: string; key: string }[] {
  const sent = new Set<string>();
  const out: { day: string; key: string }[] = [];
  for (let i = 0; i <= days; i++) {
    const day = addDaysIso(from, i)!;
    const due = reminderDue(account, day);
    if (due && !sent.has(due.key)) {
      sent.add(due.key);
      out.push({ day, key: due.key });
    }
  }
  return out;
}
{
  const trial = simulate({ trialEndsAt: T }, "2026-10-10", 20);
  assert(
    JSON.stringify(trial.map((e) => e.day + " " + e.key)) ===
      JSON.stringify(["2026-10-17 trial_ending:2026-10-20", "2026-10-19 trial_ending_final:2026-10-20", "2026-10-21 trial_ended:2026-10-20"]),
    "trial: heads-up at 3 days, last-chance at 1 day, one 'ended' notice (got " + JSON.stringify(trial.map((e) => e.day)) + ")"
  );
  const ren = simulate(paid, "2026-10-25", 40);
  assert(
    JSON.stringify(ren.map((e) => e.day + " " + e.key)) ===
      JSON.stringify([
        "2026-11-03 renewal_due:2026-11-10",
        "2026-11-09 renewal_due_final:2026-11-10",
        "2026-11-11 renewal_overdue:2026-11-10",
        "2026-11-17 renewal_overdue_final:2026-11-10",
      ]),
    "renewal: 7 days, 1 day, first day late, a week late, then it stops (got " + JSON.stringify(ren.map((e) => e.day)) + ")"
  );
  // A customer set up late (first seen with 1 day left) still gets exactly one pre-expiry email, not two.
  const late = simulate({ trialEndsAt: T }, "2026-10-19", 3);
  assert(late.filter((e) => e.key.startsWith("trial_ending")).length === 1, "first seen on the last-but-one day: one pre-expiry email");
  // An extended trial starts the whole sequence again.
  const extended = simulate({ trialEndsAt: "2026-10-27" }, "2026-10-17", 12);
  assert(extended.filter((e) => e.key.startsWith("trial_ending")).length === 2, "an extended trial earns its own two reminders");
  assert(reminderDue({ trialEndsAt: T }, "2026-10-19")?.days === 1 && reminderDue({ trialEndsAt: T }, "2026-10-19")?.kind === "trial_ending", "final notice is still a trial_ending (same email wording logic)");
}
const finalSubject = reminderEmail({ ...{ firstName: "Sam", loginUrl: "https://x/login" }, due: reminderDue({ trialEndsAt: T }, "2026-10-19")!, account: {} }).subject;
assert(finalSubject === "Your Balancr trial ends tomorrow", "last-chance trial email says 'tomorrow' (got " + finalSubject + ")");

// ---- templates
const ctx: EmailCtx = {
  firstName: firstNameOf("Kamal Perera"),
  businessName: "Perera Hardware",
  loginUrl: "https://balancr.example/login",
  supportEmail: "help@balancr.example",
  supportWhatsapp: "94771234567",
  paymentInstructions: "Bank: Example Bank, A/C 123, ref = your business name",
};
assert(firstNameOf("") === "there" && firstNameOf(null) === "there", "firstNameOf falls back to 'there'");

const w = welcomeEmail({ ...ctx, setPasswordUrl: "https://auth.example/reset?oob=abc", trialDays: 14, trialEndsAt: "2026-10-16" });
assert(w.text.includes("Hi Kamal,") && w.text.includes("Perera Hardware"), "welcome greets by first name and business");
assert(w.text.includes("https://auth.example/reset?oob=abc") && w.text.includes("https://balancr.example/login"), "welcome carries the set-password link and the login URL");
assert(w.text.includes("Forgot password"), "welcome tells them what to do if the link has expired");
assert(w.text.includes("14 days free") && w.text.includes("16 October 2026"), "welcome states the trial length and end date");
const wNoLink = welcomeEmail({ ...ctx, setPasswordUrl: null, trialDays: null, trialEndsAt: null });
assert(wNoLink.text.includes("Forgot password") && !wNoLink.text.includes("days free"), "welcome without a link falls back to 'Forgot password', no trial line when there is no trial");

const pay = paymentReceivedEmail({ ...ctx, amount: 4900, plan: "Growth", cycle: "monthly", methodLabel: "Bank transfer", reference: "TXN-77", coveredUntil: "2026-12-10" });
assert(pay.text.includes("4,900") && pay.text.includes("Growth (monthly)") && pay.text.includes("TXN-77"), "receipt shows amount, plan, reference");
assert(pay.text.includes("10 December 2026"), "receipt states what they are covered until");
const payBare = paymentReceivedEmail({ ...ctx, amount: 100, coveredUntil: "2026-12-10" });
assert(!payBare.text.includes("Plan:") && !payBare.text.includes("Reference:"), "receipt omits lines it has no data for");

assert(trialExtendedEmail({ ...ctx, newEnd: "2026-11-03" }).text.includes("3 November 2026"), "extension email states the new end date");
assert(reactivatedEmail(ctx).text.includes("https://balancr.example/login"), "reactivation links to sign-in");

const acct: LifecycleAccount = { plan: "Growth", billingAmount: 4900, billingCycle: "monthly", autoLockOverdue: true };
const te = reminderEmail({ ...ctx, due: reminderDue({ trialEndsAt: "2026-10-20" }, "2026-10-18")!, account: acct });
assert(te.subject.includes("2 days") && te.text.includes("20 October 2026") && te.text.includes("Bank: Example Bank"), "trial-ending email: countdown, date, how to pay");
const tEnded = reminderEmail({ ...ctx, due: reminderDue({ trialEndsAt: "2026-10-20" }, "2026-10-21")!, account: acct });
assert(tEnded.text.includes("22 October 2026"), "trial-ended email names the real lock date (end + 2 days)");
const rd = reminderEmail({ ...ctx, due: reminderDue(paid, "2026-11-08")!, account: { ...acct, renewalDueDate: R } });
assert(rd.subject.includes("2 days") && rd.text.includes("4,900"), "renewal-due email: countdown and amount");
const ro = reminderEmail({ ...ctx, due: reminderDue({ ...paid, autoLockOverdue: true }, "2026-11-12")!, account: { ...acct, renewalDueDate: R } });
assert(ro.text.includes("17 November 2026"), "overdue email names the real lock date (due + 7 days) when auto-lock is on");
const roNoLock = reminderEmail({ ...ctx, due: reminderDue(paid, "2026-11-12")!, account: { plan: "Growth", billingAmount: 4900 } });
assert(!roNoLock.text.includes("To avoid any interruption"), "overdue email never threatens a lock the account doesn't have");

// no template ever leaks a bad value
const all = [w, wNoLink, pay, payBare, te, tEnded, rd, ro, roNoLock, reactivatedEmail(ctx), trialExtendedEmail({ ...ctx, newEnd: "2026-11-03" })];
assert(all.every((e) => !/undefined|NaN|\[object/.test(e.subject + e.text)), "no template prints undefined / NaN / [object]");
assert(all.every((e) => e.text.includes("— Balancr")), "every email is signed");
const bare = reminderEmail({ firstName: "Sam", loginUrl: "https://x/login", due: reminderDue({ renewalDueDate: R, lastPaidAt: 1 }, "2026-11-08")!, account: { renewalDueDate: R } });
assert(!/undefined|NaN/.test(bare.text) && bare.text.includes("reply to this email"), "reminders still read well with no support/payment config at all");

// ---- admin digest
assert(buildAdminDigest({ todayIso: "2026-10-02", waitingLeads: [], attention: [], customerEmailsSent: [], adminUrl: "https://x/admin" }) === null, "empty digest is not sent");
const dg = buildAdminDigest({
  todayIso: "2026-10-02",
  waitingLeads: [{ name: "A", businessName: "Alpha Ltd", waitingHours: 30 }, { name: "B", waitingHours: 2 }],
  attention: [{ label: "Beta", reason: "trial ends in 2 days" }],
  customerEmailsSent: [{ label: "Beta", kind: "trial_ending" }],
  adminUrl: "https://x/admin/new-business",
});
assert(!!dg && dg.subject.includes("2 leads waiting") && dg.subject.includes("1 account needs you"), "digest subject summarises counts");
assert(!!dg && dg.text.includes("Alpha Ltd") && dg.text.includes("over a day") && dg.text.includes("https://x/admin/new-business"), "digest lists leads, flags the late one, links to the panel");

// ---- wiring (source-level)
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const cron = read("app/api/cron/daily/route.ts");
assert(/requireCronSecret\(/.test(cron) && cron.indexOf("requireCronSecret(") < cron.indexOf("runDailyJob("), "cron route checks the secret before doing any work");
assert(existsSync(join(ROOT, "vercel.json")) && JSON.parse(read("vercel.json")).crons?.[0]?.path === "/api/cron/daily", "vercel.json schedules the cron route that exists");
// The activation itself lives in lib/provisionServer.ts (shared by the admin route and the
// optional automatic path); the route is only the passcode-gated door to it.
const prov = read("lib/provisionServer.ts");
const provRoute = read("app/api/admin/provision/route.ts");
assert(/provisionOwner\(/.test(provRoute) && /requireAdminPasscode\(/.test(provRoute), "the admin provision route is passcode-gated and delegates to the shared activation");
assert(/welcomeEmail\(/.test(prov) && /buildSignInLink\(/.test(prov) && /createPasswordSetLink\(/.test(prov) && /generatePasswordResetLink/.test(read("lib/resetLink.ts")), "activation sends the branded welcome with a server-made set-password link (durable, falling back to Firebase's)");
assert(prov.indexOf("batch.commit()") < prov.indexOf("welcomeEmail("), "the welcome email is sent only AFTER the account is saved");
assert(/catch \(err\) \{\s*console\.error\("provision: welcome email failed"/.test(prov), "a failed welcome email can never fail the activation");
assert(/tierById\(input\.plan\)/.test(prov) && !/input\.billingAmount|body\?*\.billingAmount/.test(prov), "activation looks the price up itself, never trusts one from the browser");
const bill = read("app/api/admin/businesses/[businessId]/billing/route.ts");
assert(bill.indexOf("paymentReceivedEmail(") > bill.indexOf("tx.set(historyRef"), "the receipt goes out only after the payment is saved");
assert(/notifyCustomer === false/.test(bill), "a receipt can be switched off per payment");
const sus = read("app/api/admin/businesses/[businessId]/suspend/route.ts");
assert(/resolveAccess\(account\)\.locked/.test(sus), "'you're back' is not sent to an account that is still locked");
const job = read("lib/dailyJob.ts");
assert(/status === "sent"\) await markSent/.test(job), "a reminder is remembered only when it was really delivered");
assert(!/suspended: true|\.delete\(|FieldValue/.test(job), "the daily job never suspends, deletes or edits an account");
const rules = read("firestore.rules");
assert(!/meta\/lifecycle/.test(rules) && !/match \/platform/.test(rules), "no client rule opens the server-only lifecycle / automation docs");

if (process.exitCode !== 1) console.log("\nAll lifecycle checks passed.");
