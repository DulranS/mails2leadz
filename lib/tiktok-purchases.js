// lib/tiktok-purchases.js - TikTok CompletePayment events for paid invoices whose buyer consented (double opt-in). Pure.
// Same consent rule and same web-event shape as the sign-up events (lib/tiktok-sync.js). Emails leave hashed.
import { hashEmail } from './consent-guard.js';

export function tiktokPurchaseBody({ invoices = [], consentedEmails = new Set(), since = 0, pixelCode = '', currency = 'USD', eventTime = Date.now() } = {}) {
  const data = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || inv.status !== 'paid' || !inv.email) continue;
    const email = String(inv.email).trim().toLowerCase();
    const paidAt = Date.parse(inv.paidAt || '');
    if (!consentedEmails.has(email) || !Number.isFinite(paidAt) || paidAt <= since) continue;
    const value = Number(inv.amountPaid) > 0 ? Number(inv.amountPaid) : Number(inv.total ?? inv.amount) || 0;
    if (!(value > 0)) continue;
    data.push({
      event: 'CompletePayment',
      event_time: Math.floor(paidAt / 1000),
      user: { email: hashEmail(email) },
      properties: { value: Math.round(value * 100) / 100, currency: String(inv.chargeCurrency || currency).toUpperCase().slice(0, 3) },
    });
  }
  return { event_source: 'web', event_source_id: pixelCode, data: data.slice(0, 1000), eventTime };
}
