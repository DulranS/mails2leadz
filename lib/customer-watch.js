// lib/customer-watch.js - two checks the owner reviews each week (nothing here sends anything). Pure (no database).
//  - quietCustomers: won customers with no open deal and no payment or won date in the last `days` days (default 90).
//    These are the win-back candidates. A win-back draft is still written and sent by the owner (customer-facing, so approval stays human).
//  - possibleDuplicateCustomers: two or more different e-mail addresses that share a phone number (last 9 digits) or a business name.
import { normalizeStage } from './deal-utils.js';

const DAY = 86400000;
const norm = (v) => String(v || '').trim().toLowerCase();
const phoneKey = (v) => String(v || '').replace(/\D/g, '').slice(-9);
const nameKey = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ms = (v) => Date.parse(v || '') || 0;

/**
 * @param {{deals?: object[], invoices?: object[], now?: number, days?: number, max?: number}} args
 * @returns {Array<{email: string, name: string, lastActivity: string, daysQuiet: number}>}  longest quiet first
 */
export function quietCustomers({ deals = [], invoices = [], now = Date.now(), days = 90, max = 25 } = {}) {
  const cutoff = now - days * DAY;
  const byEmail = new Map();
  const openEmails = new Set();
  for (const d of Array.isArray(deals) ? deals : []) {
    const e = norm(d?.email);
    if (!e) continue;
    const stage = normalizeStage(d.stage);
    if (stage === 'closed_won') {
      const won = ms(d.stageTimes?.closed_won || d.closedAt);
      const cur = byEmail.get(e) || { email: e, name: d.businessName || '', last: 0, winbackAt: 0 };
      cur.last = Math.max(cur.last, won);
      cur.name = cur.name || d.businessName || '';
      cur.winbackAt = Math.max(cur.winbackAt, ms(d.winbackAt));
      byEmail.set(e, cur);
    } else if (stage !== 'closed_lost') {
      openEmails.add(e);
    }
  }
  for (const i of Array.isArray(invoices) ? invoices : []) {
    const e = norm(i?.email);
    if (!e || !byEmail.has(e) || i.status !== 'paid') continue;
    const t = ms(i.paidAt || i.issuedAt || i.createdAt);
    byEmail.get(e).last = Math.max(byEmail.get(e).last, t);
  }
  const out = [];
  for (const c of byEmail.values()) {
    if (openEmails.has(c.email)) continue;               // still in the pipeline: not quiet
    if (!c.last || c.last > cutoff) continue;            // active, or no date to judge by: leave it alone
    if (c.winbackAt && c.winbackAt > cutoff) continue;   // already asked in this window
    out.push({ email: c.email, name: c.name, lastActivity: new Date(c.last).toISOString(), daysQuiet: Math.floor((now - c.last) / DAY) });
  }
  return out.sort((a, b) => b.daysQuiet - a.daysQuiet).slice(0, max);
}

/**
 * @param {object[]} deals
 * @returns {Array<{reason: 'same phone'|'same business name', emails: string[]}>}
 */
export function possibleDuplicateCustomers(deals = []) {
  const groups = new Map();
  const add = (reason, key, email) => {
    if (!key || !email) return;
    const id = `${reason}|${key}`;
    if (!groups.has(id)) groups.set(id, { reason, emails: new Set() });
    groups.get(id).emails.add(norm(email));
  };
  for (const d of Array.isArray(deals) ? deals : []) {
    add('same phone', phoneKey(d?.phone).length >= 7 ? phoneKey(d.phone) : '', d?.email);
    add('same business name', nameKey(d?.businessName).length >= 4 ? nameKey(d.businessName) : '', d?.email);
  }
  return [...groups.values()]
    .filter((g) => g.emails.size > 1)
    .map((g) => ({ reason: g.reason, emails: [...g.emails].sort() }));
}
