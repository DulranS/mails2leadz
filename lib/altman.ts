// Altman Z'' score for private, non-manufacturing firms (pass 314). Pure: no I/O.
// Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4, where X1 = working capital / total assets, X2 = retained earnings / total assets,
// X3 = EBIT / total assets, X4 = book equity / total liabilities. Zones: above 2.6 safe, 1.1 to 2.6 grey, below 1.1 distress.
// Source: Altman's private-firm model as set out at https://www.calculate.co.nz/altman-z-score-calculator.php. It is a screen, not a credit rating.

export type AltmanZone = "safe" | "grey" | "distress";

export interface AltmanInput {
  workingCapital: number;
  retainedEarnings: number;
  ebit: number;
  bookEquity: number;
  totalAssets: number;
  totalLiabilities: number;
}

export function altmanZPrivate(i: AltmanInput): { z: number; zone: AltmanZone } | null {
  const vals = [i.workingCapital, i.retainedEarnings, i.ebit, i.bookEquity, i.totalAssets, i.totalLiabilities];
  if (!vals.every((v) => Number.isFinite(v))) return null;
  if (i.totalAssets <= 0 || i.totalLiabilities <= 0) return null;
  const x1 = i.workingCapital / i.totalAssets;
  const x2 = i.retainedEarnings / i.totalAssets;
  const x3 = i.ebit / i.totalAssets;
  const x4 = i.bookEquity / i.totalLiabilities;
  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  const zone: AltmanZone = z > 2.6 ? "safe" : z < 1.1 ? "distress" : "grey";
  return { z: Math.round(z * 100) / 100, zone };
}
