// lib/ticket-plan.js - which support ticket takes a customer's new message, and what changes on it. Pure (no database).
// An open ticket takes the message; a resolved one is reopened with a fresh target. Automatic answers (auto: true) are closed records and are never reopened.
import { SLA_HOURS } from './support.js';

const HOUR = 3600000;
const norm = (v) => String(v || '').trim().toLowerCase();
const digits = (v) => String(v || '').replace(/\D/g, '');

/**
 * @param {Array<{id: string, ...object}>} tickets  every ticket of the owner (id plus the stored fields)
 * @returns {{ matched: number, target: {id: string, patch: object, reopened: boolean}|null }}
 */
export function planCustomerMessage(tickets = [], { email = '', phone = '', body = '', channel = '', now = Date.now() } = {}) {
  const wantEmail = norm(email);
  const wantPhone = digits(phone);
  if (!wantEmail && !wantPhone) return { matched: 0, target: null };
  const mine = (Array.isArray(tickets) ? tickets : []).filter((t) => {
    if (!t || t.auto === true) return false;
    if (wantEmail && norm(t.customerEmail) === wantEmail) return true;
    if (!wantPhone) return false;
    return digits(t.customerPhone) === wantPhone || (!String(t.customerEmail || '').includes('@') && digits(t.customerEmail) === wantPhone);
  });
  if (!mine.length) return { matched: 0, target: null };
  mine.sort((a, b) => (Date.parse(b.openedAt) || 0) - (Date.parse(a.openedAt) || 0));
  const t = mine.find((x) => x.status !== 'resolved') || mine[0];
  const iso = new Date(now).toISOString();
  const patch = { lastCustomerMessageAt: iso, lastCustomerMessage: String(body || '').slice(0, 500), lastCustomerChannel: String(channel || '') };
  const reopened = t.status === 'resolved';
  if (reopened) {
    Object.assign(patch, {
      status: 'open', reopenedAt: iso, reopenCount: (Number(t.reopenCount) || 0) + 1,
      openedAt: iso, dueAt: new Date(now + SLA_HOURS * HOUR).toISOString(), resolvedAt: null,
    });
  }
  return { matched: mine.length, target: { id: t.id, patch, reopened } };
}
