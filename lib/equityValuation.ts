// Equity valuation tools (v322). Pure: no I/O. Kept apart from lib/valuation.ts (the EBITDA valuation, v260) and lib/business-valuation.ts.
//   CAPM: cost of equity = risk-free rate + beta × equity risk premium. Feeds the cost of equity used in WACC (lib/wacc.ts).
//   Dividend discount model (Gordon growth): value per share = next year's dividend ÷ (required return − growth).
//   Implied P/E from the same model: payout ratio × (1 + growth) ÷ (required return − growth).
// Every input is owner-set: the app holds no market data. Results are null when the inputs cannot give a meaningful answer
// (for example, the required return is not above the growth rate, where the model blows up).

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/** Cost of equity by CAPM, in %. Beta and the rates must be zero or more. */
export function capmCostOfEquityPct(i: { riskFreePct: number; beta: number; equityRiskPremiumPct: number }): number | null {
  const { riskFreePct, beta, equityRiskPremiumPct } = i;
  if (![riskFreePct, beta, equityRiskPremiumPct].every(Number.isFinite)) return null;
  if (beta < 0 || riskFreePct < 0 || equityRiskPremiumPct < 0) return null;
  return round(riskFreePct + beta * equityRiskPremiumPct, 2);
}

/** Next year's dividend per share from the latest one, growing at the given rate (%). */
export function nextDividend(latestDividend: number, growthPct: number): number {
  return latestDividend * (1 + growthPct / 100);
}

/** Value per share by the Gordon growth model. Null unless the required return is above growth. */
export function gordonValuePerShare(i: { latestDividend: number; requiredReturnPct: number; growthPct: number }): number | null {
  const { latestDividend, requiredReturnPct, growthPct } = i;
  if (![latestDividend, requiredReturnPct, growthPct].every(Number.isFinite)) return null;
  if (latestDividend < 0 || requiredReturnPct <= growthPct) return null;
  const d1 = nextDividend(latestDividend, growthPct);
  return round(d1 / ((requiredReturnPct - growthPct) / 100), 2);
}

/** The P/E the dividend model implies: payout × (1 + growth) ÷ (required return − growth). Null on the same conditions. */
export function impliedPeFromDividendModel(i: { payoutPct: number; requiredReturnPct: number; growthPct: number }): number | null {
  const { payoutPct, requiredReturnPct, growthPct } = i;
  if (![payoutPct, requiredReturnPct, growthPct].every(Number.isFinite)) return null;
  if (payoutPct < 0 || payoutPct > 100 || requiredReturnPct <= growthPct) return null;
  return round((payoutPct / 100) * (1 + growthPct / 100) / ((requiredReturnPct - growthPct) / 100), 2);
}
