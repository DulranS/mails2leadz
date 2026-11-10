// lib/referral.js - asks happy customers for a referral, and gives each a code to share. Pure. Only customers with a settled, happy history are asked.
import { createHash } from 'node:crypto';
const DAY = 86400000;

export function referralCode(email) {
  return createHash('sha256').update(`referral:${String(email).toLowerCase()}`).digest('base64url').slice(0, 8).toUpperCase();
}

/** Won customers 60+ days ago, with no open support question, who have not been asked in the last 90 days. */
export function referralAsks(deals = [], tickets = [], asked = {}, now = Date.now()) {
  const openEmails = new Set((Array.isArray(tickets) ? tickets : []).filter((t) => t.status !== 'resolved').map((t) => String(t.customerEmail || '').toLowerCase()));
  return (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won' && d.email).filter((d) => {
    const won = Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0;
    const email = String(d.email).toLowerCase();
    const lastAsked = Date.parse(asked[email] || '') || 0;
    return won && now - won >= 60 * DAY && !openEmails.has(email) && now - lastAsked >= 90 * DAY;
  }).map((d) => ({ email: String(d.email).toLowerCase(), name: d.businessName || d.email, code: referralCode(d.email) }));
}
