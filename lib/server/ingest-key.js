// lib/server/ingest-key.js - the secret that lets the lead autopilot (a script on the owner's computer) drop leads
// into that owner's inbox. Format "<uid>.<secret>". Only a SHA-256 hash of the secret is stored.
import crypto from 'node:crypto';

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const SECRET_RE = /^[a-f0-9]{48}$/;

export const hashSecret = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex');

export function generateIngestKey(uid) {
  const secret = crypto.randomBytes(24).toString('hex');
  return { key: `${uid}.${secret}`, hash: hashSecret(secret), last4: secret.slice(-4) };
}

/** "Bearer uid.secret" (or just "uid.secret") -> { uid, secret } or null. */
export function parseIngestKey(header) {
  const raw = String(header || '').replace(/^Bearer\s+/i, '').trim();
  const i = raw.lastIndexOf('.');
  if (i < 1) return null;
  const uid = raw.slice(0, i);
  const secret = raw.slice(i + 1);
  return UID_RE.test(uid) && SECRET_RE.test(secret) ? { uid, secret } : null;
}

export function verifySecret(storedHash, secret) {
  const a = Buffer.from(String(storedHash || ''), 'utf8');
  const b = Buffer.from(hashSecret(secret), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Document id for one lead in one owner's inbox: stable, so pushing the same lead twice never duplicates it. */
export const inboxDocId = (uid, key) => `${uid}_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 24)}`;
