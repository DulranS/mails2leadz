// lib/shop.js - a customer's basket on the public page (pure, no network).
// The browser sends product ids, option ids and quantities only. Every price comes from the owner's product list on the server,
// so a changed price in the browser cannot change what is charged. Discount codes are not applied to baskets.
import { unitPriceOf, unitForQuantity } from './products.js';
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export const SHOP_LIMITS = { lines: 20, quantity: 999, name: 120, note: 200 };

/** Turns the posted body into a clean basket. The same product and option are merged; quantities are 1 to 999. */
export function sanitizeBasket(raw) {
  const merged = new Map();
  for (const line of (Array.isArray(raw?.items) ? raw.items : []).slice(0, 60)) {
    const productId = String(line?.productId ?? '').trim().slice(0, 80);
    const variantId = String(line?.variantId ?? '').trim().slice(0, 40);
    const q = Math.floor(Number(line?.quantity));
    if (!productId || !Number.isFinite(q) || q < 1) continue;
    const key = `${productId}|${variantId}`;
    const prev = merged.get(key) || { productId, variantId, quantity: 0 };
    merged.set(key, { ...prev, quantity: Math.min(SHOP_LIMITS.quantity, prev.quantity + q) });
  }
  return {
    bot: !!clean(raw?.website, 200), // a filled honeypot field: a robot. Answered the same way, nothing recorded.
    email: String(raw?.email ?? '').trim().toLowerCase().slice(0, 254),
    name: clean(raw?.name, SHOP_LIMITS.name),
    delivery: raw?.delivery === 'ship' ? 'ship' : 'collect',
    shipTo: String(raw?.shipTo ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 300),
    country: String(raw?.country ?? '').trim().toUpperCase().slice(0, 2),
    items: [...merged.values()].slice(0, SHOP_LIMITS.lines),
  };
}

const cents = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Prices a basket against the owner's products. productsById: { [id]: { name, price, variants? } }.
 * @returns {{ok:true, lines:object[], amount:number, note:string} | {ok:false, error:string}}
 */
export function priceBasket(items = [], productsById = {}) {
  if (!items.length) return { ok: false, error: 'Add at least one item.' };
  const lines = [];
  let amount = 0;
  for (const it of items) {
    const p = productsById[it.productId];
    if (!p || !Number.isFinite(Number(p.price))) return { ok: false, error: 'One of the items is no longer on sale. Remove it and try again.' };
    const variantId = it.variantId || '';
    const option = variantId ? (Array.isArray(p.variants) ? p.variants : []).find((v) => v.id === variantId) : null;
    if (variantId && !option) return { ok: false, error: 'One of the options is no longer on sale. Remove it and try again.' };
    const unit = unitForQuantity(p, variantId, it.quantity);
    if (!Number.isFinite(unit) || unit <= 0) return { ok: false, error: 'Free items are not ordered online. Get in touch instead.' };
    const line = cents(unit * it.quantity);
    amount = cents(amount + line);
    lines.push({ productId: it.productId, variantId, name: clean(p.name, 80), variantLabel: option ? clean(option.label, 60) : '', quantity: it.quantity, unit: cents(unit), amount: line });
  }
  if (amount <= 0) return { ok: false, error: 'The order total must be above zero.' };
  const note = clean(lines.map((l) => `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''}${l.quantity > 1 ? ` x${l.quantity}` : ''}`).join('; '), SHOP_LIMITS.note);
  return { ok: true, lines, amount, note };
}
