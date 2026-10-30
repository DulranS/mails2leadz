// lib/quotes.js - the signed accept link for a quote (server only: it uses Node's crypto).
// The browser-safe logic (validation, states, emails, the board) is in lib/quote-core.js and re-exported here.
import { createHmac, timingSafeEqual } from 'node:crypto';

export * from './quote-core.js';

const secret = () => process.env.QUOTE_SECRET || process.env.UNSUBSCRIBE_SECRET || process.env.WEBHOOK_SECRET || '';
const baseUrl = () => String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const sign = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');

export function signQuoteToken(uid, id, key = secret()) {
  if (!key || !uid || !id) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), q: String(id) })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** @returns {{uid:string,id:string}|null} null for anything forged, altered or malformed. */
export function verifyQuoteToken(token, key = secret()) {
  try {
    if (!key || typeof token !== 'string' || token.length > 600) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, key), 'base64url');
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, q } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return u && q ? { uid: String(u), id: String(q) } : null;
  } catch {
    return null;
  }
}

/**
 * The link the customer opens. Null when it cannot work: no signing secret, or no public address
 * (https in production; http is allowed only outside production, for local testing).
 */
export function quoteLink(uid, id, { base = baseUrl(), key = secret(), production = process.env.NODE_ENV === 'production' } = {}) {
  const token = signQuoteToken(uid, id, key);
  if (!token) return null;
  const secure = /^https:\/\//i.test(base);
  const local = !production && /^http:\/\//i.test(base);
  if (!secure && !local) return null;
  return `${base}/api/quote?t=${encodeURIComponent(token)}`;
}
