// lib/acceptance.js - typed-name acceptance of an agreement by link: a secret token, a fingerprint of the exact text, and a record that does not keep a raw IP. Pure.
// This is typed-name acceptance, not a qualified electronic signature (that needs a signing provider).
import { createHash, randomBytes } from 'node:crypto';

export const ACCEPT_DAYS = 14;

export function newAcceptToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: sha256(token) };
}
export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const documentHash = (text) => sha256(String(text).replace(/\r\n/g, '\n'));
export const ipHash = (ip) => sha256(`autoleads-ip:${String(ip || 'unknown')}`);

export function acceptanceState(doc, now = Date.now()) {
  if (!doc) return 'not_found';
  if (doc.acceptedAt) return 'accepted';
  if (Date.parse(doc.expiresAt) < now) return 'expired';
  return 'open';
}

/** The typed name must look like a real name: two or more words, letters only, sensible length. */
export function validName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 120) return null;
  if (!/^[\p{L}][\p{L}' .-]*$/u.test(n) || n.split(' ').length < 2) return null;
  return n;
}
