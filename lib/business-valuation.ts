// Business valuation (pass 305): what the business is worth on the common methods. Pure. These are estimates, not offers.
// Enterprise value (EV) is what the operations are worth. Equity value is what the owners hold: EV less loans owed, plus cash.
// Rates are percentages: 12 means 12%.

/** EV from a multiple of a metric (EBITDA for the EBITDA multiple, revenue for the revenue multiple). */
export function enterpriseFromMultiple(metric: number, multiple: number): number | null {
  if (!Number.isFinite(metric) || !Number.isFinite(multiple) || multiple < 0) return null;
  return Math.round(metric * multiple * 100) / 100;
}

/** Equity value: EV less the loans owed, plus the cash. */
export function equityFromEnterprise(ev: number, loans: number, cash: number): number {
  return Math.round((ev - loans + cash) * 100) / 100;
}

/** Net asset value: assets less liabilities on the books. */
export function netAssetValue(totalAssets: number, totalLiabilities: number): number {
  return Math.round((totalAssets - totalLiabilities) * 100) / 100;
}

/**
 * Enterprise value by discounted cash flow: the base cash flow grown each year for `years`, each year discounted
 * at the required return, plus a terminal value (the cash flow after that, at the terminal growth rate).
 * Null when the required return does not beat the terminal growth (the terminal value would be meaningless).
 */
export function dcfEnterprise(i: {
  baseCashFlow: number; growthPct: number; years: number; discountPct: number; terminalGrowthPct: number;
}): number | null {
  if (![i.baseCashFlow, i.growthPct, i.years, i.discountPct, i.terminalGrowthPct].every(Number.isFinite)) return null;
  if (!(i.years >= 1) || !(i.discountPct > i.terminalGrowthPct)) return null;
  const r = i.discountPct / 100;
  const g = i.growthPct / 100;
  const tg = i.terminalGrowthPct / 100;
  let pv = 0;
  let cf = i.baseCashFlow;
  for (let y = 1; y <= i.years; y++) {
    cf = i.baseCashFlow * Math.pow(1 + g, y);
    pv += cf / Math.pow(1 + r, y);
  }
  const terminal = (cf * (1 + tg)) / (r - tg);
  pv += terminal / Math.pow(1 + r, i.years);
  return Math.round(pv * 100) / 100;
}
