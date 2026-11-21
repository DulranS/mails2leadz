// Ratios from the 40-ratio reference (pass 308), each with the reference's own formula. Pure: no I/O.
// Each returns null when an input is missing or the division has no meaning (zero denominator, no interest).
const div = (n: number | null, d: number | null): number | null =>
  n === null || d === null || !Number.isFinite(n) || !Number.isFinite(d) || d === 0 ? null : n / d;
const pct = (n: number | null, d: number | null): number | null => {
  const r = div(n, d);
  return r === null ? null : r * 100;
};

/** Operating cash flow ÷ current liabilities */
export const refOperatingCashFlowRatio = (ocf: number | null, currentLiabilities: number) => div(ocf, currentLiabilities);
/** Operating cash flow ÷ net profit */
export const refCashFlowToNetProfit = (ocf: number | null, netProfit: number) => div(ocf, netProfit);
/** Operating cash flow ÷ total assets × 100 */
export const refCashReturnOnAssetsPct = (ocf: number | null, totalAssets: number) => pct(ocf, totalAssets);
/** Interest expense ÷ EBIT × 100 */
export const refInterestBurdenPct = (interest: number, ebit: number | null) => pct(interest, ebit);
/** Operating cash flow ÷ interest expense */
export const refCashInterestCoverage = (ocf: number | null, interest: number) => (interest > 0 ? div(ocf, interest) : null);
/** EBITDA ÷ interest expense */
export const refEbitdaCoverage = (ebitda: number | null, interest: number) => (interest > 0 ? div(ebitda, interest) : null);
/** Retained earnings ÷ net profit × 100 */
export const refRetainedEarningsPct = (retained: number, netProfit: number) => pct(retained, netProfit);
/** Revenue ÷ net fixed assets */
export const refFixedAssetTurnover = (revenue: number, netFixedAssets: number) => div(revenue, netFixedAssets);

/** Cost of sales ÷ trade payables (times per period), pass 314 */
export const refPayablesTurnover = (cogs: number, payables: number) => div(cogs, payables);
/** Common equity ÷ fixed-cost-bearing funds (long-term borrowings plus preference capital), pass 314 */
export const refCapitalGearing = (equity: number, fixedCostFunds: number) => div(equity, fixedCostFunds);
/** (EBIT + rent) ÷ (interest + rent): rent stands in for the lease expense, pass 314 */
export const refFixedChargeCover = (ebit: number | null, rent: number, interest: number) =>
  ebit === null ? null : div(ebit + rent, interest + rent);

