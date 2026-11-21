// Which email addresses may request a trial, and what "the same person" means.
//
// Two jobs, both pure (no network, no clock) so scripts/verify-trial-abuse.ts can prove them offline:
//
//  1. THE RULE. By default only Gmail addresses may request a trial (TRIAL_EMAIL_DOMAINS widens or
//     replaces that list; "*" allows any domain, with the throwaway-mail block list still applying).
//     This is a cheap first filter, NOT proof that an address is real or belongs to the sender — a
//     well-formed Gmail address can still be someone else's, or unregistered. Ownership is proven
//     separately, by the confirmation link (lib/signedToken.ts purpose "verify-trial"), which is the
//     check that actually matters.
//
//  2. THE IDENTITY KEY. Gmail ignores dots and anything after "+" in the part before the @, so
//     john.doe@gmail.com, johndoe@gmail.com and johndoe+x1@gmail.com are ONE inbox. Without
//     collapsing them, one person gets unlimited "different" addresses and unlimited trials.
//     `emailKey` is that collapsed form; every limit, duplicate check and block in the trial
//     pipeline is keyed on it. The address the person TYPED is still what we email and what their
//     login is created with — Firebase Auth treats dotted variants as different logins, so
//     rewriting it would stop them signing in with what they remember typing.
import { autoActivateConfig, emailDomain, isBlockedEmailDomain } from "./autoActivate";

export const DEFAULT_TRIAL_EMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

// Gmail's own local-part rules: 6–30 characters (dots don't count), letters, digits and dots only,
// starting with a letter or digit. Addresses outside them cannot exist at Google, so they are
// refused before we spend an email on them.
const GMAIL_MIN_LOCAL = 6;
const GMAIL_MAX_LOCAL = 30;

export interface TrialEmailConfig {
  // Allowed domains; null means any domain (TRIAL_EMAIL_DOMAINS=*).
  allowedDomains: Set<string> | null;
  blockedDomains: Set<string>;
}

export function trialEmailConfig(env: Record<string, string | undefined> = process.env): TrialEmailConfig {
  const raw = (env.TRIAL_EMAIL_DOMAINS ?? "").trim().toLowerCase();
  const blockedDomains = autoActivateConfig(env).blockedDomains;
  if (raw === "*") return { allowedDomains: null, blockedDomains };
  const list = raw
    .split(",")
    .map((d) => d.trim().replace(/^@/, ""))
    .filter(Boolean);
  return { allowedDomains: new Set(list.length > 0 ? list : DEFAULT_TRIAL_EMAIL_DOMAINS), blockedDomains };
}

const isGmailDomain = (domain: string) => domain === "gmail.com" || domain === "googlemail.com";

// The "same inbox" form: lowercase; for Gmail, no dots, no +tag, and googlemail.com -> gmail.com.
// Other providers only get lowercased — we can't know their dot/plus rules, and guessing wrong
// would merge two different people.
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!isGmailDomain(domain)) return e;
  return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
}

export type TrialEmailVerdict =
  | { ok: true; email: string; emailKey: string }
  | { ok: false; reason: "format" | "domain" | "gmail_local" | "blocked"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkTrialEmail(input: string, config: TrialEmailConfig = trialEmailConfig()): TrialEmailVerdict {
  const email = input.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.split("@").length !== 2) {
    return { ok: false, reason: "format", message: "A valid email address is required." };
  }
  const domain = emailDomain(email);

  if (isBlockedEmailDomain(email, config.blockedDomains)) {
    return { ok: false, reason: "blocked", message: "Please use a regular personal or business email address." };
  }
  if (config.allowedDomains && !config.allowedDomains.has(domain)) {
    const gmailOnly = config.allowedDomains.size > 0 && [...config.allowedDomains].every(isGmailDomain);
    return {
      ok: false,
      reason: "domain",
      message: gmailOnly
        ? "Please use a Gmail address (like yourname@gmail.com) to request a trial."
        : `Please use an email address from one of: ${[...config.allowedDomains].join(", ")}.`,
    };
  }

  if (isGmailDomain(domain)) {
    const local = email.slice(0, email.lastIndexOf("@"));
    const base = local.split("+")[0];
    const valid =
      /^[a-z0-9.]+$/.test(base) && !base.startsWith(".") && !base.endsWith(".") && !base.includes("..");
    const collapsed = base.replace(/\./g, "");
    if (!valid || collapsed.length < GMAIL_MIN_LOCAL || collapsed.length > GMAIL_MAX_LOCAL || !/^[a-z0-9]/.test(collapsed)) {
      return { ok: false, reason: "gmail_local", message: "That doesn't look like a valid Gmail address — please check it." };
    }
  }

  return { ok: true, email, emailKey: canonicalEmail(email) };
}
