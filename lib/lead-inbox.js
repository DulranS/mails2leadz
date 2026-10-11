// lib/lead-inbox.js - leads that an outside worker (the lead autopilot) drops into the owner's inbox.
// Pure and isomorphic: the ingest route and the Inbox page use the same rules.
//
// Nothing here sends anything. Leads wait in the inbox until the owner loads them into the sender and presses Send.

export const INBOX_STATUS = { NEW: 'new', LOADED: 'loaded', DISMISSED: 'dismissed' };
export const MAX_BATCH = 300;

// Allowlist: field name -> max length. Anything else a client sends is ignored.
export const INBOX_FIELDS = {
  email: 120, business_name: 160, whatsapp_number: 40, first_name: 60, last_name: 80, lead_quality: 8, lead_quality_score: 6,
  place_id: 200, address: 300, website: 300, rating: 8, review_count: 8, category: 100, instagram: 200, twitter: 200,
  facebook: 200, youtube: 200, linkedin_company: 200, linkedin_ceo: 200, linkedin_founder: 200, contact_page_found: 4,
  social_media_score: 4, email_primary: 120, phone_primary: 40, contact_confidence: 10, best_contact_method: 60,
  decision_maker_found: 4, decision_maker_name: 100, decision_maker_title: 80, tech_stack_detected: 300,
  company_size_indicator: 10, all_emails: 400, contact_page_url: 300, campaign: 80,
};

const clip = (v, max) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (v) => String(v || '').replace(/\D/g, '');

/** @returns {{ ok: true, lead: object } | { ok: false, reason: string }} */
export function sanitizeLead(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid' };
  const lead = {};
  for (const [field, max] of Object.entries(INBOX_FIELDS)) lead[field] = clip(raw[field], max);

  lead.email = lead.email.toLowerCase();
  if (lead.email && !EMAIL_RE.test(lead.email)) lead.email = '';
  const phoneDigits = digits(lead.whatsapp_number);
  if (phoneDigits.length < 8 || phoneDigits.length > 15) lead.whatsapp_number = '';
  if (!lead.business_name) return { ok: false, reason: 'invalid' };
  if (!lead.email && !lead.whatsapp_number) return { ok: false, reason: 'invalid' };

  const q = lead.lead_quality.toUpperCase();
  lead.lead_quality = ['HOT', 'WARM', 'COLD'].includes(q) ? q : 'COLD';
  const score = Math.round(Number(lead.lead_quality_score));
  lead.lead_quality_score = String(Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0);
  return { ok: true, lead };
}

/** Identity of a lead inside one owner's inbox (the route hashes it into a document id). */
export function inboxKey(lead) {
  if (lead.email) return `e:${lead.email}`;
  if (lead.place_id) return `p:${lead.place_id}`;
  return `t:${digits(lead.whatsapp_number)}`;
}

export function summarizeInbox(leads) {
  const s = { total: leads.length, HOT: 0, WARM: 0, COLD: 0, withEmail: 0, phoneOnly: 0 };
  for (const l of leads) {
    s[l.lead_quality] = (s[l.lead_quality] || 0) + 1;
    if (l.email) s.withEmail++;
    else s.phoneOnly++;
  }
  return s;
}

const CSV_COLUMNS = [
  'email', 'business_name', 'whatsapp_number', 'first_name', 'last_name', 'lead_quality', 'lead_quality_score', 'place_id',
  'address', 'website', 'rating', 'review_count', 'category', 'instagram', 'twitter', 'facebook', 'youtube', 'linkedin_company',
  'linkedin_ceo', 'linkedin_founder', 'contact_page_found', 'social_media_score', 'email_primary', 'phone_primary',
  'contact_confidence', 'best_contact_method', 'decision_maker_found', 'decision_maker_name', 'decision_maker_title',
  'tech_stack_detected', 'company_size_indicator',
];

const cell = (v) => {
  const s = String(v ?? '').replace(/"/g, "'");
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
};

/** CSV text in the exact shape the sender's CSV import reads (same column count on every row, no stray newlines). */
export function leadsToCsv(leads) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const l of leads) lines.push(CSV_COLUMNS.map((c) => cell(l[c])).join(','));
  return lines.join('\n');
}

export const INBOX_HANDOFF_KEY = 'autoleads_inbox_csv';
