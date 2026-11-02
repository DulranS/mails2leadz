// lib/tax-rates.js - the tax rate the owner charges for a storefront order, by the customer's country (pure).
// The owner enters the rates; the app does not decide which countries need registering, what thresholds apply, or which
// goods get reduced rates. Those are tax decisions for the owner's accountant. Without a rate for a country, the business's
// default rate applies.
const COUNTRY = /^[A-Z]{2}$/;
export const TAX_LIMITS = { rates: 60, maxRate: 30 };

/** Accepts [{country, rate}] or text, one per line: "GB, 20". */
export function sanitizeTaxRates(raw) {
  const rows = typeof raw === 'string'
    ? raw.split(/\r?\n/).map((line) => { const [c = '', r = ''] = line.split(',').map((x) => x.trim()); return { country: c, rate: r }; })
    : (Array.isArray(raw) ? raw : []).map((r) => ({ country: r?.country, rate: r?.rate }));
  const out = new Map();
  for (const r of rows) {
    if (!String(r.country ?? '').trim() && !String(r.rate ?? '').trim()) continue;
    const country = String(r.country ?? '').trim().toUpperCase();
    const rate = Number(r.rate);
    if (!COUNTRY.test(country) || !Number.isFinite(rate) || rate < 0 || rate > TAX_LIMITS.maxRate) continue;
    out.set(country, Math.round(rate * 100) / 100);
  }
  return [...out].map(([country, rate]) => ({ country, rate })).slice(0, TAX_LIMITS.rates);
}

export const formatTaxRates = (rates = []) => (rates || []).map((r) => `${r.country}, ${r.rate}`).join('\n');

export function rateForCountry(rates = [], country = '', fallback = 0) {
  const c = String(country || '').trim().toUpperCase();
  const hit = (rates || []).find((r) => r.country === c);
  return hit ? hit.rate : (Number(fallback) || 0);
}
