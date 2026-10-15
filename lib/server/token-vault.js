// lib/server/token-vault.js - encrypt a Google refresh token before it is stored (AES-256-GCM). Pure given the secret.
// The stored value is useless without GMAIL_TOKEN_KEY (a server environment variable), and it is bound to the owner's id, so a copied
// value cannot be made to work under another account. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
import crypto from 'node:crypto';

const b64 = (buf) => buf.toString('base64url');
const keyFrom = (secret) => crypto.createHash('sha256').update(`autoleads/gmail-token/v1|${String(secret)}`).digest();
export const MIN_SECRET_LENGTH = 24;

export const tokenKeyUsable = (secret = process.env.GMAIL_TOKEN_KEY) => String(secret || '').length >= MIN_SECRET_LENGTH;

export function encryptToken(plain, uid, secret = process.env.GMAIL_TOKEN_KEY) {
  if (!tokenKeyUsable(secret)) throw new Error('GMAIL_TOKEN_KEY is missing or too short');
  if (!plain || !uid) throw new Error('nothing to encrypt');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  cipher.setAAD(Buffer.from(String(uid)));
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(ct)}`;
}

/** @returns {string|null} null = wrong key, wrong owner, or damaged value (never throws on bad input) */
export function decryptToken(blob, uid, secret = process.env.GMAIL_TOKEN_KEY) {
  try {
    if (!tokenKeyUsable(secret)) return null;
    const [v, iv, tag, ct] = String(blob || '').split('.');
    if (v !== 'v1' || !iv || !tag || !ct) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(String(uid)));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
