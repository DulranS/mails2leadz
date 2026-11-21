// Empirical check for the trial-request abuse defences: the Gmail-only rule and Gmail identity
// collapsing (lib/emailPolicy.ts), the soft suspicion score (lib/trialAbuse.ts), the confirmation
// token, and the wiring that keeps all of it in order (source-structure checks). Pure logic — no
// network, no database.
//
// Run: npx tsx scripts/verify-trial-abuse.ts

import { readFileSync } from "fs";
import { join } from "path";
import { canonicalEmail, checkTrialEmail, trialEmailConfig } from "../lib/emailPolicy";
import { FLAG_AT, SHADOW_AT, scoreTrialSubmission, type SubmissionSignals } from "../lib/trialAbuse";
import { signToken, verifyLinkToken } from "../lib/signedToken";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const gmailOnly = trialEmailConfig({});
const okEmail = (e: string, cfg = gmailOnly) => checkTrialEmail(e, cfg);

// ---- the rule: Gmail only by default ---------------------------------------------------------
{
  const a = okEmail("John.Doe@gmail.com");
  assert(a.ok && a.email === "john.doe@gmail.com" && a.emailKey === "johndoe@gmail.com", "Gmail accepted; typed address kept lowercased, identity key collapsed");
  const b = okEmail("johndoe+promo7@gmail.com");
  assert(b.ok && b.emailKey === "johndoe@gmail.com", "+tag collapses into the same identity");
  const c = okEmail("johndoe@googlemail.com");
  assert(c.ok && c.emailKey === "johndoe@gmail.com", "googlemail.com is the same inbox as gmail.com");
  assert(
    a.ok && b.ok && c.ok && a.emailKey === b.emailKey && b.emailKey === c.emailKey,
    "dotted, +tagged and googlemail variants of one inbox share ONE key (one trial per person)"
  );
  const d = okEmail("johndoe1@gmail.com");
  assert(d.ok && d.emailKey !== "johndoe@gmail.com", "a genuinely different address is NOT merged");

  const y = okEmail("someone@yahoo.com");
  assert(!y.ok && y.reason === "domain" && /gmail/i.test(y.message), "non-Gmail is refused with a message that says to use Gmail");
  assert(!okEmail("someone@gmail.com.evil.com").ok, "lookalike domain gmail.com.evil.com refused");
  assert(!okEmail("someone@notgmail.com").ok, "lookalike domain notgmail.com refused");
  assert(!okEmail("someone@gmail.co").ok, "gmail.co is not Gmail");
  assert(!okEmail("not-an-email").ok && !okEmail("a@b@gmail.com").ok && !okEmail("").ok, "malformed addresses refused");
}

// ---- Gmail's own address rules: things that cannot exist are refused before we email them ------
{
  assert(!okEmail("a@gmail.com").ok, "1-character Gmail local part refused (Gmail needs 6+)");
  assert(!okEmail("ab.c@gmail.com").ok, "dots don't count toward Gmail's 6-character minimum");
  assert(okEmail("abc.def@gmail.com").ok, "6 characters once dots are ignored is fine");
  assert(!okEmail("john..doe@gmail.com").ok, "consecutive dots refused");
  assert(!okEmail(".johndoe@gmail.com").ok && !okEmail("johndoe.@gmail.com").ok, "leading / trailing dot refused");
  assert(!okEmail("john_doe@gmail.com").ok && !okEmail("john-doe@gmail.com").ok, "underscore / hyphen refused (not valid in Gmail)");
  assert(!okEmail(`${"a".repeat(31)}@gmail.com`).ok, "more than 30 characters refused");
  assert(okEmail(`${"a".repeat(30)}@gmail.com`).ok, "exactly 30 characters allowed");
}

// ---- throwaway domains stay blocked even when the list of domains is widened ---------------------
{
  const wide = trialEmailConfig({ TRIAL_EMAIL_DOMAINS: "*" });
  assert(okEmail("someone@yahoo.com", wide).ok, "TRIAL_EMAIL_DOMAINS=* allows other providers");
  assert(!okEmail("someone@mailinator.com", wide).ok, "…but the throwaway-mail block list still applies");
  const custom = trialEmailConfig({ TRIAL_EMAIL_DOMAINS: "gmail.com, @outlook.com" });
  const o = okEmail("A.B.Person@Outlook.com", custom);
  assert(o.ok && o.emailKey === "a.b.person@outlook.com", "other providers are only lowercased — their dot/plus rules are unknown, so no guessing");
  assert(!okEmail("someone@yahoo.com", custom).ok, "a custom list excludes everything not on it");
  assert(canonicalEmail("X.Y+z@Gmail.com") === "xy@gmail.com", "canonicalEmail collapses regardless of case");
  const extra = trialEmailConfig({ TRIAL_EMAIL_DOMAINS: "*", BLOCKED_EMAIL_DOMAINS: "troll.example" });
  assert(!okEmail("someone@troll.example", extra).ok, "BLOCKED_EMAIL_DOMAINS is honoured");
}

