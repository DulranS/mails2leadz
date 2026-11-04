// lib/bundles.js - bundles: a product made of other products, sold at the bundle price. A sale takes stock from each component.
// Pure. The SKU lookup is in lib/server/bundles.js; the stock taken comes from the checkout's stock transaction.
export const BUNDLE_LIMITS = { components: 10, qty: 100, sku: 60 };

/** "SKU-A x2, SKU-B" -> [{sku:'SKU-A', qty:2}, {sku:'SKU-B', qty:1}]. Empty text means no bundle. */
export function parseBundleText(text) {
  const raw = String(text || '').trim();
  if (!raw) return { items: [] };
  const items = [];
  const seen = new Set();
  for (const part of raw.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(.+?)\s*(?:[x×*]\s*(\d{1,3}))?$/i);
    if (!m) return { error: 'Bundle items look like "SKU x2", separated by commas.' };
    const sku = m[1].trim().slice(0, BUNDLE_LIMITS.sku);
    const qty = m[2] ? Number(m[2]) : 1;
    if (!sku) return { error: 'Bundle items look like "SKU x2", separated by commas.' };
    if (!(qty >= 1 && qty <= BUNDLE_LIMITS.qty)) return { error: `Each bundle item needs a quantity from 1 to ${BUNDLE_LIMITS.qty}.` };
    if (seen.has(sku.toLowerCase())) return { error: `${sku} is listed twice in the bundle.` };
    seen.add(sku.toLowerCase());
    items.push({ sku, qty });
    if (items.length > BUNDLE_LIMITS.components) return { error: `A bundle holds at most ${BUNDLE_LIMITS.components} products.` };
  }
  return { items };
}

/** The component product ids that the bundle lines in a basket need. */
export function bundleComponentIds(lines = []) {
  const ids = new Set();
  for (const l of Array.isArray(lines) ? lines : []) {
    for (const c of Array.isArray(l?.product?.bundleItems) ? l.product.bundleItems : []) ids.add(c.productId);
  }
  return [...ids];
}

/** Bundle lines become component lines: the stock each product of the bundle takes. Other lines pass through unchanged. */
export function expandForStock(lines = [], componentProducts = {}) {
  const out = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const comps = l?.product?.bundleItems;
    if (!Array.isArray(comps) || comps.length === 0) { out.push(l); continue; }
    for (const c of comps) {
      const p = componentProducts[c.productId];
      if (!p || p.archived) return { error: 'One of the items in that bundle is no longer on sale. Remove it and try again.' };
      out.push({ productId: c.productId, variantId: '', quantity: c.qty * Number(l.quantity), product: p });
    }
  }
  return { lines: out };
}
