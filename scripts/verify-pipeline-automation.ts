// Empirical check for the second automation pass: durable sign-in links, the "never signed in"
// follow-ups, optional instant activation, and the wiring that keeps all three safe.
// Pure logic + source-structure checks — no network, no database.
//
// Run: npx tsx scripts/verify-pipeline-automation.ts

import { readFileSync } from "fs";
import { join } from "path";
import { signToken, verifyLinkToken, linkSecret } from "../lib/signedToken";
import {
  autoActivateConfig,
  autoActivateVerdict,
  isBlockedEmailDomain,
  DEFAULT_AUTO_ACTIVATE_MAX_PER_DAY,
} from "../lib/autoActivate";
import {
  activationNudgeDue,
  activationNudgeEmail,
  buildAdminDigest,
  neverSignedInDays,
  signInLinkEmail,
  welcomeEmail,
  type EmailCtx,
} from "../lib/lifecycle";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const SECRET = "test-secret-at-least-16-chars";
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

// ---- signed links ------------------------------------------------------------------------
const tok = signToken("start", "uid-123", 7 * DAY, { secret: SECRET, now: NOW })!;
assert(!!tok && tok.includes("."), "a token is issued when a secret exists");
assert(verifyLinkToken(tok, "start", { secret: SECRET, now: NOW + DAY }) === "uid-123", "a fresh token verifies and returns its subject");
assert(verifyLinkToken(tok, "start", { secret: SECRET, now: NOW + 6 * DAY + 3_600_000 }) === "uid-123", "still valid on day 6 (the point of a durable link)");
assert(verifyLinkToken(tok, "start", { secret: SECRET, now: NOW + 7 * DAY + 5_000 }) === null, "an expired token is refused");
assert(verifyLinkToken(tok, "start", { secret: "a-different-secret-entirely", now: NOW }) === null, "a token signed with another secret is refused");
const [part, sig] = tok.split(".");
const forgedPayload = Buffer.from(JSON.stringify({ p: "start", s: "someone-else", e: Math.floor((NOW + DAY) / 1000) })).toString("base64url");
assert(verifyLinkToken(`${forgedPayload}.${sig}`, "start", { secret: SECRET, now: NOW }) === null, "swapping the subject invalidates the signature");
assert(verifyLinkToken(`${part}.${sig.slice(0, -2)}AA`, "start", { secret: SECRET, now: NOW }) === null, "a tampered signature is refused");
assert(verifyLinkToken("", "start", { secret: SECRET }) === null && verifyLinkToken(null, "start", { secret: SECRET }) === null, "empty / missing tokens are refused");
assert(verifyLinkToken("garbage", "start", { secret: SECRET }) === null && verifyLinkToken("a.b", "start", { secret: SECRET }) === null, "malformed tokens are refused without throwing");
assert(verifyLinkToken("x".repeat(5000), "start", { secret: SECRET }) === null, "an oversized token is refused");
assert(signToken("start", "", DAY, { secret: SECRET }) === null, "no token for an empty subject");
assert(signToken("start", "uid", DAY, { secret: null }) === null && verifyLinkToken(tok, "start", { secret: null }) === null, "with no secret nothing is issued or accepted (callers fall back to Firebase's link)");
assert(linkSecret({}) === null, "no secret configured -> null, never a guessable default");
assert(linkSecret({ LINK_SIGNING_SECRET: "short" }) === null, "a too-short LINK_SIGNING_SECRET is not used");
assert(linkSecret({ LINK_SIGNING_SECRET: SECRET }) === SECRET, "an explicit LINK_SIGNING_SECRET is used");
const derived = linkSecret({ FIREBASE_PRIVATE_KEY: "-----BEGIN " + "PRIVATE KEY-----\n" + "A".repeat(200) });
assert(!!derived && derived.length === 64 && !derived.includes("BEGIN"), "without one, a key is derived from the service-account key (and never equals it)");

