// lib/site.js - the account's public landing page: what a prospect may see. Only the name, the tagline, the services, the
// public product prices, and testimonials the customer has agreed in writing may be shown. Never costs, margins, customers,
// invoices or anything internal.
import { availableToSell } from './products.js';
import { sanitizePostage } from './postage.js';
import { sanitizeTaxRates } from './tax-rates.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export const TESTIMONIAL_LIMITS = { count: 12, quote: 400, name: 60, company: 80 };

/** Testimonials are saved only when the owner ticks that the customer agreed in writing. Anything without that is dropped. */
export function sanitizeTestimonials(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 40)
    .map((t) => ({
      quote: clean(t?.quote, TESTIMONIAL_LIMITS.quote),
      name: clean(t?.name, TESTIMONIAL_LIMITS.name),
      company: clean(t?.company, TESTIMONIAL_LIMITS.company),
      consent: t?.consent === true,
    }))
    .filter((t) => t.quote && t.consent)
    .slice(0, TESTIMONIAL_LIMITS.count)
    .map(({ quote, name, company }) => ({ quote, name, company, consent: true }));
}

export function sanitizeSite(raw) {
  const site = { tagline: clean(raw?.tagline, 140), about: clean(raw?.about, 800) };
  // Only written when sent: a save of the text alone must not wipe the testimonials already on the page.
  if (Array.isArray(raw?.testimonials)) site.testimonials = sanitizeTestimonials(raw.testimonials);
  // The delivery charge per order: only written when sent, and never negative.
  // Postage bands (weight and destination), only written when sent.
  if (raw && 'postage' in raw) site.postageRules = sanitizePostage(raw.postage);
  if (raw && 'taxRates' in raw) site.taxRates = sanitizeTaxRates(raw.taxRates);
  if (raw && 'shippingFee' in raw) {
    const fee = Number(raw.shippingFee);
    site.shippingFee = Number.isFinite(fee) && fee > 0 ? Math.min(100000, Math.round(fee * 100) / 100) : 0;
  }
  return { site };
}

export function publicSite({ businessName = '', site = {}, services = [], products = [] } = {}) {
  return {
    businessName: clean(businessName, 100),
    tagline: clean(site?.tagline, 140),
    about: clean(site?.about, 800),
    services: (services || []).filter((s) => s && s.name).slice(0, 20).map((s) => ({
      name: clean(s.name, 80), minutes: Math.max(0, Math.round(Number(s.minutes) || 0)), price: s.price === null || s.price === undefined ? null : Number(s.price),
    })),
    products: (products || []).filter((p) => p && p.name && !p.archived).slice(0, 50).map((p) => ({
      id: clean(p.id, 80), name: clean(p.name, 80), price: Number(p.price) || 0, description: clean(p.description, 300),
      // Exact stock is never shown to the public, only whether it is gone (for the product, or for each option).
      soldOut: Array.isArray(p.variants) && p.variants.length ? p.variants.every((v) => availableToSell(v) === 0) : availableToSell(p) === 0,
      variants: (Array.isArray(p.variants) ? p.variants : []).slice(0, 30).map((v) => ({ id: clean(v.id, 40), label: clean(v.label, 60), price: v.price === null || v.price === undefined ? null : Number(v.price), soldOut: availableToSell(v) === 0 })),
      maxPerOrder: Number(p.maxPerOrder) > 0 ? Math.floor(Number(p.maxPerOrder)) : null,
    })),
    testimonials: sanitizeTestimonials(site?.testimonials).map(({ quote, name, company }) => ({ quote, name, company })),
    shippingFee: Number(site?.shippingFee) > 0 ? Number(site.shippingFee) : 0,
    postage: sanitizePostage(site?.postageRules).map(({ upToKg, fee, countries }) => ({ upToKg, fee, countries })),
  };
}
