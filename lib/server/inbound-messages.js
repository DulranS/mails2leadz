// lib/server/inbound-messages.js - replies that come IN by SMS or WhatsApp, as pure logic.
// Twilio signs every request with the account's auth token; a request whose signature does not match is refused.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildDealWrite } from '../deal-utils.js';

// Twilio's keywords. Matched on the whole message, so "please stop calling" is a reply, not an opt-out.
export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
export const isStopKeyword = (body) => STOP_WORDS.includes(String(body || '').trim().toUpperCase());

/** "whatsapp:+9477..." -> "+9477...". */
export const twilioNumber = (v) => String(v || '').replace(/^whatsapp:/i, '').trim();

/** Twilio's request signature: HMAC-SHA1 of the URL plus each form field (name then value, sorted by name), base64. */
export function twilioSignature(url, params, authToken) {
  const data = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function verifyTwilioSignature(url, params, authToken, signature) {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken));
  const given = Buffer.from(String(signature));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The fields we use from an inbound message, with the body kept to a sane length. */
export function parseInbound(params = {}) {
  return {
    from: twilioNumber(params.From),
    to: twilioNumber(params.To),
    channel: /^whatsapp:/i.test(String(params.From || '')) ? 'whatsapp' : 'sms',
    body: String(params.Body || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
    messageSid: String(params.MessageSid || '').slice(0, 64),
  };
}

/**
 * The new lead for a number the owner has attached to an email address: an inbound lead in the first stage, with the number kept
 * on the deal. Built with the CRM's own deal rules, so it is the same record the CRM makes everywhere else.
 */
export function inboundLeadWrite({ uid, email, phone, channel = 'sms', businessName = '', now = new Date() }) {
  const write = buildDealWrite({
    uid,
    email: String(email || '').trim().toLowerCase(),
    stage: 'new',
    businessName: String(businessName || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120),
    source: 'inbound',
    sourceDetail: channel === 'whatsapp' ? 'WhatsApp reply' : 'SMS reply',
    now,
  });
  return { ...write, phone: String(phone || '') };
}
