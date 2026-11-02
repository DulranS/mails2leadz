// lib/products.js - a small product catalogue, buying by payment link, and reorder reminders. Pure logic; the routes do the I/O.
const DAY_MS = 86400000;

export const PRODUCT_LIMITS = { name: 80, sku: 40, desc: 300, price: 1e7 };
export const REORDER_AFTER_DAYS = 60;

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// A whole number from 0 to max, or null when blank (not tracked). NaN when the entry is not a whole number in range.
const whole = (v, max) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
};

/** @returns {{product}|{error}} */
function sanitizeProductBase(raw) {
  const name = clean(raw?.name, PRODUCT_LIMITS.name);
  if (!name) return { error: 'Give the product a name.' };
  const price = Number(raw?.price);
  if (!Number.isFinite(price) || price <= 0 || price > PRODUCT_LIMITS.price) return { error: 'Enter a price above zero.' };
  const stockOnHand = whole(raw?.stockOnHand, 1000000);
  const holdBack = whole(raw?.holdBack, 1000000) ?? 0;
  const maxPerOrder = whole(raw?.maxPerOrder, 999);
  if (Number.isNaN(stockOnHand) || Number.isNaN(holdBack)) return { error: 'Stock must be a whole number, 0 or more, or blank if you do not track it.' };
  if (Number.isNaN(maxPerOrder) || maxPerOrder === 0) return { error: 'Most per order must be a whole number of 1 or more, or blank.' };
  let weightKg = null; // kilograms, for working out postage; blank = not weighed yet
  if (raw?.weightKg !== '' && raw?.weightKg !== null && raw?.weightKg !== undefined) {
    const w = Number(raw.weightKg);
    if (!Number.isFinite(w) || w < 0 || w > 1000) return { error: 'Weight must be a number of kilograms, from 0 to 1000.' };
    weightKg = Math.round(w * 1000) / 1000;
  }
  return { product: {
    name, sku: clean(raw?.sku, PRODUCT_LIMITS.sku), description: clean(raw?.description, PRODUCT_LIMITS.desc),
    weightKg, giftCard: raw?.giftCard === true || raw?.giftCard === 'true', // a gift card: its value is held as store credit for the buyer
    price: Math.round(price * 100) / 100,
    stockOnHand, // null = not tracked (unlimited online)
    holdBack,    // a safety buffer kept back from online sale
    maxPerOrder: maxPerOrder || null,
  } };
}

/** What can be sold online now: null when stock is not tracked; otherwise stock on hand less the safety buffer, never below 0. */
export function availableToSell(p) {
  if (!p || p.stockOnHand === null || p.stockOnHand === undefined) return null;
  return Math.max(0, (Number(p.stockOnHand) || 0) - (Number(p.holdBack) || 0));
}

/** Option ids: the label in lower case with dashes by default. An id is kept when the owner edits the option's name, so an order's
 *  reference to it stays valid. */
export const VARIANT_LIMIT = 30;
const OPTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function variantIdOf(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

const money2 = (n) => Math.round(n * 100) / 100;
const blankish = (v) => v === '' || v === null || v === undefined;

/**
 * Options from text, one per line: "name, stock, price, weight in kg, id". Every column after the name is optional:
 * blank stock = not tracked; blank price = the product price; blank weight = the product weight; a blank id is made from the name.
 * Also accepts a saved list (objects with label, stockOnHand, price, weightKg, id).
 */
export function parseVariants(raw) {
  let rows;
  if (typeof raw === 'string') {
    rows = raw.split(/\r?\n/).map((l) => {
      const c = l.split(',').map((x) => x.trim());
      return { label: c[0] || '', stock: c[1] ?? '', price: c[2] ?? '', weight: c[3] ?? '', id: c[4] ?? '' };
    }).filter((r) => r.label);
  } else if (Array.isArray(raw)) {
    rows = raw.map((r) => ({
      label: r?.label, stock: r?.stockOnHand ?? r?.stock ?? '', price: r?.price ?? '', weight: r?.weightKg ?? r?.weight ?? '', id: r?.id ?? '',
    })).filter((r) => String(r.label || '').trim());
  } else rows = [];
  if (rows.length > VARIANT_LIMIT) return { error: `A product can have up to ${VARIANT_LIMIT} options.` };
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    const label = clean(r.label, 60);
    if (!label) return { error: 'Each option needs a name.' };
    let id = String(r.id || '').trim().toLowerCase();
    if (id) {
      if (id.length > 40 || !OPTION_ID.test(id)) return { error: `The id for ${label} can use only letters, numbers and single dashes.` };
    } else id = variantIdOf(label);
    if (!id) return { error: `Each option needs a name made of letters or numbers: ${label}.` };
    if (seen.has(id)) return { error: `The option "${label}" is listed twice.` };
    seen.add(id);
    const st = blankish(r.stock) ? null : Math.floor(Number(r.stock));
    if (st !== null && (!Number.isFinite(st) || st < 0 || st > 1000000)) return { error: `Stock for ${label} must be a whole number, 0 or more, or blank.` };
    let price = null;
    if (!blankish(r.price)) {
      const p = Number(r.price);
      if (!Number.isFinite(p) || p <= 0 || p > PRODUCT_LIMITS.price) return { error: `The price for ${label} must be above zero, or blank to use the product price.` };
      price = money2(p);
    }
    let weightKg = null;
    if (!blankish(r.weight)) {
      const w = Number(r.weight);
      if (!Number.isFinite(w) || w < 0 || w > 1000) return { error: `The weight for ${label} must be from 0 to 1000 kg, or blank.` };
      weightKg = Math.round(w * 1000) / 1000;
    }
    list.push({ id, label, stockOnHand: st, holdBack: 0, price, weightKg });
  }
  return { list };
}

