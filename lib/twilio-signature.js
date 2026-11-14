// lib/twilio-signature.js - checks that a request really came from Twilio (X-Twilio-Signature). Pure except for the crypto. Never throws.
import crypto from 'node:crypto';

/** Twilio's signature: HMAC-SHA1 of the URL plus each parameter name and value, sorted by name, keyed with the auth token. */
export function twilioSignature(url, params = {}, token = '') {
  const data = String(url) + Object.keys(params || {}).sort().map((k) => k + String(params[k] ?? '')).join('');
  return crypto.createHmac('sha1', String(token)).update(data, 'utf8').digest('base64');
}

export function validTwilioRequest(url, params, token, header) {
  if (!token || !header) return false;
  const expected = Buffer.from(twilioSignature(url, params, token));
  const given = Buffer.from(String(header));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
