// The formulas from the accounting sheets that the app did not yet have (v268). Each is written as the sheet gives it. Where a sheet asks for an average
// (turnover ratios), the app uses the figure it holds for the period end and says so: it does not keep a running history of every balance. Pure.

const pct = (n: number) => Math.round(n * 10000) / 100;

export function proprietaryRatio(equity: number, totalAssets: number): number | null {
  return totalAssets > 0 ? pct(equity / totalAssets) : null;
}

export function receivablesTurnover(creditSales: number, receivables: number): number | null {
  return receivables > 0 ? Math.round((creditSales / receivables) * 100) / 100 : null;
}

export function averageCollectionDays(creditSales: number, receivables: number, days = 365): number | null {
  const t = receivablesTurnover(creditSales, receivables);
  return t && t > 0 ? Math.round((days / t) * 10) / 10 : null;
}

export function payablesTurnover(creditPurchases: number, payables: number): number | null {
  return payables > 0 ? Math.round((creditPurchases / payables) * 100) / 100 : null;
}

export function averagePaymentDays(creditPurchases: number, payables: number, days = 365): number | null {
  const t = payablesTurnover(creditPurchases, payables);
  return t && t > 0 ? Math.round((days / t) * 10) / 10 : null;
}

export function pvRatio(contribution: number, sales: number): number | null {
  return sales > 0 ? pct(contribution / sales) : null;
}

export function operatingRatio(cogs: number, operatingExpenses: number, netSales: number): number | null {
  return netSales > 0 ? pct((cogs + operatingExpenses) / netSales) : null;
}

export function marginOnSellingPrice(profit: number, sellingPrice: number): number | null {
  return sellingPrice > 0 ? pct(profit / sellingPrice) : null;
}

export function markupOnCost(profit: number, cost: number): number | null {
  return cost > 0 ? pct(profit / cost) : null;
}