// ---- the suspicion score ---------------------------------------------------------------------
const human = (over: Partial<SubmissionSignals> = {}): SubmissionSignals => ({
  name: "Kamal Perera",
  hasClientHints: true,
  elapsedMs: 24_000,
  ...over,
});
{
  assert(scoreTrialSubmission(human()).verdict === "ok" && scoreTrialSubmission(human()).score === 0, "an ordinary visitor scores zero");
  assert(scoreTrialSubmission(human({ name: "කමල් පෙරේරා" })).verdict === "ok", "a Sinhala-script name is not penalised");
  assert(scoreTrialSubmission(human({ name: "கமல் பெரேரா" })).verdict === "ok", "a Tamil-script name is not penalised");
  assert(scoreTrialSubmission(human({ name: "Tesla Motors Ltd", businessName: "Perera Hardware" })).verdict === "ok", "ordinary business words aren't flagged");

  const fast = scoreTrialSubmission(human({ elapsedMs: 800 }));
  assert(fast.verdict === "flag" && fast.score < SHADOW_AT, "fast autofill alone is flagged for the admin, never discarded");
  const script = scoreTrialSubmission({ name: "Kamal Perera", hasClientHints: false });
  assert(script.verdict === "flag", "a script-like post with a plausible name is flagged, not silently dropped");
  assert(scoreTrialSubmission({ name: "asdf", hasClientHints: false }).verdict === "shadow", "script + placeholder name is discarded quietly");
  assert(scoreTrialSubmission({ name: "http://spam.xyz", hasClientHints: false }).verdict === "shadow", "script + link in the name field is discarded quietly");
  assert(scoreTrialSubmission({ name: "x", hasClientHints: false }).verdict === "shadow", "script + one-letter name is discarded quietly");

  assert(scoreTrialSubmission(human({ message: "my shop is on www.perera-hardware.com" })).verdict === "ok", "one link in the message is not enough to flag (people paste their website)");
  assert(scoreTrialSubmission(human({ message: "buy at www.cheap-deals.com or http://best-offers.net or fast-cash.xyz now" })).verdict === "flag", "several links in the message get flagged");
  assert(scoreTrialSubmission(human({ message: "see www.perera-hardware.com and www.perera-traders.lk" })).verdict === "ok", "one link per word: 'www.shop.com' is one link, not two");
  assert(scoreTrialSubmission(human({ message: "Visit https://perera.lk/shop, please." })).score === 2, "trailing punctuation doesn't hide or duplicate a link");
  assert(scoreTrialSubmission(human({ message: "We sell hardware. Call us on 0771234567." })).score === 0, "ordinary sentences with full stops are not links");
  assert(scoreTrialSubmission(human({ name: "Aaaaaaa Bbbbb" })).reasons.some((r) => /repeats/.test(r)), "repeated-character names are recognised");
  assert(scoreTrialSubmission(human({ name: "Sdfghjkl" })).reasons.some((r) => /mashing/.test(r)), "keyboard-mash names are recognised");
  assert(scoreTrialSubmission(human({ name: "Krmpl Prr" })).score >= 2, "…and only Latin-script words are judged that way");

  assert(scoreTrialSubmission(human({ distinctIdentitiesFromIp: 2 })).score === 0, "two identities from one connection costs nothing (families, offices)");
  assert(scoreTrialSubmission(human({ distinctIdentitiesFromIp: 3 })).score === 2, "three different identities from one connection adds a little");
  assert(scoreTrialSubmission(human({ distinctIdentitiesFromIp: 6 })).score === 4, "six adds more — but still below the discard line on its own");

  // The design rule that matters most: no ONE signal can discard a submission.
  const singles: Partial<SubmissionSignals>[] = [
    { name: "x" },
    { name: "test" },
    { name: "Aaaaaaaa" },
    { name: "Sdfghjkl" },
    { name: "spam.com" },
    { businessName: "buy.xyz" },
    { message: "www.cheap-deals.com best-offers.net fast-cash.xyz" },
    { hasClientHints: false, elapsedMs: undefined },
    { elapsedMs: 100 },
    { distinctIdentitiesFromIp: 40 },
  ];
  for (const s of singles) {
    const r = scoreTrialSubmission(human(s));
    assert(r.verdict !== "shadow", `a single signal never discards: ${JSON.stringify(s)} -> ${r.score}`);
  }
  assert(FLAG_AT < SHADOW_AT, "flagging starts before discarding does");
}

