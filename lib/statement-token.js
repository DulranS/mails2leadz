// lib/statement-token.js - the signed link a customer uses to open their statement (pure: no database).
// It names one account and one customer, and it expires, because a statement holds a customer's whole history.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STATEMENT_TTL_DAYS = 90;
const DOMAIN = 'stmt|v1|';
const key = (env = process.env) => env.STATEMENT_SECRET || env.PAY_SECRET || env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || '';
const sign = (payload, k) => createHmac('sha256', k).update(DOMAIN + payload).digest('base64url');

export function signStatementToken(uid, email, { now = Date.now(), ttlDays = STATEMENT_TTL_DAYS, k = key() } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!k || !uid || !e) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), e, x: now + ttlDays * 86400000 })).toString('base64url');
  return `${payload}.${sign(payload, k)}`;
}

/** @returns {{uid:string, email:string, expiresAt:number}|null} null for forged, altered, malformed or expired links. */
export function verifyStatementToken(token, { now = Date.now(), k = key() } = {}) {
  try {
    if (!k || typeof token !== 'string' || token.length > 800) return null;
    const [payload, s, extra] = token.split('.');
    if (!payload || !s || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, k), 'base64url');
    const given = Buffer.from(s, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!u || !e || !(Number(x) > now)) return null;
    return { uid: String(u), email: String(e), expiresAt: Number(x) };
  } catch {
    return null;
  }
}
