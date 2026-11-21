// Equity valuation tools (lib/equityValuation.ts, v322). Run: tsx scripts/verify-equity-valuation.ts
import { capmCostOfEquityPct, nextDividend, gordonValuePerShare, impliedPeFromDividendModel } from "../lib/equityValuation";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

// CAPM
ok(capmCostOfEquityPct({ riskFreePct: 8, beta: 1.2, equityRiskPremiumPct: 6 }) === 15.2, "CAPM: 8 + 1.2 × 6 = 15.2");
ok(capmCostOfEquityPct({ riskFreePct: 8, beta: 0, equityRiskPremiumPct: 6 }) === 8, "beta 0 gives the risk-free rate");
ok(capmCostOfEquityPct({ riskFreePct: 8, beta: 1, equityRiskPremiumPct: 6 }) === 14, "beta 1 gives the market premium on top");
ok(capmCostOfEquityPct({ riskFreePct: 8, beta: -0.5, equityRiskPremiumPct: 6 }) === null, "negative beta is refused");
ok(capmCostOfEquityPct({ riskFreePct: NaN, beta: 1, equityRiskPremiumPct: 6 }) === null, "a missing input is refused");

// Dividend model
ok(nextDividend(10, 5) === 10.5, "next dividend grows 5%");
ok(gordonValuePerShare({ latestDividend: 10, requiredReturnPct: 15, growthPct: 5 }) === 105, "Gordon: 10.5 ÷ (15% − 5%) = 105");
ok(gordonValuePerShare({ latestDividend: 10, requiredReturnPct: 5, growthPct: 5 }) === null, "required return equal to growth gives no value");
ok(gordonValuePerShare({ latestDividend: 10, requiredReturnPct: 4, growthPct: 5 }) === null, "required return below growth gives no value");
ok(gordonValuePerShare({ latestDividend: 0, requiredReturnPct: 15, growthPct: 5 }) === 0, "no dividend, no value");
ok(gordonValuePerShare({ latestDividend: 10, requiredReturnPct: 15, growthPct: 0 }) === 66.67, "zero growth: 10 ÷ 15% = 66.67");

// Implied P/E
ok(impliedPeFromDividendModel({ payoutPct: 50, requiredReturnPct: 15, growthPct: 5 }) === 5.25, "P/E: 50% × 1.05 ÷ 10% = 5.25");
ok(impliedPeFromDividendModel({ payoutPct: 50, requiredReturnPct: 5, growthPct: 5 }) === null, "P/E is null when required return equals growth");
ok(impliedPeFromDividendModel({ payoutPct: 120, requiredReturnPct: 15, growthPct: 5 }) === null, "payout above 100% is refused");

// Consistency: value ÷ earnings equals the implied P/E when the dividend is payout × earnings
const latestEps = 4;
const value = gordonValuePerShare({ latestDividend: latestEps * 0.5, requiredReturnPct: 15, growthPct: 5 });
const pe = impliedPeFromDividendModel({ payoutPct: 50, requiredReturnPct: 15, growthPct: 5 });
ok(value !== null && pe !== null && Math.abs(value / latestEps - pe) < 0.01, "value ÷ earnings matches the implied P/E");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