// ---- the confirmation token ------------------------------------------------------------------
{
  const secret = "unit-test-secret-0123456789abcdef";
  const now = 1_800_000_000_000;
  const t = signToken("verify-trial", "intake-123", 24 * 3_600_000, { secret, now });
  assert(!!t && verifyLinkToken(t, "verify-trial", { secret, now: now + 1000 }) === "intake-123", "a fresh confirmation token verifies to its intake id");
  assert(verifyLinkToken(t, "start", { secret, now: now + 1000 }) === null, "a confirmation token can NOT be used as a sign-in token");
  const s = signToken("start", "uid-1", 3_600_000, { secret, now });
  assert(verifyLinkToken(s, "verify-trial", { secret, now: now + 1000 }) === null, "a sign-in token can NOT confirm an email");
  assert(verifyLinkToken(t, "verify-trial", { secret, now: now + 25 * 3_600_000 }) === null, "a confirmation token expires after its 24 hours");
  assert(verifyLinkToken(t!.slice(0, -2) + "xx", "verify-trial", { secret, now }) === null, "a tampered token is refused");
  assert(verifyLinkToken(t, "verify-trial", { secret: "another-secret-0123456789abcdef", now }) === null, "a token signed with a different secret is refused");
}

// ---- wiring (source structure) ------------------------------------------------------------------
{
  const ROOT = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const route = read("app/api/trial-requests/route.ts");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function GET"));
  const order = [
    "body?.website",
    "checkTrialEmail(",
    'isRateLimited("trial-request"',
    "isIdentityBlocked(",
    "scoreTrialSubmission(",
    "identityHasAccount(",
    'isRateLimited("trial-confirm-10m"',
    "sendTrialConfirmation(",
  ];
  const at = order.map((needle) => post.indexOf(needle));
  assert(at.every((i) => i >= 0), "every layer is present in the public POST");
  assert(at.every((v, i) => i === 0 || v > at[i - 1]), "the layers run in the documented order (cheap and explicit first, email last)");

  assert(!/autoActivateRequest\(|notifyAdminOfTrialRequest\(/.test(post), "the form POST never activates or notifies the admin directly — only a confirmed address does");
  const quietReturns = (post.match(/return quiet\(\)/g) ?? []).length;
  assert(quietReturns >= 6, `the silent layers all return the one shared success response (${quietReturns} sites)`);
  assert(!/Response\.json\(\{ ok: true/.test(post.replace(/const quiet[^\n]*\n/, "")), "there is no second, distinguishable success shape");
  const statuses = [...post.matchAll(/status: (\d{3})/g)].map((m) => m[1]);
  assert(statuses.every((s) => ["400", "429", "500"].includes(s)), `the only errors a visitor can ever see are 400 / 429 / 500 (${[...new Set(statuses)].join(", ")})`);
  assert(post.includes("shadowRejected: true"), "discarded submissions are kept (for audit) but flagged, not queued");
  assert(!/collection\("trialRequests"\)\s*\.add/.test(post), "the form POST does not write to the real queue itself");

  const commit = read("lib/trialCommitServer.ts");
  assert(/eligibleForAuto && input\.emailVerified/.test(commit), "automatic activation requires a CONFIRMED address");

  const verify = read("app/api/trial-requests/verify/route.ts");
  assert(/runTransaction\(/.test(verify) && /tx\.delete\(ref\)/.test(verify), "the confirm step claims the submission atomically (no double lead on a double tap)");
  assert(/isIdentityBlocked\(/.test(verify) && /identityHasAccount\(/.test(verify), "the confirm step re-checks block / existing account instead of trusting a day-old link");
  assert(/emailVerified: true/.test(verify), "only the confirm step marks a request as email-verified");
  assert(!/provisionOwner\(/.test(verify), "the confirm step never creates accounts itself");

  const rules = read("firestore.rules");
  assert(!/trialIntake|trialBlocks|trialRequests/.test(rules.replace(/\/\/.*$/gm, "")), "no client access rule exists for the intake, block or request collections");

  const page = read("app/request-trial/RequestTrialForm.tsx");
  assert(/gmail/i.test(page) && /elapsedMs/.test(page), "the form tells visitors to use Gmail and reports fill-in time");

  const patch = read("app/api/trial-requests/[id]/route.ts");
  assert(/status === "dismissed" && body\?\.block === true/.test(patch), "blocking only happens as part of a dismissal");
  assert(/unblockIdentity\(/.test(patch), "reopening a request lifts the block");

  assert(/purgeExpiredIntake\(/.test(read("lib/dailyJob.ts")), "the daily job expires old unconfirmed submissions");
  assert(/trustedOrigin\(req\)/.test(post) && !/siteOrigin\(req\)\}\/verify-trial/.test(post), "confirmation links are built from a trusted origin, never the request's Origin header");
}

if (process.exitCode === 1) {
  console.error("\nSOME CHECKS FAILED");
} else {
  console.log("\nALL CHECKS PASSED");
}
