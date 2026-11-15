// lib/contact-rules.js - who may be contacted, as pure rules (no database). Used by lib/server/route-helpers.js, which reads the facts.
// Marketing sends stop for a bounce, a marketing opt-out, a Lost deal, or a customer who owes 30+ days (the follow-up gate).
// Transactional sends (a quote the customer asked for, a reply) stop only for a bounce or a Lost deal; a marketing opt-out
// never stops them, and an overdue balance does not stop them either (they are the means of settling it).
// A Lost deal that was a stop request does not stop a transactional send.
import { invoiceState } from './billing.js';

/** Lost reasons that are a request to stop (set by lib/server/suppress.js). A Lost deal for any other reason is the owner's decision. */
export const STOP_REASONS = ['unsubscribed', 'bounced'];

/** The follow-up gate: marketing stops once an invoice is this many days overdue. */
export const OWED_STOP_DAYS = 30;

/**
 * Pure: does this address owe a balance that is OWED_STOP_DAYS or more overdue?
 * @param {object[]} invoices  the owner's invoices (each with email, status, dueAt)
 */
export function owesTooLong(invoices = [], email = '', now = Date.now()) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return false;
  return (Array.isArray(invoices) ? invoices : []).some((inv) =>
    String(inv?.email || '').trim().toLowerCase() === want && invoiceState(inv, now).daysOverdue >= OWED_STOP_DAYS);
}

/**
 * @param {{ kind?: 'all'|'marketing'|null, lostReason?: string|null, owesTooLong?: boolean }} facts
 *   kind: what stop the address has; lostReason: the Lost reason of its deal, or null; owesTooLong: 30+ days overdue
 * @param {'marketing'|'transactional'} purpose
 * @returns {boolean} true when the send must not go out
 */
export function blockDecision({ kind = null, lostReason = null, owesTooLong: overdue = false } = {}, purpose = 'marketing') {
  if (kind === 'all') return true;
  if (purpose === 'transactional') return lostReason !== null && !STOP_REASONS.includes(lostReason);
  return kind === 'marketing' || lostReason !== null || overdue === true;
}

/**
 * Whether a person can switch emails back on from the link in their email. Only an opt-out they made themselves
 * (the unsubscribe link) can be reversed. A bounce stays blocked: that address does not receive mail at all.
 * No record at all means they are already on the list.
 */
export function resubscribeDecision(source) {
  if (source === null || source === undefined) return { ok: true, changed: false };
  if (source === 'unsubscribe_link' || source === 'all_mail') return { ok: true, changed: true };
  return { ok: false, changed: false };
}
