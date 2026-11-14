// lib/catalog.js - what the business sells, for any business: products, services, packages, offers and bundles, with stock where it is tracked. Pure.
export const KINDS = ['product', 'service', 'package', 'offer', 'bundle'];
export const MAX_ITEMS = 200;
export const LOW_STOCK = 3;

/** "type | name | price | stock | details | ends YYYY-MM-DD" lines. Stock left blank means not tracked. Bad lines are skipped and counted. */
export function parseCatalog(text) {
  const items = []; let skipped = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [kindRaw = '', name = '', price = '', stock = '', details = '', ends = ''] = line.split('|').map((x) => x.trim());
    const kind = kindRaw.toLowerCase();
    if (!KINDS.includes(kind) || !name) { skipped++; continue; }
    const p = price === '' ? null : Number(price.replace(/,/g, ''));
    const s = stock === '' ? null : Number(stock);
    if ((p !== null && !(p >= 0)) || (s !== null && !(s >= 0))) { skipped++; continue; }
    const endsAt = ends ? Date.parse(ends) : NaN;
    if (kind === 'offer' && !Number.isFinite(endsAt)) { skipped++; continue; }
    items.push({ kind, name: name.slice(0, 120), price: p, stock: s === null ? null : Math.floor(s), details: details.slice(0, 300), endsAt: Number.isFinite(endsAt) ? new Date(endsAt).toISOString() : null });
  }
  return { items: items.slice(0, MAX_ITEMS), skipped };
}

export function stockStatus(item) {
  if (!item || item.stock === null || item.stock === undefined) return 'untracked';
  if (item.stock <= 0) return 'out';
  if (item.stock <= LOW_STOCK) return 'low';
  return 'in';
}

/** Offers that have ended are never offered again. */
export function currentItems(items = [], now = Date.now()) {
  return (Array.isArray(items) ? items : []).filter((i) => i && !(i.kind === 'offer' && i.endsAt && Date.parse(i.endsAt) <= now));
}

export function lowStockItems(items = [], now = Date.now()) {
  return currentItems(items, now).filter((i) => stockStatus(i) === 'low' || stockStatus(i) === 'out');
}

/** Short block for the AI: only what is on offer now; out-of-stock items are marked so the AI never promises them. */
export function catalogBlock(items = [], now = Date.now()) {
  const list = currentItems(items, now);
  if (!list.length) return '';
  const lines = list.slice(0, 40).map((i) => {
    const price = i.price === null ? '' : ` at ${i.price}`;
    const stock = stockStatus(i);
    const tag = stock === 'out' ? ' (OUT OF STOCK: do not promise it)' : stock === 'low' ? ` (only ${i.stock} left)` : '';
    const ends = i.kind === 'offer' && i.endsAt ? ` (ends ${i.endsAt.slice(0, 10)})` : '';
    return `- ${i.kind}: ${i.name}${price}${tag}${ends}${i.details ? ` - ${i.details}` : ''}`;
  });
  return `What we offer right now. Sell the outcome each item gives the customer, not the effort behind it. Use only these, and never promise anything not listed:\n${lines.join('\n')}`;
}