// ---- nudge schedule ----------------------------------------------------------------------
const activated = Date.UTC(2026, 9, 2, 8, 0, 0); // 2 Oct
const acct = (extra = {}) => ({ activatedAtMs: activated, hasSignedIn: false, ...extra });
const on = (iso: string) => activationNudgeDue(acct(), iso);
assert(on("2026-10-02") === null && on("2026-10-03") === null, "no nudge on day 0 or 1 — give them time to open the welcome email");
assert(on("2026-10-04")?.nth === 1, "first nudge on day 2");
assert(on("2026-10-07")?.nth === 1, "still the first nudge on day 5");
assert(on("2026-10-08")?.nth === 2, "second nudge from day 6");
assert(on("2026-10-16")?.nth === 2, "second nudge still possible on day 14");
assert(on("2026-10-17") === null, "nothing after day 14 — it is a human's job then");
assert(on("2026-10-04")!.key === "never_signed_in:1:2026-10-02" && on("2026-10-08")!.key === "never_signed_in:2:2026-10-02", "each nudge has its own dedupe key tied to the activation date");
assert(activationNudgeDue(acct({ hasSignedIn: true }), "2026-10-05") === null, "someone who has signed in is never nudged");
assert(activationNudgeDue(acct({ suspended: true }), "2026-10-05") === null, "a suspended account is never nudged");
assert(activationNudgeDue(acct({ complimentary: true }), "2026-10-05") === null, "a complimentary / demo account is never nudged");
assert(activationNudgeDue({ activatedAtMs: null, hasSignedIn: false }, "2026-10-05") === null, "unknown activation date (older accounts) is never nudged");
assert(activationNudgeDue({ activatedAtMs: Number.NaN, hasSignedIn: false }, "2026-10-05") === null, "a garbage activation date is never nudged");
assert(neverSignedInDays(acct(), "2026-10-03") === null, "digest does not list someone activated yesterday");
assert(neverSignedInDays(acct(), "2026-10-04") === 2, "digest lists them from day 2");
assert(neverSignedInDays(acct(), "2026-10-20") === 18, "digest keeps listing them after the nudges stop");
assert(neverSignedInDays(acct(), "2026-12-30") === null, "…but lets go after 60 days");

