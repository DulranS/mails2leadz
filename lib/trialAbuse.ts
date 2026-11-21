// Soft "does this look like a person or a troll?" scoring for the public trial form.
//
// Design rules — they are why this is a score and not a list of if-statements that reject:
//   • No single signal is enough to silently drop a submission. Each is something an honest visitor
//     can trip on their own (browser autofill is fast, an office shares one IP, someone pastes their
//     shop's website into the message). Only several together reach SHADOW_AT.
//   • Below FLAG_AT nothing changes. Between FLAG_AT and SHADOW_AT the visitor is treated normally
//     (they still have to confirm their inbox) but the lead card shows WHY it looks odd, so the
//     person working the queue decides with the evidence in front of them.
//   • At SHADOW_AT the submission is quietly discarded while the visitor is told "check your inbox"
//     exactly as everyone else is. A troll who gets an error learns which input tripped the wire and
//     adjusts; one who gets the normal success page has nothing to iterate on and, getting no email,
//     simply loses interest. That is the whole psychology: never reward the attempt, never explain it.
//   • Only soft, content-neutral signals. No word lists of insults (trivially evaded, and they'd
//     misfire on real names and real businesses), and nothing that assumes Latin script — names in
//     Sinhala or Tamil are ordinary here.
//
// Pure (no network, no clock) so scripts/verify-trial-abuse.ts can prove it offline.

export const FLAG_AT = 3;
export const SHADOW_AT = 6;

export interface SubmissionSignals {
  name: string;
  businessName?: string;
  message?: string;
  // Milliseconds between the form appearing and the visitor pressing submit (browser-measured).
  elapsedMs?: number;
  // True when the browser sent its timezone / screen / language alongside the form.
  hasClientHints: boolean;
  // How many DIFFERENT identities (see lib/emailPolicy.ts emailKey) this connection submitted in the
  // last 24h, including this one. Many mobile carriers put thousands of people behind one IP, so
  // this only ever adds score — it can never block on its own.
  distinctIdentitiesFromIp?: number;
}

export interface SubmissionVerdict {
  score: number;
  reasons: string[];
  verdict: "ok" | "flag" | "shadow";
}

// One link per whitespace-separated word that looks like one ("www.shop.lk", "https://x", "deals.xyz/a"),
// so "www.perera-hardware.com" counts once, not once for "www." and again for the domain.
const LINK_WORD = /^(https?:\/\/|www\.)|\b[a-z0-9-]{2,}\.(com|net|org|io|xyz|ru|top|click|link|site|online|shop)(\/|\?|#|$)/i;

// Whole-name matches only ("test", not "Tesla Motors"): obvious placeholder input.
const PLACEHOLDER_NAMES = new Set([
  "test", "testing", "tester", "asdf", "asdfg", "asdfgh", "qwerty", "admin", "fake", "abc", "abcd", "xyz",
  "none", "null", "undefined", "name", "your name", "john doe", "jane doe", "aaa", "aaaa", "zzz", "xxx",
]);

function letterCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

function linkCount(s: string): number {
  return s.split(/\s+/).filter((w) => w && LINK_WORD.test(w.replace(/[(),.;!?]+$/, ""))).length;
}

// A Latin-only word of 5+ letters with no vowel at all — keyboard mashing ("sdfghjk"). Words in
// other scripts are never judged this way.
function looksMashed(name: string): boolean {
  return name
    .split(/\s+/)
    .some((w) => /^[a-z]{5,}$/i.test(w) && !/[aeiouy]/i.test(w));
}

export function scoreTrialSubmission(s: SubmissionSignals): SubmissionVerdict {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  const name = s.name.trim();
  const business = (s.businessName ?? "").trim();
  const message = (s.message ?? "").trim();

  if (letterCount(name) < 2) add(3, "Name has fewer than two letters");
  else if (PLACEHOLDER_NAMES.has(name.toLowerCase())) add(3, "Name is a placeholder (e.g. “test”)");
  else {
    if (/(.)\1{3,}/u.test(name)) add(2, "Name repeats the same character");
    if (looksMashed(name)) add(2, "Name looks like keyboard mashing");
  }

  if (linkCount(name) > 0 || linkCount(business) > 0) add(3, "A web link in the name or business field");
  const msgLinks = linkCount(message);
  if (msgLinks >= 3) add(3, "Several web links in the message");
  else if (msgLinks > 0) add(2, "A web link in the message");

  if (!s.hasClientHints && s.elapsedMs === undefined) add(3, "Sent without any browser details (script-like)");
  if (typeof s.elapsedMs === "number" && s.elapsedMs < 1500) add(3, "Submitted within 1.5 seconds of the form appearing");

  const distinct = s.distinctIdentitiesFromIp ?? 0;
  if (distinct >= 6) add(4, `${distinct} different email identities from one connection in 24h`);
  else if (distinct >= 3) add(2, `${distinct} different email identities from one connection in 24h`);

  return { score, reasons, verdict: score >= SHADOW_AT ? "shadow" : score >= FLAG_AT ? "flag" : "ok" };
}
