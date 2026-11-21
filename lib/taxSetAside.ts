// Tax set-aside (v231): income tax on the year's profit, less the tax already paid, so the business knows how much cash to keep back. It is an
// estimate at the rate the business has set, on the profit it has recorded, not tax advice. A loss in the year owes nothing (losses are not
// refunded here). Pure.

export interface MonthProfit { month: string; netProfitPreTax: number }
export interface TaxPaid { amount: number; date: string }

export function taxSetAside(i: { year: string; ratePct: number; months: MonthProfit[]; payments: TaxPaid[]; cash: number }) {
  const yearMonths = i.months.filter((m) => m.month.startsWith(`${i.year}-`));
  const profit = yearMonths.reduce((t, m) => t + m.netProfitPreTax, 0);
  const taxable = Math.max(0, profit);
  const owed = round2(taxable * (i.ratePct / 100));
  const paid = round2(i.payments.filter((p) => p.date.startsWith(`${i.year}-`)).reduce((t, p) => t + p.amount, 0));
  const outstanding = round2(owed - paid);
  return {
    profitYtd: round2(profit),
    owed,
    paid,
    outstanding, // negative means more has been paid than is due
    coveredByCash: outstanding <= 0 || i.cash >= outstanding,
    cashShortfall: outstanding > 0 && i.cash < outstanding ? round2(outstanding - i.cash) : 0,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
