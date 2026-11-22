// lib/market-share.js - the share of a market your won revenue represents. Pure.
// The market size is typed in by the owner (the total yearly revenue of the market you sell into). Nothing is fetched,
// so the share is only as good as that estimate, and the page says so.

/** The typed market size as a non-negative number; blank, negative or not a number gives 0 (none set). */
export function sanitizeMarketSize(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e12) : 0;
}

/**
 * @param {{ownRevenue: number, marketSize: number}} a
 * @returns {{sharePct: number|null, reason: 'ok'|'no_market'|'no_revenue'|'over_market'}}
 *  no_market: no usable market size; no_revenue: no won revenue figure; over_market: revenue is above the market typed (check the size).
 */
export function marketShare({ ownRevenue, marketSize } = {}) {
  const size = sanitizeMarketSize(marketSize);
  if (size <= 0) return { sharePct: null, reason: 'no_market' };
  const own = Number(ownRevenue);
  if (!Number.isFinite(own) || own < 0) return { sharePct: null, reason: 'no_revenue' };
  const sharePct = Math.round((own / size) * 10000) / 100; // two decimal places of a percent
  return { sharePct, reason: sharePct > 100 ? 'over_market' : 'ok' };
}
