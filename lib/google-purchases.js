// lib/google-purchases.js - Google Ads conversions (enhanced, hashed) for consented buyers' paid invoices. Pure.
// The conversion action is the one the owner creates in Google Ads (GOOGLE_ADS_CONVERSION_ACTION, e.g. customers/123/conversionActions/456).
import { hashEmail } from './consent-guard.js';

const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + '+00:00';

export function googleConversionsBody({ invoices = [], consentedEmails = new Set(), since = 0, conversionAction = '', currency = 'USD' } = {}) {
  const conversions = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || inv.status !== 'paid' || !inv.email) continue;
    const email = String(inv.email).trim().toLowerCase();
    const paidAt = Date.parse(inv.paidAt || '');
    if (!consentedEmails.has(email) || !Number.isFinite(paidAt) || paidAt <= since) continue;
    const value = Number(inv.amountPaid) > 0 ? Number(inv.amountPaid) : Number(inv.total ?? inv.amount) || 0;
    if (!(value > 0)) continue;
    conversions.push({
      conversionAction,
      conversionDateTime: stamp(paidAt),
      conversionValue: Math.round(value * 100) / 100,
      currencyCode: String(inv.chargeCurrency || currency).toUpperCase().slice(0, 3),
      userIdentifiers: [{ hashedEmail: hashEmail(email) }],
    });
  }
  return { conversions: conversions.slice(0, 2000), partialFailure: true };
}
