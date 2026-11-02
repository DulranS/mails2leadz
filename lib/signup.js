// lib/signup.js - the mailing list: consent, double opt-in, and the owner's exports (pure: no database).
//
// Rules: a person joins only by ticking a box that says what they agree to, and they are added only after they click
// the confirmation link in an email (double opt-in). Every row keeps when and what they agreed to. Anyone who unsubscribes
// (a suppression) is left out of every export. Exports carry no addresses for audiences: the audience file holds SHA-256
// hashes of the lower-cased address, which is what Meta and Google accept for custom audiences.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanEmail } from './erase-contact.js';
import { csvLine } from './accounting-export.js';

export const SIGNUP_LIMITS = Object.freeze({ listMax: 50000, perIpPerMinute: 10, confirmDays: 7, nameMax: 80, sourceMax: 40, exportMax: 10000 });
export const CONSENT_TEXT = 'Yes, send me emails from this business. I can unsubscribe at any time.';
const DOMAIN = 'signup|v1|';

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const key = (env = process.env) => env.SIGNUP_SECRET || env.PAY_SECRET || env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || '';
const sign = (payload, k) => createHmac('sha256', k).update(DOMAIN + payload).digest('base64url');

/** A stable id per account and address. It holds no address in plain text, so it can sit in a document name. */
export const contactId = (uid, email) => createHash('sha256').update(`${String(uid)}|${cleanEmail(email)}`).digest('hex');

/** The address is hashed for audiences: lower-cased, trimmed, then SHA-256 in hex. */
export const audienceHash = (email) => createHash('sha256').update(cleanEmail(email)).digest('hex');

/** Checks a sign-up. A filled-in hidden "website" field means a bot: it is refused quietly, with honeypot: true. */
export function sanitizeSignup(raw = {}) {
  if (clip(raw.website, 200)) return { ok: false, honeypot: true, error: '' };
  const email = cleanEmail(raw.email);
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  const consent = raw.consent === true || ['on', 'yes', 'true', '1'].includes(String(raw.consent).toLowerCase());
  if (!consent) return { ok: false, error: 'Tick the box to say you want to receive emails from us.' };
  return { ok: true, value: { email, name: clip(raw.name, SIGNUP_LIMITS.nameMax), source: clip(raw.source, SIGNUP_LIMITS.sourceMax) || 'website' } };
}

/** The record for someone who has asked to join and is waiting to confirm. */
export function newContact({ uid, email, name = '', source = 'website', now = new Date() }) {
  return { userId: String(uid), email: cleanEmail(email), name: clip(name, SIGNUP_LIMITS.nameMax), source: clip(source, SIGNUP_LIMITS.sourceMax) || 'website', status: 'pending', consentText: CONSENT_TEXT, consentAt: now.toISOString(), confirmedAt: null, statusAt: now.toISOString(), createdAt: now.toISOString() };
}

/** The lead magnet the owner sends each new subscriber after they confirm. Only https links are accepted. */
export function sanitizeMagnet(raw = {}) {
  const url = String(raw.url || '').trim();
  let u;
  try { u = new URL(url); } catch { return { ok: false, error: 'Enter the full web address of the download, starting with https://.' }; }
  if (u.protocol !== 'https:' || u.username || u.password || url.length > 500) return { ok: false, error: 'The download link must be an https address without a login in it.' };
  const title = String(raw.title || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'your download';
  return { ok: true, value: { magnetUrl: u.href, magnetTitle: title } };
}

export function confirmPatch(now = new Date()) {
  return { status: 'confirmed', confirmedAt: now.toISOString(), statusAt: now.toISOString() };
}

/** The link in the confirmation email. It names one account and one contact, and it expires. */
export function signConfirmToken(uid, cid, { now = Date.now(), ttlDays = SIGNUP_LIMITS.confirmDays, k = key() } = {}) {
  if (!k || !uid || !cid) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), c: String(cid), x: now + ttlDays * 86400000 })).toString('base64url');
  return `${payload}.${sign(payload, k)}`;
}

/** @returns {{uid:string, cid:string}|null} null for forged, altered, malformed or expired links. */
export function verifyConfirmToken(token, { now = Date.now(), k = key() } = {}) {
  try {
    if (!k || typeof token !== 'string' || token.length > 800) return null;
    const [payload, s, extra] = token.split('.');
    if (!payload || !s || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, k), 'base64url');
    const given = Buffer.from(s, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, c, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!u || !c || !(Number(x) > now)) return null;
    return { uid: String(u), cid: String(c) };
  } catch {
    return null;
  }
}

/** The owner's sign-up link key: "<uid>.<secret>". Only a hash of the secret is stored. */
export function newSignupKey(uid, { now = new Date() } = {}) {
  const secret = randomBytes(24).toString('base64url');
  return { raw: `${uid}.${secret}`, hash: createHash('sha256').update(secret).digest('hex'), createdAt: now.toISOString() };
}
export function parseSignupKey(raw) {
  const m = /^([A-Za-z0-9_-]{4,128})\.([A-Za-z0-9_-]{20,80})$/.exec(String(raw || '').trim());
  return m ? { uid: m[1], secret: m[2] } : null;
}
export function signupKeyMatches(storedHash, secret) {
  if (!storedHash || !secret) return false;
  const given = Buffer.from(createHash('sha256').update(secret).digest('hex'));
  const expected = Buffer.from(String(storedHash));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Who is on the list, by status. Unsubscribed people are counted apart. */
export function countsByStatus(contacts = []) {
  const out = { pending: 0, confirmed: 0, unsubscribed: 0, total: 0 };
  for (const c of contacts) {
    const s = c.status === 'confirmed' ? 'confirmed' : c.status === 'unsubscribed' ? 'unsubscribed' : 'pending';
    out[s]++;
    out.total++;
  }
  return out;
}

/** Rows an export may contain: the requested status, not unsubscribed or suppressed, and no more than the cap. */
export function exportRows(contacts = [], { status = 'confirmed', suppressed = new Set(), max = SIGNUP_LIMITS.exportMax } = {}) {
  const rows = [];
  for (const c of contacts) {
    if (rows.length >= max) break;
    if (c.status === 'unsubscribed') continue;
    if (status !== 'all' && c.status !== status) continue;
    if (!cleanEmail(c.email) || suppressed.has(cleanEmail(c.email))) continue;
    rows.push(c);
  }
  return rows;
}

/** A plain contacts file for the owner's own tools (Mailchimp, a CRM, a sheet): names and addresses. */
export function contactsCsv(rows = []) {
  const header = ['Name', 'Email', 'Source', 'Status', 'Agreed at', 'Confirmed at'];
  return [csvLine(header), ...rows.map((r) => csvLine([r.name || '', r.email, r.source || '', r.status, r.consentAt || '', r.confirmedAt || '']))].join('\r\n') + '\r\n';
}

/** The audience file for ad platforms: hashed addresses only. */
export function audienceCsv(rows = []) {
  return [csvLine(['email']), ...rows.map((r) => csvLine([audienceHash(r.email)]))].join('\r\n') + '\r\n';
}
