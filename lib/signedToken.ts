// Signed, expiring, single-purpose tokens for links we put in emails.
//
// Why this exists: Firebase's own "choose your password" link dies after about an hour and
// that cannot be configured. A customer who is activated in the morning and opens the email
// in the evening used to land on a dead link and had to work out "Forgot password" alone.
// The welcome email now carries a link of OURS (/api/start?t=<token>) that stays valid for
// days; opening it makes a fresh Firebase link on the spot and forwards the customer to it.
//
// What a token is: base64url(JSON {p: purpose, s: subject, e: expiry-seconds}) + "." +
// base64url(HMAC-SHA256 of that part). It proves WE issued it, for THIS purpose, for THIS
// subject, and that it has not expired. It carries nothing secret (the subject is an id the
// customer already has) and it grants nothing by itself: the route that accepts it still
// decides what a valid token is allowed to do (see app/api/start/route.ts).
//
// Pure + synchronous + no network, so scripts/verify-pipeline-automation.ts can prove the
// rules offline. `now` is always injectable for the same reason.

import { createHash, createHmac, timingSafeEqual } from "crypto";

// "quote": a customer link to answer one quote (subject "<businessId>/<estimateId>"). Grants only that answer; see app/api/quotes/public.
// "invoice": a customer link to one invoice (subject "<businessId>/<invoiceKey>"). Lets the customer see it and claim a payment only.
// "unsubscribe": the link at the foot of a marketing email (subject "<businessId>/<customerId>"). Grants one thing: switching that customer's offers off.
export type TokenPurpose = "start" | "verify-trial" | "quote" | "invoice" | "unsubscribe" | "portal" | "supplier";

interface Payload {
  p: TokenPurpose;
  s: string;
  e: number; // expiry, seconds since epoch
}

const MIN_SECRET_LENGTH = 16;

// The signing secret. LINK_SIGNING_SECRET if you set one (rotate it to kill every link ever
// sent); otherwise a key derived from the Firebase service-account private key, which is a
// long server-only secret this app already cannot run without — so links work out of the
// box with nothing extra to configure. Null only when neither exists (e.g. a bare dev
// checkout), in which case callers fall back to Firebase's own one-hour link.
export function linkSecret(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = (env.LINK_SIGNING_SECRET ?? "").trim();
  if (explicit.length >= MIN_SECRET_LENGTH) return explicit;
  const key = (env.FIREBASE_PRIVATE_KEY ?? "").trim();
  if (key.length >= 64) return createHash("sha256").update(`balancr-links:${key}`).digest("hex");
  return null;
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function mac(part: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(part).digest();
}

export function signToken(
  purpose: TokenPurpose,
  subject: string,
  ttlMs: number,
  opts: { secret?: string | null; now?: number } = {}
): string | null {
  const secret = opts.secret === undefined ? linkSecret() : opts.secret;
  if (!secret || !subject) return null;
  const now = opts.now ?? Date.now();
  const payload: Payload = { p: purpose, s: subject, e: Math.floor((now + ttlMs) / 1000) };
  const part = b64(JSON.stringify(payload));
  return `${part}.${b64(mac(part, secret))}`;
}

// Returns the subject when the token is genuine, for this purpose, and unexpired — otherwise
// null. Every failure looks the same to the caller on purpose.
export function verifyLinkToken(
  token: string | null | undefined,
  purpose: TokenPurpose,
  opts: { secret?: string | null; now?: number } = {}
): string | null {
  const secret = opts.secret === undefined ? linkSecret() : opts.secret;
  if (!secret || !token || token.length > 1000) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const part = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = mac(part, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Partial<Payload>;
    if (payload.p !== purpose || typeof payload.s !== "string" || !payload.s) return null;
    if (typeof payload.e !== "number" || (opts.now ?? Date.now()) / 1000 > payload.e) return null;
    return payload.s;
  } catch {
    return null;
  }
}
