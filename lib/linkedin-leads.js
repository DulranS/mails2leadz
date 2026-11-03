// lib/linkedin-leads.js - LinkedIn Lead Gen Form submissions, pure helpers. The request carries the key set in LinkedIn's lead
// webhook (checked in constant time), then the answers are mapped by question text. Verify the payload shape against
// LinkedIn's current lead-gen documentation before switching on.
import { timingSafeEqual } from 'node:crypto';

export function linkedinKeyOk(presented, secret) {
  if (!secret || typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Maps the form's answers to the inbox lead. Null when there is no email answer. */
export function leadFromLinkedin(payload) {
  const answers = Array.isArray(payload?.answers) ? payload.answers
    : Array.isArray(payload?.formResponse?.answers) ? payload.formResponse.answers
    : Array.isArray(payload?.responses) ? payload.responses : [];
  const find = (re) => {
    for (const a of answers) {
      const q = String(a?.question || a?.questionText || a?.name || '');
      if (re.test(q)) return String(a?.answer ?? a?.value ?? '').trim();
    }
    return '';
  };
  const email = find(/e-?mail/i);
  if (!email) return null;
  const full = (find(/^(full )?name$/i) || '').split(/\s+/).filter(Boolean);
  return {
    email,
    first_name: find(/first name/i) || full[0] || '',
    last_name: find(/last name/i) || (full.length > 1 ? full.slice(1).join(' ') : ''),
    phone_primary: find(/phone/i),
    business_name: find(/company/i),
    campaign: payload?.campaignId ? `linkedin-lead-form ${payload.campaignId}` : 'linkedin-lead-form',
  };
}