/** The options as text, in the same column order parseVariants reads, so an edit round-trips without losing an id. */
export function variantsToText(variants = []) {
  return (Array.isArray(variants) ? variants : [])
    .map((v) => [String(v.label || '').replace(/,/g, ' ').slice(0, 60), v.stockOnHand ?? '', v.price ?? '', v.weightKg ?? '', v.id || ''].join(', '))
    .join('\n');
}

/** A product with options: each option carries its own stock. A product with no options keeps one stock count. */
export function sanitizeProduct(raw) {
  const base = sanitizeProductBase(raw);
  if (base.error) return base;
  const v = parseVariants(raw?.variantsText ?? raw?.variants);
  if (v.error) return { error: v.error };
  if (v.list.length) return { product: { ...base.product, stockOnHand: null, variants: v.list } };
  return { product: { ...base.product, variants: [] } };
}

/**
 * Applies an owner's edit to a saved product. Stock is never taken from the form for a product that already has it: stock changes
 * go through the stock panel, so an edit cannot overwrite a sale made while the form was open. Existing options keep their stock;
 * new options take the stock typed. An option with stock on hand cannot be removed (take the stock off first).
 * @returns {{product}|{error}}
 */
export function mergeProductUpdate(existing = {}, raw = {}) {
  const hadOptions = Array.isArray(existing.variants) && existing.variants.length > 0;
  const parsed = parseVariants(raw?.variantsText ?? variantsToText(existing.variants));
  if (parsed.error) return { error: parsed.error };
  const oldById = new Map(hadOptions ? existing.variants.map((v) => [v.id, v]) : []);
  const keptIds = new Set(parsed.list.map((v) => v.id));
  for (const [oid, ov] of oldById) {
    if (!keptIds.has(oid) && Number(ov.stockOnHand) > 0) {
      return { error: `${ov.label} still has ${ov.stockOnHand} in stock. Take the stock off in the stock panel first, or keep the option.` };
    }
  }
  const variants = parsed.list.map((v) => {
    const old = oldById.get(v.id);
    return { id: v.id, label: v.label, stockOnHand: old ? (old.stockOnHand ?? null) : v.stockOnHand, holdBack: 0, price: v.price, weightKg: v.weightKg };
  });
  // Stock on the product itself: kept as it is, except when the owner is turning options off, then the count they type applies.
  let stockSource = existing.stockOnHand ?? '';
  if (variants.length) stockSource = '';
  else if (hadOptions) stockSource = raw?.stockOnHand;
  const base = sanitizeProductBase({ ...raw, stockOnHand: stockSource });
  if (base.error) return base;
  return { product: { ...base.product, stockOnHand: variants.length ? null : base.product.stockOnHand, variants } };
}

export function variantOf(p = {}, variantId = '') {
  return (Array.isArray(p.variants) ? p.variants : []).find((v) => v.id === variantId) || null;
}

/** The weight that counts for postage: the option's own weight when it has one, otherwise the product's. null = not weighed. */
export function weightOf(p, variantId = '') {
  if (!p) return null;
  const o = variantId ? variantOf(p, variantId) : null;
  if (o && o.weightKg !== null && o.weightKg !== undefined) return Number(o.weightKg);
  return p.weightKg === null || p.weightKg === undefined ? null : Number(p.weightKg);
}

