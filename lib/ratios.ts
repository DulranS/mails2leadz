// Return ratios (v267). ROE: what the owners' money earns, profit after tax over equity. ROCE: what all the capital in the business earns before tax and
// interest, operating profit over capital employed (total assets less current liabilities). The balance sheet does not tag liabilities as current or
// long-term; this treats loans payable as long-term and everything else as current, and says so. Pure.

export function roe(netProfitAfterTax: number, totalEquity: number): number | null {
  if (!(totalEquity > 0)) return null;
  return Math.round((netProfitAfterTax / totalEquity) * 10000) / 100;
}

export function roce(operatingProfit: number, totalAssets: number, totalLiabilities: number, loansPayable: number): number | null {
  const currentLiabilities = Math.max(0, totalLiabilities - loansPayable);
  const capitalEmployed = totalAssets - currentLiabilities;
  if (!(capitalEmployed > 0)) return null;
  return Math.round((operatingProfit / capitalEmployed) * 10000) / 100;
}
