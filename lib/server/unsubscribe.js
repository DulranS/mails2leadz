// lib/server/unsubscribe.js - signed opt-out links for outbound email (pure: no database, fully testable).
//
// Every email the app sends carries (1) a visible one-click opt-out link and (2) RFC 8058 List-Unsubscribe headers.
// The link holds an HMAC-signed {customer id, recipient email}, so nobody can opt out (or probe) someone else's list.
// Mailbox providers (Gmail/Yahoo) increasingly require this for senders, and a spam complaint costs the customer's
// own Gmail account its sending reputation - an opt-out link turns a complaint into a quiet removal.
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.WEBHOOK_SECRET || '';
const baseUrl = () => String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export const normEmail = (e) => String(e || '').trim().toLowerCase();

export function signUnsubToken(uid, email, key = secret()) {
  if (!key || !uid || !email) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), e: normEmail(email) })).toString('base64url');
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** @returns {{uid:string,email:string}|null} null for anything forged, tampered with or malformed. */
export function verifyUnsubToken(token, key = secret()) {
  try {
    if (!key || typeof token !== 'string' || token.length > 2000) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = createHmac('sha256', key).update(payload).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return u && e ? { uid: String(u), email: normEmail(e) } : null;
  } catch {
    return null;
  }
}

/**
 * Everything needed to add an opt-out to one email, or null when it cannot work (no secret, no public https URL).
 * Returning null means "send exactly as before": the app never prints a link that would not function.
 */
export function buildOptOut(uid, email, { key = secret(), base = baseUrl(), production = process.env.NODE_ENV === 'production' } = {}) {
  const token = signUnsubToken(uid, email, key);
  base = String(base || '').trim().replace(/\/+$/, '');
  if (!token || !base) return null;
  if (production && !/^https:\/\//i.test(base)) return null;
  const pageUrl = `${base}/unsubscribe?t=${token}`;
  const oneClickUrl = `${base}/api/unsubscribe?t=${token}`;
  const line = "Not interested? Opt out here and you won't hear from me again:";
  return {
    pageUrl,
    oneClickUrl,
    textFooter: `\n\n--\n${line} ${pageUrl}`,
    htmlFooter: `<br><br>--<br>${line} <a href="${pageUrl}">Opt out</a>`,
    headers: `List-Unsubscribe: <${oneClickUrl}>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`,
  };
}

/** Append the plain-text footer once (never twice if the body already carries the link). */
export function withTextFooter(body, optOut) {
  if (!optOut) return body;
  const b = String(body ?? '');
  return b.includes(optOut.pageUrl) ? b : b.replace(/\s+$/, '') + optOut.textFooter;
}
