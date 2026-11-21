// Per-share figures (v261). Earnings per share (EPS) is the profit left for the owners divided by the number of shares. Value per share is the equity value
// divided by the same shares. The implied price-to-earnings ratio is value per share over EPS: the multiple the valuation implies for each share. Share
// counts are what the owner enters: the shares in issue, or the fully diluted count if options and convertibles are to be included. There is no market price
// in the app; these are book and estimate figures. Pure.

export function eps(netProfitAfterTax: number, shares: number | undefined): number | null {
  if (!(shares && shares > 0)) return null;
  return Math.round((netProfitAfterTax / shares) * 100) / 100;
}

export function valuePerShare(equityValue: number, shares: number | undefined): number | null {
  if (!(shares && shares > 0)) return null;
  return Math.round((equityValue / shares) * 100) / 100;
}

export function impliedPe(perShare: number | null, earningsPerShare: number | null): number | null {
  if (perShare === null || earningsPerShare === null || earningsPerShare <= 0) return null;
  return Math.round((perShare / earningsPerShare) * 10) / 10;
}
