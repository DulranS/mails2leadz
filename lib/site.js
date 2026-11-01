// lib/site.js - the account's public landing page: what a prospect may see. Only the name, the tagline, the services and the
// public product prices. Never costs, margins, customers, invoices or anything internal.
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function sanitizeSite(raw) {
  return { site: { tagline: clean(raw?.tagline, 140), about: clean(raw?.about, 800) } };
}

export function publicSite({ businessName = '', site = {}, services = [], products = [] } = {}) {
  return {
    businessName: clean(businessName, 100),
    tagline: clean(site?.tagline, 140),
    about: clean(site?.about, 800),
    services: (services || []).filter((s) => s && s.name).slice(0, 20).map((s) => ({
      name: clean(s.name, 80), minutes: Math.max(0, Math.round(Number(s.minutes) || 0)), price: s.price === null || s.price === undefined ? null : Number(s.price),
    })),
    products: (products || []).filter((p) => p && p.name).slice(0, 50).map((p) => ({
      name: clean(p.name, 80), price: Number(p.price) || 0, description: clean(p.description, 300),
    })),
  };
}
