// lib/shipping.js - the rules for buying a shipping label for a paid storefront order (pure, no network).
// The weight comes from the products on the order (each option's own weight when it has one). The cheapest carrier rate is bought.
// Cross-border parcels get a customs declaration built from the order's lines. Customs codes (HS) are not generated: some carriers
// require them, and the owner must check the declaration before buying.
import { weightOf, unitPriceOf } from './products.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const KG_TO_OZ = 35.27396;
export const SHIPPING_LIMITS = { parcelMaxKg: 30 };

/** A postal address from a form. Required: name, first line, city, postcode and a two-letter country code. */
export function sanitizeAddress(raw = {}) {
  const a = {
    name: clean(raw.name, 80), street1: clean(raw.street1, 120), street2: clean(raw.street2, 120),
    city: clean(raw.city, 80), state: clean(raw.state, 40), postcode: clean(raw.postcode, 20),
    country: clean(raw.country, 10).toUpperCase(), phone: clean(raw.phone, 25).replace(/[^+0-9 ()-]/g, ''),
  };
  if (!a.name) return { error: 'Enter the name for the address.' };
  if (!a.street1) return { error: 'Enter the first line of the address.' };
  if (!a.city) return { error: 'Enter the town or city.' };
  if (!a.postcode) return { error: 'Enter the postcode.' };
  if (!/^[A-Z]{2}$/.test(a.country)) return { error: 'Enter the country as a two-letter code, for example GB or US.' };
  return { address: a };
}

/** The total weight of the products on a paid order, in kilograms, and the names of any items with no weight. */
export function orderWeightKg(invoice = {}, products = {}) {
  let kg = 0;
  const unweighed = [];
  for (const line of Array.isArray(invoice.basketLines) ? invoice.basketLines : []) {
    const p = products[line.productId];
    const w = p ? weightOf(p, line.variantId || '') : null;
    if (w === null || w === undefined) { unweighed.push(clean(line.name, 80) || 'an item'); continue; }
    kg += w * (Number(line.quantity) || 0);
  }
  return { kg: Math.round(kg * 1000) / 1000, unweighed };
}

/** The cheapest rate that has a price. null when the carrier returns none. */
export function pickRate(rates = []) {
  const priced = (Array.isArray(rates) ? rates : []).filter((r) => r && Number.isFinite(Number(r.rate)) && r.id);
  if (!priced.length) return null;
  return priced.reduce((best, r) => (Number(r.rate) < Number(best.rate) ? r : best));
}

export const isInternational = (from = {}, to = {}) => String(from.country || '') !== String(to.country || '');

/** Customs lines for a cross-border parcel: one per product line, valued at what the customer paid per unit. */
export function customsItems(invoice = {}, products = {}, originCountry = '') {
  return (Array.isArray(invoice.basketLines) ? invoice.basketLines : []).map((line) => {
    const p = products[line.productId];
    const w = p ? weightOf(p, line.variantId || '') : 0;
    return {
      description: clean(line.name, 60) || 'Goods',
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      value: Math.round(unitPriceOf(p || {}, line.variantId || '') * 100) / 100 || 0,
      weight: Math.round((Number(w) || 0) * KG_TO_OZ * 100) / 100,
      origin_country: clean(originCountry, 2).toUpperCase(),
    };
  });
}

/** Maps the carrier's tracking status to the parcel's status shown to the owner and the customer. */
export function parcelStatusOf(trackerStatus = '') {
  const s = String(trackerStatus || '').toLowerCase();
  const known = ['pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'available_for_pickup', 'return_to_sender', 'failure', 'cancelled', 'error'];
  return known.includes(s) ? s : 'unknown';
}
