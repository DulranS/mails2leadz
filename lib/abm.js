// lib/abm.js - named accounts by type (customer, partner, press): who to contact next and when one has gone quiet. Pure.
const DAY = 86400000;
export const ACCOUNT_TYPES = ['customer', 'partner', 'press'];
const TYPE_WORD = { customer: 'account', partner: 'partner', press: 'publication' };

export function abmActions(accounts = [], now = Date.now(), quietDays = 14) {
  return (Array.isArray(accounts) ? accounts : []).filter((a) => a && a.name).map((a) => {
    const type = ACCOUNT_TYPES.includes(a.type) ? a.type : 'customer';
    if (a.stage === 'won' || a.stage === 'lost' || a.stage === 'closed') return null;
    const last = Date.parse(a.lastTouchAt || '') || 0;
    const days = last ? Math.floor((now - last) / DAY) : null;
    if (!last) return { name: a.name, type, why: `no contact yet (${TYPE_WORD[type]})`, contact: a.contact || '' };
    if (days >= quietDays) return { name: a.name, type, why: `no contact for ${days} days (${TYPE_WORD[type]})`, contact: a.contact || '' };
    return null;
  }).filter(Boolean);
}

/** "Company | contact | type" lines, up to 50 accounts. The type is optional and defaults to customer. */
export function parseAccounts(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).slice(0, 50).map(([name, contact = '', type = '']) => ({
    name: name.slice(0, 120),
    contact: contact.slice(0, 200),
    type: ACCOUNT_TYPES.includes(type.toLowerCase()) ? type.toLowerCase() : 'customer',
  }));
}
