// Securities the business holds (lib/investments.ts): the holdings maths, the returns, the projection,
// and above all that the Balance Sheet keeps balancing once investments move cash and profit.
// Run: npx tsx scripts/verify-investments.ts
import { computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL } from "../lib/calculations";
import { computeInvestmentPortfolio, computeXirrPct, findOversell, monthsToReachTarget, projectPortfolio, requiredMonthlyContribution } from "../lib/investments";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("OK:", m); }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());
const ago = (days: number) => iso(new Date(Date.now() - days * 86400000));

let seq = 0;
const sec = (over: any = {}): any => ({ id: "s1", name: "ABC PLC", assetClass: "shares", createdAt: 1, ...over });
const tx = (over: any): any => ({ id: `t${++seq}`, securityId: "s1", createdAt: ++seq, ...over });

// 1. Weighted-average cost, realised gain, income, market value.
{
  const txns = [
    tx({ kind: "buy", date: ago(300), units: 100, amount: 50000, fees: 100 }),   // cost 50,100 -> 501/unit
    tx({ kind: "sell", date: ago(120), units: 40, amount: 24000, fees: 50 }),    // proceeds 23,950; cost out 20,040
    tx({ kind: "income", date: ago(60), amount: 800, fees: 0 }),
  ];
  const p = computeInvestmentPortfolio([sec({ currentPrice: 650, priceDate: ago(5) })], txns, TODAY);
  const pos = p.positions[0];
  assert(near(pos.units, 60), "units held = bought - sold");
  assert(near(pos.avgCost, 501), "average cost per unit includes the buy fee");
  assert(near(pos.costBasis, 30060), "cost basis of units still held");
  assert(near(pos.realizedGain, 23950 - 20040), "realised gain = net proceeds - average cost of units sold");
  assert(near(pos.marketValue, 39000), "market value = units x last price");
  assert(near(pos.unrealizedGain, 39000 - 30060), "unrealised gain = market value - cost");
  assert(near(pos.income, 800), "income recorded");
  assert(near(pos.totalReturn, 39000 - 30060 + 3910 + 800), "total return = unrealised + realised + income");
  assert(pos.annualizedReturnPct != null && pos.annualizedReturnPct > 0, "annualised return is positive for a profitable holding");
  assert(!pos.priceStale && !pos.priceMissing, "fresh price is not flagged");
}

// 2. Unpriced holdings are carried at cost; old prices are flagged stale.
{
  const buy = [tx({ kind: "buy", date: ago(30), units: 10, amount: 1000 })];
  const a = computeInvestmentPortfolio([sec()], buy, TODAY).positions[0];
  assert(a.priceMissing && near(a.marketValue, 1000) && near(a.unrealizedGain, 0), "unpriced holding is carried at cost with no invented gain");
  const b = computeInvestmentPortfolio([sec({ currentPrice: 120, priceDate: ago(200) })], buy, TODAY).positions[0];
  assert(b.priceStale && near(b.marketValue, 1200), "a 200-day-old price is used but flagged stale");
}

// 3. XIRR sanity and refusal on thin history.
{
  const r = computeXirrPct([{ date: ago(365), amount: -1000 }, { date: TODAY, amount: 1100 }]);
  assert(r != null && Math.abs(r - 10) < 0.3, "1,000 growing to 1,100 over a year is about 10% a year");
  assert(computeXirrPct([{ date: ago(10), amount: -1000 }, { date: TODAY, amount: 1100 }]) === null, "no annualised figure under 3 months of history");
  assert(computeXirrPct([{ date: ago(365), amount: -1000 }]) === null, "no figure without money coming back");
}

// 4. Overselling is detected, and the replay never creates phantom money.
{
  const ok = [tx({ kind: "buy", date: ago(50), units: 10, amount: 100 }), tx({ kind: "sell", date: ago(10), units: 10, amount: 130 })];
  assert(findOversell(ok) === null, "selling exactly what was held is fine");
  const bad = [tx({ kind: "buy", date: ago(50), units: 10, amount: 100 }), tx({ kind: "sell", date: ago(10), units: 11, amount: 143 })];
  assert(findOversell(bad) !== null, "selling more than held is caught");
  const clamped = computeInvestmentPortfolio([sec()], bad, TODAY).positions[0];
  assert(near(clamped.units, 0) && near(clamped.costBasis, 0), "an oversell in stored data is clamped, not negative");
}

