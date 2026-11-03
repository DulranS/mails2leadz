// lib/tiktok-leads.js - TikTok Lead Generation submissions, pure helpers. The request must carry the key you set in TikTok's
// lead webhook (compared in constant time), then the lead's contact details are read. Field names follow TikTok's lead payload
// as documented when this was written; check them against TikTok's current docs before switching on.
import { timingSafeEqual } from 'node:crypto';

export function tiktokKeyOk(presented, secret) {
  if (!secret || typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Finds the contact fields in the lead payload wherever TikTok puts them (user_info, lead_info or top level). */
export function leadFromTiktok(payload) {
  const info = payload?.user_info || payload?.lead_info || payload?.data || payload || {};
  const get = (...keys) => { for (const k of keys) if (info[k]) return String(info[k]).trim(); return ''; };
  const email = get('email', 'email_address');
  if (!email) return null;
  const full = get('name', 'full_name').split(/\s+/).filter(Boolean);
  return {
    email,
    first_name: get('first_name') || full[0] || '',
    last_name: get('last_name') || (full.length > 1 ? full.slice(1).join(' ') : ''),
    phone_primary: get('phone_number', 'phone'),
    business_name: get('company_name', 'company'),
    campaign: payload?.campaign_id ? `tiktok-lead-form ${payload.campaign_id}` : 'tiktok-lead-form',
  };
}
