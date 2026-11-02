// lib/manual-stock.js - product lines on an invoice made by hand, so the stock sold is taken off the shelf (pure).
// A hand-made invoice that takes stock keeps that stock in its own field (manualStockTaken), so the abandoned-hold release that
// runs for unpaid storefront orders never touches it. Cancelling an unpaid hand-made invoice puts the stock back once.
export const MANUAL_STOCK_LINES = 10;

/** The stock lines from a form or a request. Blank rows are ignored; the same product and option are merged. */
export function sanitizeStockLines(raw) {
  if (raw === undefined || raw === null || raw === '') return { lines: [] };
  if (!Array.isArray(raw)) return { error: 'The product lines are not in the right form.' };
  if (raw.length > MANUAL_STOCK_LINES) return { error: `Up to ${MANUAL_STOCK_LINES} product lines per invoice.` };
  const merged = new Map();
  for (const l of raw) {
    const productId = String(l?.productId || '').trim().slice(0, 80);
    if (!productId) continue;
    const variantId = String(l?.variantId || '').trim().slice(0, 40);
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(productId)) return { error: 'Choose a valid product.' };
    const q = Math.floor(Number(l?.quantity));
    if (!Number.isFinite(q) || q < 1 || q > 100000) return { error: 'Each product line needs a quantity of 1 or more.' };
    const k = `${productId}|${variantId}`;
    merged.set(k, { productId, variantId, quantity: (merged.get(k)?.quantity || 0) + q });
  }
  return { lines: [...merged.values()] };
}
