// Solvency and value (v257). Liquidity asks whether you can pay bills now; solvency asks whether you own more than you owe. Equity ratio: what share of
// the business is owned, not borrowed. Debt to equity: how much is borrowed for each unit owned. Interest cover: how many times the profit before interest
// covers the interest. Enterprise value here is book-based (equity plus loans, less cash): what the business's capital is worth on its books, not a sale
// price. Pure.

export function solvency(i: { totalEquity: number; totalAssets: number; loansPayable: number; cash: number; operatingProfit: number; interestPaid: number }) {
  const equityRatioPct = i.totalAssets > 0 ? Math.round((i.totalEquity / i.totalAssets) * 1000) / 10 : null;
  const debtToEquity = i.totalEquity > 0 ? Math.round((i.loansPayable / i.totalEquity) * 100) / 100 : null;
  const interestCover = i.interestPaid > 0 ? Math.round((i.operatingProfit / i.interestPaid) * 10) / 10 : null;
  const enterpriseValue = Math.round((i.totalEquity + i.loansPayable - i.cash) * 100) / 100;
  const verdict: "solvent" | "insolvent_on_books" | "no_assets" = i.totalAssets <= 0 && i.totalEquity <= 0 ? "no_assets" : i.totalEquity >= 0 ? "solvent" : "insolvent_on_books";
  return { equityRatioPct, debtToEquity, interestCover, enterpriseValue, verdict };
}
