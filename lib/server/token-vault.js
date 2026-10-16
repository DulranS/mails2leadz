// lib/server/token-vault.js - encrypts a secret (here: a Gmail refresh token) before it is stored, and signs short-lived OAuth state.
// AES-256-GCM (authenticated: a tampered or wrongly-keyed value fails loudly, it never decrypts to garbage). Key: TOKEN_ENC_KEY,
// 32 random bytes as 64 hex characters (generate one with: openssl rand -hex 32). Nothing here logs a secret.
import crypto from 'node:crypto';

export function loadKey(raw = process.env.TOKEN_ENC_KEY) {
  const s = String(raw || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  return null;
}
export const vaultConfigured = () => !!loadKey();

export function encryptSecret(plain, key = loadKey()) {
  if (!key) throw new Error('TOKEN_ENC_KEY is not set (64 hex characters).');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

/** @throws if the key is wrong or the value was changed */
export function decryptSecret(box, key = loadKey()) {
  if (!key) throw new Error('TOKEN_ENC_KEY is not set (64 hex characters).');
  if (!box || box.v !== 1) throw new Error('Unknown secret format.');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.ct, 'base64')), d.final()]).toString('utf8');
}

// ---- OAuth "state": ties the Google redirect back to the signed-in owner who started it, for 10 minutes, once-signed (HMAC) ----
const b64u = (b) => Buffer.from(b).toString('base64url');
const mac = (payload, key) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

export function signState(uid, { key = loadKey(), now = Date.now(), ttlMs = 600000 } = {}) {
  if (!key) throw new Error('TOKEN_ENC_KEY is not set (64 hex characters).');
  const payload = b64u(JSON.stringify({ u: uid, e: now + ttlMs, n: crypto.randomBytes(8).toString('hex') }));
  return `${payload}.${mac(payload, key)}`;
}

/** @returns {string|null} the uid, or null when the state is forged, altered or expired */
export function verifyState(state, { key = loadKey(), now = Date.now() } = {}) {
  try {
    if (!key) return null;
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return null;
    const expect = mac(payload, key);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof u === 'string' && u && Number(e) > now ? u : null;
  } catch { return null; }
}
