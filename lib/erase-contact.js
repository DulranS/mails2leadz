// lib/erase-contact.js - erasing ONE contact's personal data on request (pure rules: no database).
//
// What is removed: the contact's leads, deals, pending drafts, follow-ups, notes and messages. Their sent-email records stay,
// with the address, names, subject and text removed, so the sales counts stay true.
// What is kept, and why: invoices and credit notes (tax and accounting records must be kept for years), usage counters
// (no personal content), and one opt-out record (so the person is never contacted again; without it they would be).
import { createHash } from 'node:crypto';

export const ERASE_CONFIRM = 'ERASE';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/;

// Collections (top level, each doc has userId) searched for this contact's address in any text field.
export const SCAN_COLLECTIONS = [
  'sent_emails', 'deals', 'draft_queue', 'lead_inbox', 'contacts', 'list_contacts', 'replies', 'contact_history', 'manual_contact_status',
  'calls', 'sms_sent', 'whatsapp_sent', 'whatsapp_contacts', 'contacted_companies', 'sent_leads', 'scheduled_followups',
  'targets', 'inbound_enquiries', 'clicks', 'campaigns', 'restock_waits', 'contact_recovery', 'shop_baskets',
];
// Per-account subcollections under users/{uid}/...
// candidates (pass 344): a candidate profile and its CV, found by the email on the profile.
export const SCAN_SUBCOLLECTIONS = ['follow_up_tasks', 'contacts', 'lead_notes', 'lead_states', 'conversations', 'candidates'];
// Kept on purpose. The reason is shown to the owner, so nothing is removed silently.
export const RETAINED = {
  invoices: 'kept for tax and accounting records',
  credit_notes: 'kept for tax and accounting records',
  suppressions: 'kept as one opt-out record, so they are never contacted again',
};

/**
 * Candidate profiles that have no email, so the address search cannot reach them, and whose name matches the person's name.
 * These are listed for the owner to review. Nothing is deleted from this list. Pass 345.
 */
export function unlinkedCandidates(candidates, name) {
  const key = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key) return [];
  return (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email ?? '').trim()) && String(c.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === key)
    .map((c) => ({ id: c.id, name: c.name, stage: c.stage || 'new' }));
}

export function cleanEmail(value) {
  const e = String(value ?? '').trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : '';
}

/** A fingerprint for the audit log. It lets the owner prove an erasure happened without the log holding the address. */
export function emailHash(uid, email) {
  return createHash('sha256').update(`${String(uid)}|${cleanEmail(email)}`).digest('hex');
}

/** True when any text value of the document is this address (case-insensitive), at the top level or inside a list. */
export function holdsEmail(data, email) {
  const e = cleanEmail(email);
  if (!e || !data) return false;
  return Object.values(data).some((v) => {
    if (typeof v === 'string') return v.trim().toLowerCase() === e;
    if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.trim().toLowerCase() === e);
    return false;
  });
}

/**
 * What to do with a sent-email record that belongs to the contact: keep the counts and dates, remove everything that identifies them.
 * Other collections are deleted outright.
 */
export function sentEmailScrub(now = new Date()) {
  return {
    to: 'erased',
    businessName: '',
    subject: '',
    body: '',
    replyFrom: '',
    replyFromName: '',
    replySubject: '',
    replySummary: '',
    erasedAt: now.toISOString(),
  };
}

export const ERASE_CONFIRM_MESSAGE = `Type ${ERASE_CONFIRM} to confirm. This cannot be undone.`;
