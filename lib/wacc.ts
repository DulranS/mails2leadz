// Weighted average cost of capital, estimated from the books (pass 304). Pure: no I/O.
// WACC = E/(D+E) × cost of equity + D/(D+E) × cost of debt × (1 − tax rate).
//   D = loans on the books. E = the owners' equity on the books.
//   Cost of debt = interest paid in the period, annualised, ÷ the loans on the books.
//   Cost of equity is NOT in the books: it is what the owners want back, so the owner sets it. Without it there is no WACC.
// No WACC when there is no cost of equity, no period, or the equity is zero or negative (the weights would mean nothing).

export interface WaccInput {
  loansPayable: number;
  totalEquity: number;
  interestPaidInPeriod: number;
  periodMonths: number;
  taxRatePct: number;
  costOfEquityPct: number | undefined;
}

export interface WaccResult {
  waccPct: number;
  costOfDebtPct: number;
  debtWeightPct: number;
  equityWeightPct: number;
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

export function wacc(i: WaccInput): WaccResult | null {
  if (i.costOfEquityPct === undefined || !(i.periodMonths > 0) || !(i.totalEquity > 0)) return null;
  const D = Math.max(0, i.loansPayable);
  const E = i.totalEquity;
  const total = D + E;
  const costOfDebtPct = D > 0 && i.interestPaidInPeriod > 0 ? ((i.interestPaidInPeriod * 12) / i.periodMonths / D) * 100 : 0;
  const wD = D / total;
  const wE = E / total;
  const t = Math.min(100, Math.max(0, i.taxRatePct)) / 100;
  const waccPct = wE * i.costOfEquityPct + wD * costOfDebtPct * (1 - t);
  return {
    waccPct: round(waccPct, 2),
    costOfDebtPct: round(costOfDebtPct, 2),
    debtWeightPct: round(wD * 100, 1),
    equityWeightPct: round(wE * 100, 1),
  };
}