// ---- emails ------------------------------------------------------------------------------
const ctx: EmailCtx = { firstName: "Kamal", businessName: "Perera Hardware", loginUrl: "https://b.example/login", supportEmail: "help@b.example" };
const n1 = activationNudgeEmail({ ...ctx, startUrl: "https://b.example/api/start?t=abc", nth: 1, ageDays: 2, trialEndsAt: "2026-10-16" });
assert(n1.text.includes("https://b.example/api/start?t=abc") && n1.text.includes("2 days ago") && n1.text.includes("7 days"), "nudge carries the fresh link, the age and how long it lasts");
assert(n1.text.includes("16 October 2026"), "nudge reassures them about the trial end date");
const n2 = activationNudgeEmail({ ...ctx, startUrl: null, nth: 2, ageDays: 6 });
assert(n2.text.includes("Forgot password") && !n2.text.includes("api/start"), "nudge without a link falls back to Forgot password");
assert(n1.subject !== n2.subject, "the two nudges have different subjects");
const inv = signInLinkEmail({ ...ctx, startUrl: "https://b.example/api/start?t=abc" });
assert(inv.text.includes("api/start?t=abc") && inv.text.includes("— Balancr"), "the admin-sent link email carries the link and is signed");
const w = welcomeEmail({ ...ctx, setPasswordUrl: "https://b.example/api/start?t=abc", setPasswordLinkDays: 7, trialDays: 14, trialEndsAt: "2026-10-16" });
assert(w.text.includes("valid for 7 days") && !w.text.includes("about an hour"), "welcome describes the durable link honestly (7 days, not an hour)");
const wf = welcomeEmail({ ...ctx, setPasswordUrl: "https://auth.example/reset?oob=1", trialDays: 14, trialEndsAt: "2026-10-16" });
assert(wf.text.includes("about an hour") && wf.text.includes("Forgot password"), "welcome with Firebase's link still warns that it is short-lived");
assert(
  [n1, n2, inv, w].every((e) => !/undefined|NaN|\[object/.test(e.subject + e.text)),
  "no new template prints undefined / NaN / [object]"
);

// ---- digest ------------------------------------------------------------------------------
const dg = buildAdminDigest({
  todayIso: "2026-10-04",
  waitingLeads: [],
  attention: [],
  customerEmailsSent: [],
  neverSignedIn: [{ label: "Perera Hardware", days: 2 }],
  nudgesSent: [{ label: "Perera Hardware" }],
  adminUrl: "https://b.example/admin/new-business",
});
assert(!!dg && dg.subject.includes("1 never signed in") && dg.text.includes("Perera Hardware") && dg.text.includes("fresh link"), "digest reports never-signed-in customers and the nudges sent");
assert(buildAdminDigest({ todayIso: "2026-10-04", waitingLeads: [], attention: [], customerEmailsSent: [], adminUrl: "x" }) === null, "an empty day still produces no digest");
const dgOnlyNudge = buildAdminDigest({ todayIso: "2026-10-04", waitingLeads: [], attention: [], customerEmailsSent: [], nudgesSent: [{ label: "A" }], adminUrl: "x" });
assert(!!dgOnlyNudge && dgOnlyNudge.subject.includes("1 reminder sent"), "a day with only a nudge still gets a sensible subject");

// ---- instant activation guards -----------------------------------------------------------
const off = autoActivateConfig({});
assert(off.enabled === false, "instant activation is OFF by default");
assert(autoActivateConfig({ AUTO_ACTIVATE_TRIALS: "true" }).enabled && autoActivateConfig({ AUTO_ACTIVATE_TRIALS: " YES " }).enabled, "true / yes switch it on");
assert(!autoActivateConfig({ AUTO_ACTIVATE_TRIALS: "false" }).enabled && !autoActivateConfig({ AUTO_ACTIVATE_TRIALS: "maybe" }).enabled, "anything else leaves it off");
assert(autoActivateConfig({}).maxPerDay === DEFAULT_AUTO_ACTIVATE_MAX_PER_DAY, "default daily cap applies");
assert(autoActivateConfig({ AUTO_ACTIVATE_MAX_PER_DAY: "3" }).maxPerDay === 3, "daily cap is configurable");
assert(autoActivateConfig({ AUTO_ACTIVATE_MAX_PER_DAY: "999999" }).maxPerDay === 200, "daily cap has a hard ceiling");
assert(autoActivateConfig({ AUTO_ACTIVATE_MAX_PER_DAY: "-4" }).maxPerDay === DEFAULT_AUTO_ACTIVATE_MAX_PER_DAY, "a nonsense cap falls back to the default");
const on1 = autoActivateConfig({ AUTO_ACTIVATE_TRIALS: "true", BLOCKED_EMAIL_DOMAINS: "@spam.example, Junk.test" });
const verdict = (email: string, hasAccount = false, cfg = on1) => autoActivateVerdict({ email, hasAccount, config: cfg });
assert(verdict("kamal@perera.lk").ok === true, "a normal address passes");
assert(verdict("kamal@perera.lk", false, off).ok === false, "…but not while the switch is off");
assert(verdict("kamal@perera.lk", true).ok === false, "an address that already has a login is never touched");
assert(verdict("x@mailinator.com").ok === false && verdict("x@MAILINATOR.COM").ok === false, "throwaway providers are refused (case-insensitive)");
assert(verdict("x@a.b.mailinator.com").ok === false, "…including subdomains of them");
assert(verdict("x@spam.example").ok === false && verdict("x@junk.test").ok === false, "your own BLOCKED_EMAIL_DOMAINS are honoured (with or without @)");
assert(verdict("x@notmailinator.com").ok === true, "a lookalike domain is not wrongly blocked");
assert(isBlockedEmailDomain("no-at-sign", on1.blockedDomains) === true, "an address with no domain is refused");

// ---- wiring (source structure) -----------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const prov = read("lib/provisionServer.ts");
// The save -> activate -> notify -> acknowledge sequence moved out of the route into this module
// when the confirm-your-email step was added (the route now only holds the submission for
// confirmation); the guarantees below are about that sequence, so they read it here.
const trial = read("lib/trialCommitServer.ts");
const job = read("lib/dailyJob.ts");
const invite = read("app/api/admin/businesses/[businessId]/invite/route.ts");
const start = read("app/api/start/route.ts");
const rules = read("firestore.rules");
const page = read("app/admin/new-business/page.tsx");

assert(/autoActivateConfig\(\)/.test(prov) && prov.indexOf("config.enabled") < prov.indexOf("reserveAutoActivationSlot(config.maxPerDay)"), "auto-activation checks the switch before touching the cap");
assert(prov.indexOf("autoActivateVerdict(") < prov.indexOf("reserveAutoActivationSlot(config.maxPerDay)"), "…and runs every guard before reserving a slot");
assert(/catch \(err\) \{\s*console\.error\("\[auto-activate\] could not reserve a slot/.test(prov) && /return false;\s*\}\s*\}/.test(prov.slice(prov.indexOf("reserveAutoActivationSlot"))), "the daily cap FAILS CLOSED (an unreadable counter leaves the lead for a human)");
assert(/releaseAutoActivationSlot\(\)/.test(prov), "a slot is given back when the activation fails");
assert(/autoActivateRequest\(/.test(trial) && trial.indexOf("await commitTrialRequest(input)") < trial.indexOf("autoActivateRequest("), "the lead is saved BEFORE any automatic activation is attempted");
assert(/eligibleForAuto: prior\.status === "pending"/.test(trial), "a lead an admin already replied to is never auto-activated");
const autoFn = prov.slice(prov.indexOf("export async function autoActivateRequest"));
assert(/Promise<ProvisionOwnerResult \| null> \{\s*try \{/.test(autoFn) && !/\bthrow\b/.test(autoFn) && /unexpected error/.test(autoFn), "auto-activation is one big try/catch with no throw: it can never break the lead's submission");
assert(/return null;\s*\}\s*\n\}\s*$/.test(prov.trimEnd()) || /left for a human/.test(prov), "every failure path in auto-activation returns null (the manual queue)");
assert(/!activated && !\(await isRateLimited\("trial-ack"/.test(trial), "an auto-activated lead is not also sent the 'we got your request' email");
assert(/requireAdminPasscode\(/.test(invite) && invite.indexOf("ownerHasSignedIn") < invite.indexOf("buildSignInLink"), "the admin sign-in-link route is gated and refuses people who already signed in");
assert(start.indexOf("lastSignInTime") > -1 && start.indexOf("lastSignInTime") < start.indexOf("createPasswordSetLink("), "the public link refuses anyone who has already signed in, before minting a reset link");
assert(/Cache-Control/.test(start) && /no-referrer/.test(start), "the link endpoint is never cached and sends no referrer");
assert(/signedIn === true/.test(job) && /markSent\(businessId, SIGNED_IN_FLAG\)/.test(job), "the daily job remembers once an owner has signed in (no repeat lookups)");
assert(/emailedToday/.test(job) && /!emailedToday/.test(job), "a customer never gets two automatic emails on one morning");
assert(/status === "sent"\) await markSent\(businessId, nudge\.key\)/.test(job), "a nudge is remembered only when really delivered");
assert(!/suspended: true|\.delete\(|FieldValue/.test(job), "the daily job still never suspends, deletes or edits an account");
assert(!/match \/platform/.test(rules) && !/autoActivate/.test(rules), "no client rule opens the server-only counter docs");
assert(/readSession\(\)/.test(page) && /SESSION_IDLE_MS/.test(page) && /sessionStorage/.test(page) && !/localStorage/.test(page.slice(page.indexOf("const SESSION_KEY"), page.indexOf("interface LockState"))), "the admin session lives in sessionStorage with an idle timeout (never localStorage)");
assert(/\/api\/admin\/verify/.test(page.slice(page.indexOf("const saved = readSession()"), page.indexOf("function lockNow"))), "a restored session is re-verified with the server");

if (process.exitCode !== 1) console.log("\nAll pipeline-automation checks passed.");
