// Encrypts the owner's outside-service keys before they are stored (AES-256-GCM, authenticated: a tampered or wrongly keyed value
// fails, it never decrypts to garbage). Key: BALANCR_ENC_KEY, 32 random bytes as 64 hex characters (openssl rand -hex 32).
//
// Without the key, a key cannot be saved (the save route says so) and a stored encrypted key cannot be read, so that service shows
// as not set up. Keys saved before this change are plain text: they keep working, and they are encrypted the next time they are saved.
// Nothing here logs a value.
import crypto from "node:crypto";
import { SEALED_VALUE_PREFIX } from "./integrations";

export const SEALED_PREFIX = SEALED_VALUE_PREFIX;

export class SecretKeyMissingError extends Error {
  constructor() {
    super("Balancr's key-encryption setting isn't on the server yet (BALANCR_ENC_KEY). The operator needs to set it before keys can be saved.");
  }
}

/** The 32-byte key from its 64-hex form, or null when it is missing or malformed. */
export function loadSecretKey(raw: string | undefined): Buffer | null {
  const s = (raw ?? "").trim();
  return /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, "hex") : null;
}

export const isSealed = (v: unknown): v is string => typeof v === "string" && v.startsWith(SEALED_PREFIX);

export function sealValue(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${SEALED_PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

/** The plain value, or null when there is no key, the value is not sealed, or it does not open with this key. */
export function openValue(sealed: string, key: Buffer | null): string | null {
  if (!key || !isSealed(sealed)) return null;
  const parts = sealed.slice(SEALED_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The values the server uses: sealed values are opened (one that will not open is dropped), plain values are kept as they are. */
export function revealValues(values: Record<string, unknown> | undefined, key: Buffer | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (typeof v !== "string") continue;
    if (isSealed(v)) {
      const plain = openValue(v, key);
      if (plain !== null) out[k] = plain;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** revealValues with the key from the server's environment. Use this in every server route that reads a saved key. */
export function revealedValues(values: Record<string, unknown> | undefined): Record<string, string> {
  return revealValues(values, loadSecretKey(process.env.BALANCR_ENC_KEY));
}

/**
 * The stored form: each secret field sealed, plain fields unchanged. Throws SecretKeyMissingError when a secret needs sealing
 * and there is no key, so nothing is ever written in plain text by mistake.
 */
export function sealSecrets(values: Record<string, string>, secretFields: string[], key: Buffer | null): Record<string, string> {
  const out: Record<string, string> = { ...values };
  for (const field of secretFields) {
    const v = out[field];
    if (!v || isSealed(v)) continue;
    if (!key) throw new SecretKeyMissingError();
    out[field] = sealValue(v, key);
  }
  return out;
}

/** The last four characters shown to the owner for a saved secret. Short values show nothing. */
export function secretHint(plain: string): string {
  return plain.length <= 4 ? "" : plain.slice(-4);
}
