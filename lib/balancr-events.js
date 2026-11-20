// lib/balancr-events.js - events Balancr sends to AutoLeads (pass 341). Pure: the signature check, the body check, and what each event does.
// Signed request: header X-Balancr-Timestamp (ms since epoch) and X-Balancr-Signature (hex HMAC-SHA256 of `${timestamp}.${rawBody}`,
// keyed with BALANCR_EVENT_SECRET). A timestamp more than five minutes off is refused, which limits replays.
import crypto from 'node:crypto';
import { buildDealWrite, dealDocId, isClosed } from './deal-utils.js';

export const MAX_SKEW_MS = 5 * 60 * 1000;
export const EVENT_TYPES = ['invoice.paid'];
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** The signature for a timestamp and a raw body, as the sender computes it. Used by the receiver and by tests. */
export function signEvent(timestamp, rawBody, secret) {
  return crypto.createHmac('sha256', String(secret)).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Checks the signature and the timestamp. Returns {ok:true} or {ok:false, status, reason}.
 * 503 when the secret is not set (not configured, never a crash). 401 for a missing, stale or wrong signature.
 */
export function verifyEvent({ timestamp, signature, rawBody = '', secret = '', now = Date.now() } = {}) {
  if (!String(secret || '').trim()) return { ok: false, status: 503, reason: 'not_configured' };
  const ts = String(timestamp ?? '').trim();
  if (!/^\d{1,16}$/.test(ts)) return { ok: false, status: 401, reason: 'bad_timestamp' };
  if (Math.abs(now - Number(ts)) > MAX_SKEW_MS) return { ok: false, status: 401, reason: 'stale_timestamp' };
  const sig = String(signature ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return { ok: false, status: 401, reason: 'bad_signature' };
  const expected = Buffer.from(signEvent(ts, rawBody, secret), 'hex');
  const got = Buffer.from(sig, 'hex');
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return { ok: false, status: 401, reason: 'bad_signature' };
  return { ok: true };
}

/** The event body, checked. Returns {ok:true, event} or {ok:false, error}. Unknown types are kept (they are ignored later, not rejected). */
export function parseEvent(raw) {
  let b;
  try { b = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, error: 'The body is not JSON.' }; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'The body must be an object.' };
  if (!ID_RE.test(String(b.id || ''))) return { ok: false, error: 'Event id is missing or not valid.' };
  if (!String(b.type || '').trim()) return { ok: false, error: 'Event type is missing.' };
  if (!String(b.businessId || '').trim() || !String(b.ownerUid || '').trim()) return { ok: false, error: 'businessId and ownerUid are required.' };
  if (!Number.isFinite(Date.parse(b.occurredAt || ''))) return { ok: false, error: 'occurredAt must be a date.' };
  const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : {};
  return { ok: true, event: { id: String(b.id), type: String(b.type), businessId: clip(b.businessId, 128), ownerUid: clip(b.ownerUid, 128), occurredAt: new Date(b.occurredAt).toISOString(), data } };
}

/** What AutoLeads does with an event type: record a payment, or ignore it (answered 200). */
export function eventAction(type) {
  return type === 'invoice.paid' ? 'record_payment' : 'ignored';
}

/** One line for the customer's timeline: the amount, the currency, and the invoice number when Balancr sent one. */
export function paymentSummary(data = {}) {
  const amount = Number(data.amount);
  const currency = clip(data.currency, 3).toUpperCase();
  const invoice = clip(data.invoiceNumber, 40);
  const money = Number.isFinite(amount) && amount > 0 ? `${currency ? `${currency} ` : ''}${amount.toFixed(2)}` : '';
  const head = money ? `Payment received: ${money}` : 'Payment received';
  return `${head}${invoice ? ` for invoice ${invoice}` : ''} (from Balancr)`;
}

/** The customer's email from the event, lower-cased, or '' when there is none that looks right (then nothing is matched). */
export function paymentEmail(data = {}) {
  const e = clip(data.customerEmail, 254).toLowerCase();
  return EMAIL_RE.test(e) ? e : '';
}

/**
 * What one invoice.paid event writes. Returns null when there is no customer to match.
 *  - activity: a note on the customer's timeline. Its id is fixed by the event id, so a retry writes the same row, never a second one.
 *  - dealWrite: the deal marked won, only when the deal is open. Null when there is no open deal.
 */
export function paymentWrites({ uid, event, existing = null, now = Date.now() }) {
  const email = paymentEmail(event?.data);
  if (!email) return null;
  const iso = new Date(now).toISOString();
  const activity = {
    id: `bal_${event.id}`.slice(0, 128),
    doc: { userId: String(uid), email, type: 'note', summary: paymentSummary(event.data).slice(0, 500), nextStep: '', at: event.occurredAt, createdAt: iso, source: 'balancr' },
  };
  const dealWrite = existing && !isClosed(existing.stage)
    ? buildDealWrite({ uid, email, stage: 'closed_won', existing, now: new Date(now) })
    : null;
  return { email, dealId: dealDocId(uid, email), activity, dealWrite };
}
