// Value at an earnings multiple (v260). Trailing EBITDA is the profit before tax, with interest and depreciation added back (the cost of borrowing and the
// non-cash charge for assets are set aside, so the result shows what the trading earns). Value is EBITDA times a multiple the owner chooses (an estimate, not
// a quote). Equity value is what is left for the owners once loans are repaid from the value, with the cash added. Pure.

export function trailingEbitda(months: { netProfitPreTax: number; interestExpense: number; depreciationExpense: number }[]): number {
  return Math.round(months.reduce((t, m) => t + m.netProfitPreTax + m.interestExpense + m.depreciationExpense, 0) * 100) / 100;
}

export function valueAtMultiple(i: { ebitda: number; multiple: number; loansPayable: number; cash: number }) {
  const enterpriseValue = Math.round(i.ebitda * i.multiple * 100) / 100;
  const equityValue = Math.round((enterpriseValue - i.loansPayable + i.cash) * 100) / 100;
  return { enterpriseValue, equityValue };
}

export function validMultiple(m: number | undefined): string | null {
  if (m === undefined) return null;
  if (!(m >= 0 && m <= 50)) return "The multiple must be between 0 and 50 times earnings.";
  return null;
}
