// lib/server/booking-manage.js - signed links for a booking: the customer's manage link, and the owner's calendar feed.
// A link names one kind of thing (a booking, or the calendar) and one account. It cannot be altered or reused for another kind.
import { createHmac, timingSafeEqual } from 'node:crypto';

const key = (env = process.env) => env.PAY_SECRET || env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || '';
const sign = (payload, k) => createHmac('sha256', k).update(payload).digest('base64url');
export const CHANGE_NOTICE_HOURS = 24;

export function signBookingToken(kind, uid, id, k = key()) {
  if (!k || !kind || !uid || !id) return null;
  const payload = Buffer.from(JSON.stringify({ k: String(kind), u: String(uid), i: String(id) })).toString('base64url');
  return `${payload}.${sign(payload, k)}`;
}

/** @returns {{uid:string,id:string}|null} null unless the link is genuine and was made for this kind of thing. */
export function verifyBookingToken(kind, token, k = key()) {
  try {
    if (!k || typeof token !== 'string' || token.length > 600) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, k), 'base64url');
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { k: got, u, i } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return got === kind && u && i ? { uid: String(u), id: String(i) } : null;
  } catch {
    return null;
  }
}

/** The customer may move or cancel only while the booking is still open, and not within the notice period before it. */
export function customerMayChange(booking, now = Date.now()) {
  if (!booking || !['requested', 'confirmed', 'awaiting_payment'].includes(booking.status)) return false;
  return Date.parse(booking.startIso) - now >= CHANGE_NOTICE_HOURS * 3600000;
}