/** The unit price of a product or option: the option's own price when it has one, otherwise the product price. */
export function unitPriceOf(p, variantId = '') {
  const o = variantId ? variantOf(p, variantId) : null;
  if (o && o.price !== null && o.price !== undefined) return Number(o.price);
  return Number(p.price);
}

/**
 * Checks a basket against stock and the per-order limit, and says what to take off stock.
 * lines: [{ productId, variantId, quantity, product }]. Pure: the caller does the reading and, inside a transaction, the writing.
 * @returns {{ok:true, holds:object[]} | {ok:false, error:string}}
 */
export function planStockHold(lines = []) {
  const holds = [];
  for (const l of lines) {
    const p = l.product;
    if (!p || p.archived) return { ok: false, error: 'One of the items is no longer on sale. Remove it and try again.' };
    const name = clean(p.name, 80);
    const variantId = String(l.variantId || '');
    const option = variantId ? variantOf(p, variantId) : null;
    if (variantId && !option) return { ok: false, error: `That option of ${name} is no longer on sale. Remove it and try again.` };
    const shown = option ? `${name} (${option.label})` : name;
    if (p.maxPerOrder && l.quantity > Number(p.maxPerOrder)) return { ok: false, error: `You can order up to ${p.maxPerOrder} of ${shown} at a time.` };
    const src = option || p;
    const avail = availableToSell(src);
    if (avail === null) { holds.push({ productId: l.productId, variantId, quantity: l.quantity, tracked: false }); continue; }
    if (l.quantity > avail) return { ok: false, error: avail > 0 ? `Only ${avail} of ${shown} left to order online.` : `${shown} is sold out.` };
    holds.push({ productId: l.productId, variantId, quantity: l.quantity, tracked: true, before: Number(src.stockOnHand), after: Number(src.stockOnHand) - l.quantity });
  }
  return { ok: true, holds };
}

/** Orders whose stock hold has run out: unpaid, still open, placed at least afterDays ago, holding tracked stock, not released yet. */
export function holdsToRelease({ invoices = [], now = Date.now(), afterDays = 2 } = {}) {
  return invoices.filter((inv) => {
    if (!inv || inv.status === 'paid' || inv.status === 'void' || inv.holdReleasedAt) return false;
    if (!Array.isArray(inv.stockHolds) || !inv.stockHolds.some((h) => h && h.tracked)) return false;
    const placed = Date.parse(inv.createdAt || '');
    return Number.isFinite(placed) && now - placed >= afterDays * 86400000;
  });
}

/** The customers whose last paid purchase is at least `afterDays` old, and who have no unpaid invoice now. Most overdue first. */
export function reorderCandidates({ invoices = [], now = Date.now(), afterDays = REORDER_AFTER_DAYS } = {}) {
  const byEmail = new Map();
  const openEmails = new Set();
  for (const i of invoices) {
    const email = String(i?.email || '').toLowerCase();
    if (!email) continue;
    if (i.status === 'open' || i.status === 'partial' || i.status === 'overdue') openEmails.add(email);
    if (i.status !== 'paid') continue;
    const when = Date.parse(i.paidAt || i.issuedAt || '');
    if (!Number.isFinite(when)) continue;
    const prev = byEmail.get(email);
    if (!prev || when > prev.when) byEmail.set(email, { email, when, last: clean(i.note, 80), amount: Number(i.amount) || 0 });
  }
  return [...byEmail.values()]
    .filter((c) => !openEmails.has(c.email))
    .map((c) => ({ email: c.email, lastPaidAt: new Date(c.when).toISOString(), daysSince: Math.floor((now - c.when) / DAY_MS), lastPurchase: c.last, lastAmount: c.amount }))
    .filter((c) => c.daysSince >= afterDays)
    .sort((a, b) => b.daysSince - a.daysSince);
}

/** A friendly reorder note. Restates no price; offers to send the same product again. */
export function reorderDraft({ customer, lastPurchase, senderName = '' }) {
  const what = lastPurchase ? ` for ${lastPurchase}` : '';
  const text = [
    `Hello${customer ? ` ${customer}` : ''},`, '',
    `It has been a while since your last order${what}. If you need it again, reply to this email and I will send you a payment link.`,
    '', senderName || '',
  ].join('\n').replace(/\n+$/, '');
  return { subject: 'Ready to order again?', text };
}
