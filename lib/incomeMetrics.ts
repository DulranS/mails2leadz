// Operating profit (EBIT) and EBITDA for one month of the income statement (pass 348). The same definition the Health page uses:
// contribution margin, less operating expenses and depreciation for EBIT; EBITDA adds depreciation back. Pure: no I/O.
// Interest, tax and one-off items sit below EBIT, so they are not in it.

export type IncomeMonth = {
  contributionMargin: number;
  operatingExpenses: number;
  depreciationExpense: number;
};

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Operating profit before interest and tax. A loss month gives a negative figure. */
export function monthEbit(m: IncomeMonth): number {
  return round2(m.contributionMargin - m.operatingExpenses - m.depreciationExpense);
}

/** EBIT with depreciation added back. */
export function monthEbitda(m: IncomeMonth): number {
  return round2(monthEbit(m) + m.depreciationExpense);
}
