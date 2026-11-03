// lib/form-webhooks.js - Typeform and Tally submissions, pure helpers: verify the signature, map the answers to an inbox lead.
// Each provider signs the raw body with a secret you set in its webhook settings. Nothing is sent to the person who submitted.
import { createHmac, timingSafeEqual } from 'node:crypto';

function sameDigest(got, expected) {
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Typeform: header "Typeform-Signature: sha256=<base64 HMAC-SHA256 of the raw body>". */
export function verifyTypeformSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return sameDigest(header.slice(7), expected);
}

/** Tally: header "Tally-Signature: <base64 HMAC-SHA256 of the raw body>". */
export function verifyTallySignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return sameDigest(header, expected);
}

const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || '', last_name: parts.length > 1 ? parts.slice(1).join(' ') : '' };
};

/** Typeform form_response -> inbox lead. Email from the email answer; name, company and phone from answers titled to match. */
export function leadFromTypeform(payload) {
  const fr = payload?.form_response;
  if (!fr) return null;
  const titles = new Map((fr.definition?.fields || []).map((f) => [f.id, String(f.title || '')]));
  let email = ''; let phone = ''; let name = ''; let company = '';
  for (const a of Array.isArray(fr.answers) ? fr.answers : []) {
    const title = titles.get(a?.field?.id) || '';
    if (a.type === 'email' && !email) email = String(a.email || '').trim();
    if (a.type === 'phone_number' && !phone) phone = String(a.phone_number || '').trim();
    if (a.type === 'text' || a.type === 'short_text') {
      const text = String(a.text || '').trim();
      if (!name && /name/i.test(title) && !/company|business/i.test(title)) name = text;
      if (!company && /company|business/i.test(title)) company = text;
    }
  }
  if (!email) return null;
  return { email, ...splitName(name), phone_primary: phone, business_name: company, campaign: `typeform ${fr.form_id || ''}`.trim() };
}

/** Tally FORM_RESPONSE -> inbox lead. Uses the field types (INPUT_EMAIL, INPUT_PHONE_NUMBER) and labels (name, company). */
export function leadFromTally(payload) {
  const fields = Array.isArray(payload?.data?.fields) ? payload.data.fields : [];
  let email = ''; let phone = ''; let name = ''; let company = '';
  for (const f of fields) {
    const label = String(f?.label || '');
    const value = typeof f?.value === 'string' ? f.value.trim() : '';
    if (f.type === 'INPUT_EMAIL' && !email) email = value;
    if (f.type === 'INPUT_PHONE_NUMBER' && !phone) phone = value;
    if (!name && /name/i.test(label) && !/company|business/i.test(label)) name = value;
    if (!company && /company|business/i.test(label)) company = value;
  }
  if (!email) return null;
  return { email, ...splitName(name), phone_primary: phone, business_name: company, campaign: `tally ${payload?.data?.formId || ''}`.trim() };
}
