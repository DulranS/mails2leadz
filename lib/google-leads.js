// lib/google-leads.js - Google Ads lead form extensions, pure helpers. Google POSTs each submission as JSON containing the
// shared key you set in the lead form's webhook settings (google_key), and the answers as user_column_data.
import { timingSafeEqual } from 'node:crypto';

export function googleKeyOk(payload, secret) {
  if (!secret || typeof payload?.google_key !== 'string') return false;
  const a = Buffer.from(payload.google_key);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Maps Google's standard question columns to the inbox lead. Null when there is no email. */
export function leadFromGoogle(payload) {
  const cols = {};
  for (const c of Array.isArray(payload?.user_column_data) ? payload.user_column_data : []) {
    const k = String(c?.column_id || '').toUpperCase();
    if (k) cols[k] = String(c.string_value || '').trim();
  }
  const email = cols.EMAIL || '';
  if (!email) return null;
  const full = (cols.FULL_NAME || '').split(/\s+/).filter(Boolean);
  return {
    email,
    first_name: cols.FIRST_NAME || full[0] || '',
    last_name: cols.LAST_NAME || (full.length > 1 ? full.slice(1).join(' ') : ''),
    phone_primary: cols.PHONE_NUMBER || '',
    business_name: cols.COMPANY_NAME || '',
    campaign: payload?.campaign_id ? `google-lead-form ${payload.campaign_id}` : 'google-lead-form',
  };
}
