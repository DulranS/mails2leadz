// Return on invested capital (v253). ROIC = operating profit after tax ÷ the capital the business is using. Operating profit is the profit before tax
// plus the interest paid (the cost of borrowing is part of the return the capital must earn), taxed at the business's income tax rate. Capital used is
// the owner's equity plus loans, less the cash held (cash that is not working is not counted as capital in use). The value spread is ROIC less the cost
// of capital: above zero, the business earns more on its capital than it costs; below zero, it does not. Pure.

export function roic(i: { pretaxProfit: number; interestPaid: number; taxRatePct: number; equity: number; loansPayable: number; cash: number }) {
  const operatingProfit = i.pretaxProfit + i.interestPaid;
  const nopat = operatingProfit * (1 - i.taxRatePct / 100);
  const investedCapital = i.equity + i.loansPayable - i.cash;
  const roicPct = investedCapital > 0 ? Math.round((nopat / investedCapital) * 10000) / 100 : null;
  return { operatingProfit: Math.round(operatingProfit * 100) / 100, nopat: Math.round(nopat * 100) / 100, investedCapital: Math.round(investedCapital * 100) / 100, roicPct };
}

export function valueSpread(roicPct: number | null, costOfCapitalPct: number | undefined) {
  if (roicPct === null || costOfCapitalPct === undefined) return null;
  const spread = Math.round((roicPct - costOfCapitalPct) * 100) / 100;
  return { spreadPct: spread, verdict: spread > 0 ? "creates value" as const : spread < 0 ? "destroys value" as const : "break-even" as const };
}
