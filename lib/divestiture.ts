// Divestiture model (pass 314). Pure: no I/O. Sell a business unit: what the sale does to this year's result, the cash and the
// profit the business keeps. Tax is charged on a gain only. Interest saved on debt repaid and interest earned on cash kept are
// taxed at the same rate as the profit they affect. "Implied multiple" is the sale price over the unit's yearly profit after tax.

export interface DivestitureInput {
  salePrice: number;
  costsOfSale: number;
  netBookValueSold: number; // what the unit's assets and liabilities are carried at
  taxRatePct: number;
  unitAnnualProfitAfterTax: number; // what the unit earns a year today (negative if it loses money)
  proceedsToRepayDebt: number;
  loanRatePct: number;
  cashRatePct: number;
}

export interface DivestitureResult {
  error: string;
  gainOrLoss: number;
  taxOnGain: number;
  netProceeds: number;
  cashKept: number;
  oneOffProfitEffect: number;
  annualProfitGivenUp: number;
  annualInterestEffect: number;
  annualProfitChange: number;
  impliedMultiple: number | null;
}

export function runDivestiture(i: DivestitureInput): DivestitureResult {
  const fail = (error: string): DivestitureResult => ({
    error, gainOrLoss: 0, taxOnGain: 0, netProceeds: 0, cashKept: 0, oneOffProfitEffect: 0,
    annualProfitGivenUp: 0, annualInterestEffect: 0, annualProfitChange: 0, impliedMultiple: null,
  });
  if (!Object.values(i).every((v) => Number.isFinite(v))) return fail("Every input must be a number.");
  if (i.salePrice < 0 || i.costsOfSale < 0 || i.netBookValueSold < 0 || i.proceedsToRepayDebt < 0) {
    return fail("Sale price, costs, book value and debt repaid cannot be negative.");
  }
  if ([i.taxRatePct, i.loanRatePct, i.cashRatePct].some((p) => p < 0 || p > 100)) {
    return fail("Tax and rates must be between 0 and 100%.");
  }
  const gain = i.salePrice - i.costsOfSale - i.netBookValueSold;
  const taxOnGain = gain > 0 ? (gain * i.taxRatePct) / 100 : 0;
  const netProceeds = i.salePrice - i.costsOfSale - taxOnGain;
  if (i.proceedsToRepayDebt > netProceeds) return fail("The debt repaid is more than the net proceeds.");
  const cashKept = netProceeds - i.proceedsToRepayDebt;
  const interestSaved = (i.proceedsToRepayDebt * i.loanRatePct) / 100;
  const interestEarned = (cashKept * i.cashRatePct) / 100;
  const annualInterestEffect = (interestSaved + interestEarned) * (1 - i.taxRatePct / 100);
  return {
    error: "",
    gainOrLoss: gain,
    taxOnGain,
    netProceeds,
    cashKept,
    oneOffProfitEffect: gain - taxOnGain,
    annualProfitGivenUp: i.unitAnnualProfitAfterTax,
    annualInterestEffect,
    annualProfitChange: -i.unitAnnualProfitAfterTax + annualInterestEffect,
    impliedMultiple: i.unitAnnualProfitAfterTax > 0 ? i.salePrice / i.unitAnnualProfitAfterTax : null,
  };
}
