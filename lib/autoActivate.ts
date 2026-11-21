// Rules for the OPTIONAL "activate trial requests automatically" switch.
//
// Off by default, on purpose. The app has no public sign-up (see app/login/page.tsx and the
// header of app/admin/new-business/page.tsx): every business is created by whoever runs the
// product, because a trial account can spend real AI-assistant money and an open door invites
// junk accounts and unsolicited emails to other people's inboxes. Switching this on is a
// business decision — "I'd rather give every genuine-looking lead instant access than vet
// them" — so it needs AUTO_ACTIVATE_TRIALS=true, and even then it only fires when ALL of the
// guards below pass. Anything it declines simply lands in the normal Trial requests queue for
// a human, exactly as if the switch were off.
//
// What makes it safer than it sounds:
//   • The account can only be entered through the link emailed to the address that was typed
//     in, so a stranger who types someone else's address gets nothing but that person's inbox
//     receiving one welcome email (and the per-IP, per-address and daily limits cap even that).
//   • A hard daily cap (default 10) stops a script from creating accounts in bulk.
//   • Throwaway-mail domains are refused.
//   • An address that already has a login is never touched.
//
// Pure (no network, no clock) so scripts/verify-pipeline-automation.ts can prove it offline.

export const DEFAULT_AUTO_ACTIVATE_MAX_PER_DAY = 10;
const MAX_PER_DAY_CEILING = 200;

// Disposable / throwaway inbox providers. Not exhaustive — nothing can be — but these are the
// ones a casual abuser reaches for. Add your own with BLOCKED_EMAIL_DOMAINS (comma-separated).
const DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "yopmail.com",
  "yopmail.net",
  "trashmail.com",
  "trashmail.net",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "emailondeck.com",
  "burnermail.io",
  "spam4.me",
  "mytemp.email",
  "tmpmail.org",
  "tmpmail.net",
  "discard.email",
  "moakt.com",
  "inboxkitten.com",
];

export interface AutoActivateConfig {
  enabled: boolean;
  maxPerDay: number;
  blockedDomains: Set<string>;
}

export function autoActivateConfig(env: Record<string, string | undefined> = process.env): AutoActivateConfig {
  const flag = (env.AUTO_ACTIVATE_TRIALS ?? "").trim().toLowerCase();
  const enabled = flag === "true" || flag === "1" || flag === "yes" || flag === "on";
  const rawMax = Number.parseInt((env.AUTO_ACTIVATE_MAX_PER_DAY ?? "").trim(), 10);
  const maxPerDay =
    Number.isFinite(rawMax) && rawMax > 0 ? Math.min(MAX_PER_DAY_CEILING, rawMax) : DEFAULT_AUTO_ACTIVATE_MAX_PER_DAY;
  const extra = (env.BLOCKED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return { enabled, maxPerDay, blockedDomains: new Set([...DISPOSABLE_DOMAINS, ...extra]) };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

// True for a blocked domain or any subdomain of one (a.b.mailinator.com).
export function isBlockedEmailDomain(email: string, blocked: Set<string>): boolean {
  const domain = emailDomain(email);
  if (!domain) return true;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (blocked.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export type AutoActivateVerdict =
  | { ok: true }
  | { ok: false; reason: "disabled" | "blocked_domain" | "has_account" };

// The yes/no that does not need the database. The daily cap is checked separately, on the
// server, with an atomic counter (lib/provisionServer.ts → reserveAutoActivationSlot).
export function autoActivateVerdict(input: {
  email: string;
  hasAccount: boolean;
  config: AutoActivateConfig;
}): AutoActivateVerdict {
  if (!input.config.enabled) return { ok: false, reason: "disabled" };
  if (input.hasAccount) return { ok: false, reason: "has_account" };
  if (isBlockedEmailDomain(input.email, input.config.blockedDomains)) return { ok: false, reason: "blocked_domain" };
  return { ok: true };
}