// 5. The books: cash, profit, tax and the Balance Sheet must balance with investments in play.
{
  const taxRate = 20;
  const capital: any[] = [{ id: "c1", kind: "investment", amount: 200000, date: ago(400), createdAt: 1 }];
  const txns = [
    tx({ kind: "buy", date: ago(300), units: 100, amount: 50000, fees: 100 }),
    tx({ kind: "sell", date: ago(120), units: 40, amount: 24000, fees: 50 }),
    tx({ kind: "income", date: ago(60), amount: 800 }),
    tx({ kind: "buy", date: ago(20), units: 10, amount: 7000, fees: 30 }),
  ];
  const portfolio = computeInvestmentPortfolio([sec({ currentPrice: 700, priceDate: ago(2) })], txns, TODAY);
  const pnl = computeMonthlyPnL([], [], [], [], [], capital, taxRate, 0, [], [], [], [], [], [], portfolio.monthly);
  const summary = computeCapitalSummary(capital, pnl);
  const bs = computeBalanceSheet(pnl, 0, [], summary, TODAY, [], 0, 0, [], 0, { costBasis: portfolio.costBasis, marketValue: portfolio.marketValue });
  assert(bs.balances, `Balance Sheet balances with investments (assets ${bs.totalAssets.toFixed(2)} vs L+E ${bs.totalLiabilitiesAndEquity.toFixed(2)})`);
  assert(near(bs.investmentsValue, portfolio.marketValue), "investments appear on the Balance Sheet at market value");
  assert(near(bs.unrealizedInvestmentGain, portfolio.unrealizedGain), "unrealised gain is held in equity");
  const pre = pnl.reduce((s, m) => s + m.netProfitPreTax, 0);
  assert(near(pre, portfolio.realizedGain + portfolio.income), "with no trading, pre-tax profit is exactly realised gains plus income");
  const invCash = pnl.reduce((s, m) => s + m.investingCashFlow, 0);
  const expected = -(50100 + 7030) + (24000 - 50) + 800;
  assert(near(invCash, expected), "investing cash flow = sells + income - buys (fees included)");
  const noInvestments = computeMonthlyPnL([], [], [], [], [], capital, taxRate, 0, [], [], [], [], [], [], []);
  assert(noInvestments.every((m) => m.investmentIncome === 0 && m.investingCashFlow === 0), "a business with no investments is unchanged");
}

// 6. The projection: compounding, contributions, and the zero-growth case.
{
  const flat = projectPortfolio(1000, 0, 3, 100);
  assert(near(flat[3].value, 1000 + 100 * 36) && near(flat[3].contributed, 1000 + 100 * 36), "0% return: value is just what was put in");
  const grow = projectPortfolio(1000, 10, 2, 0);
  assert(near(grow[2].value, 1000 * 1.1 * 1.1, 0.5), "10% a year for two years on 1,000 is about 1,210");
  assert(near(grow[0].value, 1000), "year 0 is today's value");
}

// 7. Goal planning agrees with the projection it is built on.
{
  
  const c = requiredMonthlyContribution(1000, 8, 10, 100000);
  const reached = projectPortfolio(1000, 8, 10, c)[10].value;
  assert(near(reached, 100000, 1), "the monthly amount needed really does land on the target");
  assert(requiredMonthlyContribution(1000, 8, 10, 1500) === 0, "no top-up needed when growth alone gets there");
  assert(near(requiredMonthlyContribution(1200, 0, 1, 2400), 100), "0% return: just the gap divided by the months");
  const months = monthsToReachTarget(1000, 8, c, 100000);
  assert(months != null && Math.abs(months - 120) <= 1, "time to target matches the horizon the contribution was solved for");
  assert(monthsToReachTarget(1000, 0, 0, 5000) === null, "never reaches the target with no growth and no top-up");
  assert(monthsToReachTarget(5000, 5, 0, 1000) === 0, "already above the target");
}
