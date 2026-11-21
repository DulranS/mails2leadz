// Verifies lib/calculations.ts's computeInvestmentScenarios (base / strong /
// downside stress test for the investment calculator) and computeSafeToCommit
// (cash you can actually put to work) against hand-computed values.
//
// Run: npx tsx scripts/verify-investment-scenarios.ts

import { computeInvestmentScenarios, computeSafeToCommit, computeNPV } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}
function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

// --- Scenarios --------------------------------------------------------------
// Outlay 1000, three years of 500, discount 10%.
const s = computeInvestmentScenarios({
  outlay: 1000,
  yearlyCashFlows: [500, 500, 500],
  discountRatePct: 10,
  strongPct: 20,
  downsidePct: 40,
  overrunPct: 10,
});

// Base: 500/1.1 + 500/1.21 + 500/1.331 - 1000 = 243.43
assert(approx(s.base.npv, 243.43), `base NPV = 243.43 (got ${s.base.npv})`);
assert(approx(s.base.npv, computeNPV([-1000, 500, 500, 500], 10)), "base case equals the plain NPV of the entered flows");
assert(approx(s.base.payback ?? -1, 2), `base payback = 2.0 years (got ${s.base.payback})`);

// Strong: flows x1.2 = 600 each. NPV = 600 x 2.48685 - 1000 = 492.11
assert(approx(s.strong.cashFlows[1], 600), "strong case scales a positive year up by 20%");
assert(approx(s.strong.npv, 492.11), `strong NPV = 492.11 (got ${s.strong.npv})`);

// Downside: flows x0.6 = 300 each, outlay 1100. NPV = 300 x 2.48685 - 1100 = -353.94
assert(approx(s.downside.outlay, 1100), "downside outlay carries the 10% overrun");
assert(approx(s.downside.cashFlows[0], -1100), "downside cash flow 0 is the overrun outlay");
assert(approx(s.downside.cashFlows[2], 300), "downside case scales a positive year down by 40%");
assert(approx(s.downside.npv, -353.94), `downside NPV = -353.94 (got ${s.downside.npv})`);
assert(s.downside.payback === null, "downside never pays back within 3 years (900 < 1100)");

// Ordering holds for any conventional investment.
assert(s.strong.npv > s.base.npv && s.base.npv > s.downside.npv, "strong > base > downside NPV");

// Strong and base have no overrun; strong outlay is unchanged.
assert(approx(s.strong.outlay, 1000) && approx(s.base.outlay, 1000), "only the downside case carries the overrun");

// --- A loss-making year must get WORSE in the downside, BETTER in the strong case
const l = computeInvestmentScenarios({
  outlay: 1000,
  yearlyCashFlows: [-200, 800, 800],
  discountRatePct: 0,
  strongPct: 50,
  downsidePct: 50,
  overrunPct: 0,
});
assert(approx(l.downside.cashFlows[1], -300), "downside: a -200 year becomes -300 (worse), not -100");
assert(approx(l.strong.cashFlows[1], -100), "strong: a -200 year becomes -100 (better)");
assert(approx(l.downside.cashFlows[2], 400), "downside: an 800 year becomes 400");

// --- Guards ------------------------------------------------------------------
const big = computeInvestmentScenarios({
  outlay: 1000,
  yearlyCashFlows: [500],
  discountRatePct: 0,
  strongPct: 0,
  downsidePct: 250,
  overrunPct: 0,
});
assert(big.downside.cashFlows[1] === 0, "a downside over 100% floors a positive year at 0, never negative");

const neg = computeInvestmentScenarios({
  outlay: 1000,
  yearlyCashFlows: [500],
  discountRatePct: 0,
  strongPct: -30,
  downsidePct: -30,
  overrunPct: -30,
});
assert(approx(neg.strong.npv, neg.base.npv) && approx(neg.downside.npv, neg.base.npv), "negative percentages are treated as 0, so cases collapse to base");

const none = computeInvestmentScenarios({ outlay: 0, yearlyCashFlows: [], discountRatePct: 10, strongPct: 25, downsidePct: 30, overrunPct: 20 });
assert(none.base.npv === 0 && none.downside.npv === 0, "empty input gives zeros, no crash");

// --- Safe to commit ----------------------------------------------------------
// cash 100,000; owes tax 5,000 + suppliers 8,000 + bills 2,000 = 15,000;
// monthly costs 10,000 + loans 2,000 = 12,000; 3-month buffer = 36,000.
// safe = 100,000 - 15,000 - 36,000 = 49,000.
const safe = computeSafeToCommit({
  cash: 100000,
  salesTaxPayable: 5000,
  accountsPayable: 8000,
  billsPayable: 2000,
  monthlyFixedCosts: 10000,
  monthlyLoanPayments: 2000,
  bufferMonths: 3,
});
assert(safe.alreadyOwed === 15000, `already owed = 15,000 (got ${safe.alreadyOwed})`);
assert(safe.monthlyObligations === 12000, "monthly obligations = costs + loan repayments");
assert(safe.buffer === 36000, `buffer = 36,000 (got ${safe.buffer})`);
assert(safe.safeToCommit === 49000, `safe to commit = 49,000 (got ${safe.safeToCommit})`);
assert(safe.shortfall === 0, "no shortfall when cash covers owed + buffer");

// Cash below owed + buffer: safe is 0 and the gap is reported, never negative.
const short = computeSafeToCommit({
  cash: 40000,
  salesTaxPayable: 5000,
  accountsPayable: 8000,
  billsPayable: 2000,
  monthlyFixedCosts: 10000,
  monthlyLoanPayments: 2000,
  bufferMonths: 3,
});
assert(short.safeToCommit === 0, "safe to commit floors at 0");
assert(short.shortfall === 11000, `shortfall = 40,000 - 51,000 = 11,000 short (got ${short.shortfall})`);

// A negative tax balance (refund position) or negative payables is NOT free money.
const refund = computeSafeToCommit({
  cash: 50000,
  salesTaxPayable: -3000,
  accountsPayable: -1000,
  billsPayable: 0,
  monthlyFixedCosts: 5000,
  monthlyLoanPayments: 0,
  bufferMonths: 2,
});
assert(refund.alreadyOwed === 0, "negative tax / payables are floored at 0, not added to cash");
assert(refund.safeToCommit === 40000, "50,000 - 0 - (2 x 5,000) = 40,000");

// Zero-month buffer: only what is already owed is set aside.
const noBuffer = computeSafeToCommit({
  cash: 20000, salesTaxPayable: 0, accountsPayable: 5000, billsPayable: 0,
  monthlyFixedCosts: 9000, monthlyLoanPayments: 0, bufferMonths: 0,
});
assert(noBuffer.buffer === 0 && noBuffer.safeToCommit === 15000, "0-month buffer leaves cash minus what is owed");

// Negative buffer months are treated as 0.
const negBuf = computeSafeToCommit({
  cash: 20000, salesTaxPayable: 0, accountsPayable: 0, billsPayable: 0,
  monthlyFixedCosts: 9000, monthlyLoanPayments: 0, bufferMonths: -4,
});
assert(negBuf.buffer === 0 && negBuf.safeToCommit === 20000, "negative buffer months are treated as 0");
