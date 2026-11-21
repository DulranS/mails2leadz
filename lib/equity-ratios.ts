// Pure, server-safe. Two equity ratios the health page shows (pass 312).
// Book value per share: net assets ÷ shares in issue. Dividend payout: dividends paid in the window ÷ net profit in the
// same window. Source for the formula: Dividend payout ratio = total dividends ÷ net income (CFI and Investopedia-style
// definitions; the page does not say whether paid or declared, so Balancr uses the dividends it recorded as paid).
// Dividend amounts are the gross declared amounts Balancr stores (before tax withheld).

export function bookValuePerShare(netAssets: number, totalShares: number): number | null {
  if (!Number.isFinite(netAssets) || !Number.isFinite(totalShares) || totalShares <= 0) return null;
  return netAssets / totalShares;
}

// No payout figure for a loss: a ratio over a negative profit reads backwards.
export function dividendPayoutPct(dividendsPaid: number, netProfit: number): number | null {
  if (!Number.isFinite(dividendsPaid) || !Number.isFinite(netProfit) || netProfit <= 0) return null;
  return (dividendsPaid / netProfit) * 100;
}

// Sum of dividends dated on or after windowStart (YYYY-MM-DD). Null if the window start is not a date.
export function dividendsInWindow(dividends: { date: string; amount: number }[], windowStart: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart)) return null;
  return dividends
    .filter((d) => typeof d.date === "string" && d.date >= windowStart)
    .reduce((t, d) => t + (Number(d.amount) || 0), 0);
}

// Dividends in the window that carry no share count (v315). A dividend's split is stored with it when it is declared, so
// one with no allocation holding shares was recorded before the cap table existed. The payout figure is not shown while
// any such dividend is in the window. Null if the window start is not a date.
export function dividendsWithoutShares(dividends: { date: string; allocations?: { shares: number }[] }[], windowStart: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart)) return null;
  return dividends.filter((d) => typeof d.date === "string" && d.date >= windowStart && !(d.allocations ?? []).some((a) => Number(a.shares) > 0)).length;
}

export interface RoundLike { date: string; shares: number }

// Shares in issue on a date (pass 315): today's count less the shares issued in rounds dated after it. Transfers and
// buybacks are not recorded, so this is exact only if none happened between that date and today.
export function sharesOnDate(currentShares: number, rounds: RoundLike[], date: string): number {
  const issuedAfter = rounds
    .filter((r) => typeof r.date === "string" && r.date > date && Number.isFinite(r.shares))
    .reduce((t, r) => t + r.shares, 0);
  return currentShares - issuedAfter;
}

// Earnings per share growth, year on year (pass 315): profit per share now against the year before, each on the share
// count in issue at the time. Null when a share count or the earlier earnings per share is not positive.
export function epsGrowthPct(npNow: number, sharesNow: number, npPrev: number, sharesPrev: number): number | null {
  if (![npNow, sharesNow, npPrev, sharesPrev].every((v) => Number.isFinite(v))) return null;
  if (sharesNow <= 0 || sharesPrev <= 0 || npPrev <= 0) return null;
  const epsNow = npNow / sharesNow;
  const epsPrev = npPrev / sharesPrev;
  return ((epsNow - epsPrev) / epsPrev) * 100;
}
