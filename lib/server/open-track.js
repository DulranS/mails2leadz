// lib/server/open-track.js - open and click tracking for emails the app sends.
// An open is a 1x1 image signed to its record; a click is a redirect signed to its record and its target address. Both name one
// account and one record, so a link cannot be used to mark some other record, and a click can only go to the address it was made for.
// Opens are approximate: some mail apps load images automatically (privacy proxies), so an open can be recorded without a person reading it.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { signBookingToken, verifyBookingToken } from './booking-manage.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = () => process.env.PAY_SECRET || process.env.UNSUBSCRIBE_SECRET || process.env.WEBHOOK_SECRET || '';
const sign = (payload, k) => createHmac('sha256', k).update(payload).digest('base64url');

export function openPixelUrl(uid, id, base, kind = 'open') {
  const token = signBookingToken(kind, uid, id);
  if (!token || !/^https:\/\//i.test(base)) return '';
  return `${base}/api/track/open?t=${encodeURIComponent(token)}`;
}

/** A click link: the record, and the address it goes to. Refused without a key or for a non-web address. */
export function clickUrl(uid, recordId, target, base) {
  const k = key();
  if (!k || !/^https?:\/\//i.test(target) || target.length > 2000 || !/^https:\/\//i.test(base)) return '';
  const payload = Buffer.from(JSON.stringify({ k: 'click', u: String(uid), i: String(recordId), x: String(target) })).toString('base64url');
  return `${base}/api/track/click?t=${encodeURIComponent(`${payload}.${sign(payload, k)}`)}`;
}

/** @returns {{uid,id,url}|null} */
export function verifyClick(token) {
  try {
    const k = key();
    if (!k || typeof token !== 'string' || token.length > 3000) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, k), 'base64url');
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { k: kind, u, i, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (kind !== 'click' || !u || !i || !/^https?:\/\//i.test(x)) return null;
    return { uid: String(u), id: String(i), url: String(x) };
  } catch {
    return null;
  }
}

/** The message as HTML: escaped text, each web address made into a tracked link (its visible text is unchanged), and the open image. */
export function campaignHtml(text, { base = '', uid = '', recordId = '', pixel = '' } = {}) {
  const parts = String(text || '').split(/(https?:\/\/[^\s<>"']+)/g);
  const body = parts.map((seg, i) => {
    if (i % 2 === 0) return esc(seg);
    const url = seg.replace(/[).,;:!?]+$/, '');
    const tail = seg.slice(url.length);
    const href = url.includes('/api/unsubscribe') ? '' : clickUrl(uid, recordId, url, base);
    return `${href ? `<a href="${esc(href)}">${esc(url)}</a>` : esc(url)}${esc(tail)}`;
  }).join('').replace(/\r?\n/g, '<br>');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><p>${body}</p>${pixel ? `<img src="${esc(pixel)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}</body></html>`;
}

/** The tracked HTML for a quote or invoice email (the text is escaped; the image is the only thing added). */
export function trackedHtml(text, pixelUrl) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${paragraphs}${pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}</body></html>`;
}

export { verifyBookingToken };
