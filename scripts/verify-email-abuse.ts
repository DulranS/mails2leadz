// Empirical check that strangers cannot use our email to spam or phish, and that a failed send tells the
// admin WHY. Pure logic + source-structure checks — no network, no database.
//
// Run: npx tsx scripts/verify-email-abuse.ts
import { readFileSync } from "fs";
import { join } from "path";
import { safeFirstName } from "../lib/emailSafety";
import { nextBudget, dailyCap, DEFAULT_PUBLIC_EMAIL_CAPS } from "../lib/emailBudget";
import { explainEmailFailure } from "../lib/email";
import { firstNameOf } from "../lib/lifecycle";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// ---- names echoed into emails sent to unverified addresses ----
assert(safeFirstName("Dulran Samarasinghe") === "Dulran", "a normal name is greeted by first name");
assert(safeFirstName("නිමල් පෙරේරා") === "නිමල්", "Sinhala names are kept");
assert(safeFirstName("தமிழ் செல்வன்") === "தமிழ்", "Tamil names are kept");
assert(safeFirstName("O'Brien Smith") === "O'Brien", "apostrophes are kept");
assert(safeFirstName("Anne-Marie Silva") === "Anne-Marie", "hyphens are kept");
for (const bad of ["http://evil.example/win", "evil.com", "www.evil.lk", "a@b.co", "WIN$$$$", "click:here", "x".repeat(60), "", "   "]) {
  assert(safeFirstName(bad) === "there", `"${bad.slice(0, 24)}" is never echoed into an email`);
}
assert(firstNameOf("https://evil.example") === "there", "the lifecycle emails use the same safe name");
assert(firstNameOf(undefined) === "there", "a missing name falls back to 'there'");

// ---- global daily budget for public-triggered email ----
{
  const cap = 3;
  let doc = undefined as ReturnType<typeof nextBudget>["next"] | undefined;
  const got: boolean[] = [];
  for (let i = 0; i < 5; i++) { const v = nextBudget(doc, "confirm", "2026-10-03", cap); got.push(v.ok); doc = v.next; }
  assert(got.join() === "true,true,true,false,false", "the budget allows exactly `cap` emails a day, then refuses");
  const other = nextBudget(doc, "feedback", "2026-10-03", cap);
  assert(other.ok, "using up the confirmation budget does not use up the feedback budget");
  const tomorrow = nextBudget(doc, "confirm", "2026-10-04", cap);
  assert(tomorrow.ok && tomorrow.next.confirm === 1, "a new UTC day starts the count again");
}
assert(dailyCap("confirm", {}) === DEFAULT_PUBLIC_EMAIL_CAPS.confirm, "the default cap applies when nothing is configured");
assert(dailyCap("confirm", { PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY: "15" }) === 15, "the cap can be configured");
assert(dailyCap("confirm", { PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY: "-4" }) === DEFAULT_PUBLIC_EMAIL_CAPS.confirm, "a nonsense cap falls back to the default");
assert(dailyCap("confirm", { PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY: "999999" }) === 1000, "the cap has a ceiling");
assert(DEFAULT_PUBLIC_EMAIL_CAPS.confirm + DEFAULT_PUBLIC_EMAIL_CAPS.feedback < 100, "the default budgets fit inside Resend's free 100-a-day allowance");

// ---- the admin hears the real reason a send failed ----
assert(/sandbox/i.test(explainEmailFailure(new Error('Resend API error (403): {"message":"You can only send testing emails to your own email address (you@x.com)."}'))), "sandbox sender is named as the cause");
assert(/verif/i.test(explainEmailFailure(new Error('Resend API error (403): {"message":"The yourdomain.com domain is not verified."}'))), "an unverified domain is named as the cause");
assert(/RESEND_API_KEY/.test(explainEmailFailure(new Error("Resend API error (401): invalid"))), "a bad API key points at RESEND_API_KEY");
assert(/NEXT_PUBLIC_SUPPORT_EMAIL/.test(explainEmailFailure(new Error('Resend API error (422): {"message":"Invalid `reply_to` field"}'))), "a malformed reply-to points at NEXT_PUBLIC_SUPPORT_EMAIL");
assert(explainEmailFailure(new Error("fetch failed")).length > 20, "a network failure still gets a sentence");

// ---- wiring: every public route that can cause an email goes through the budget, and is capped per IP/day ----
const trial = read("app/api/trial-requests/route.ts");
assert((trial.match(/reservePublicEmail\("confirm"\)/g) ?? []).length >= 2, "both public trial emails (confirmation + already-registered) spend the global budget");
assert(/trial-confirm-day[\s\S]{0,400}sendAlreadyRegistered/.test(trial), "the already-registered email has the per-address DAILY limit too");
assert(trial.indexOf('reservePublicEmail("confirm")') < trial.indexOf("sendTrialConfirmation({"), "the budget is checked before the confirmation email is sent");
const fb = read("app/api/feedback/route.ts");
assert(/feedback-day/.test(fb), "feedback has a per-IP daily limit as well as the hourly one");
assert(fb.indexOf('reservePublicEmail("feedback")') > -1 && fb.indexOf('reservePublicEmail("feedback")') < fb.indexOf("await notifyAdminOfFeedback("), "the feedback nudge email spends the global budget first");
assert(/Gmail|emailPolicy|checkTrialEmail/.test(trial), "the Gmail-only policy is still enforced on the trial form");
const budget = read("lib/emailBudget.ts");
assert(/return false;\s*\}\s*\}/.test(budget), "the budget fails CLOSED when its counter can't be read");
for (const f of ["lib/email.ts", "lib/lifecycle.ts"]) {
  assert(!/split\(\/\\s\+\/\)\[0\] \|\| "there"/.test(read(f)), `${f} no longer echoes a raw first word`);
}

// ---- the set-password link survives an unauthorised "continue" domain ----
const reset = read("lib/resetLink.ts");
assert(/generatePasswordResetLink\(email, \{ url: loginUrl/.test(reset) && /generatePasswordResetLink\(email\);/.test(reset), "the link is retried without a continue URL if Firebase refuses it");
assert(/createPasswordSetLink\(/.test(read("app/api/start/route.ts")) && /createPasswordSetLink\(/.test(read("lib/provisionServer.ts")), "/api/start and provisioning both use the resilient helper");
assert(!/generatePasswordResetLink/.test(read("app/api/start/route.ts")), "/api/start no longer calls Firebase for a link directly");
assert(/sendPasswordResetEmail\(auth, data\.email\);/.test(read("lib/provisioning.ts")), "the browser fallback email also retries without a continue URL");
assert(/Reference \$\{ref\}/.test(read("app/api/start/route.ts")), "the error page carries a reference that matches the server log");

if (process.exitCode) console.error("\nSome email-abuse checks FAILED."); else console.log("\nALL CHECKS PASSED");
