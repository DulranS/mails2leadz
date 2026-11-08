// lib/deals/discover.js - flags listings priced well below the median of the current results for a search. Pure.
// The median is of today's listings for the same search, not sold prices: a candidate to check, never a valuation.
const r2 = (n) => Math.round(n * 100) / 100;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** From eBay Browse results: [{itemId, title, price:{value,currency}, condition, itemWebUrl}]. */
export function parseEbaySearch(json) {
  return (json?.itemSummaries || []).map((i) => ({
    itemId: String(i.itemId || ''),
    title: String(i.title || '').slice(0, 200),
    price: Number(i.price?.value),
    currency: String(i.price?.currency || 'USD').toUpperCase().slice(0, 3),
    condition: String(i.condition || '').slice(0, 40),
    url: String(i.itemWebUrl || '').slice(0, 400),
  })).filter((x) => x.itemId && x.price > 0);
}

/** Listings at least minDiscountPct below the median of this search, cheapest first. Needs enough listings to mean anything. */
export function findUndervalued(items = [], { minDiscountPct = 20, minItems = 8, limit = 5 } = {}) {
  const priced = (Array.isArray(items) ? items : []).filter((x) => x && x.price > 0);
  if (priced.length < minItems) return { median: null, candidates: [], note: `Needs at least ${minItems} listings to compare.` };
  const mid = median(priced.map((x) => x.price));
  const candidates = priced
    .map((x) => ({ ...x, medianPrice: r2(mid), discountPct: r2(((mid - x.price) / mid) * 100) }))
    .filter((x) => x.discountPct >= minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, limit);
  return { median: r2(mid), candidates, note: 'Compared with today\'s listings for the same search, not sold prices. Check the sold prices and the condition before you act.' };
}
