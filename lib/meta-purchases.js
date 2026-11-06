// lib/meta-purchases.js - Purchase events for paid invoices whose buyer has consented (double opt-in). Pure: which invoices, and the body.
// Emails leave as hashes only. Amounts are the amount the customer paid, in the currency of the invoice.
import { hashEmail } from './consent-guard.js';

export function purchaseBody({ invoices = [], consentedEmails = new Set(), since = 0, currency = 'USD', eventTime = Date.now() } = {}) {
  const data = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || inv.status !== 'paid' || !inv.email) continue;
    const email = String(inv.email).trim().toLowerCase();
    const paidAt = Date.parse(inv.paidAt || '');
    if (!consentedEmails.has(email) || !Number.isFinite(paidAt) || paidAt <= since) continue;
    const value = Number(inv.amountPaid) > 0 ? Number(inv.amountPaid) : Number(inv.total ?? inv.amount) || 0;
    if (!(value > 0)) continue;
    data.push({
      event_name: 'Purchase',
      event_time: Math.floor(paidAt / 1000),
      action_source: 'website',
      user_data: { em: [hashEmail(email)] },
      custom_data: { currency: String(inv.chargeCurrency || currency).toUpperCase().slice(0, 3), value: Math.round(value * 100) / 100 },
    });
  }
  return { data: data.slice(0, 1000), eventTime };
}
