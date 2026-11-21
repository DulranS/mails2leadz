// Verifies lib/calculations.ts's capital-budgeting functions
// (computeNPV/computeIRR/computePaybackPeriod/computeWACC), surfaced on
// the "what-if calculator for a big one-off purchase" section of
// app/profitability/page.tsx, against known, hand-computable values —
// the same reason this session wrote a verification script for the
// production/BOM math: typechecking proves the code compiles, not that
// the formula is right, and this is exactly the kind of arithmetic where
// an off-by-one in a discounting exponent silently produces a plausible-
// looking but wrong number.
//
// Run: npx tsx scripts/verify-capital-budgeting-math.ts

import { computeNPV, computeIRR, computePaybackPeriod, computeWACC } from "../lib/calculations";

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

// NPV at 0% discount is just the sum of undiscounted cash flows.
const npvZeroRate = computeNPV([-1000, 400, 400, 400], 0);
assert(approx(npvZeroRate, 200), `NPV at 0% discount = sum of cash flows (got ${npvZeroRate}, want 200)`);

// Textbook case: invest 100, get back 110 next period. At exactly the
// investment's own return rate (10%), NPV must be ~0, and IRR must be ~10%.
const npvAtOwnRate = computeNPV([-100, 110], 10);
assert(approx(npvAtOwnRate, 0), `NPV([-100, 110], 10%) ≈ 0 (got ${npvAtOwnRate})`);
const irrSimple = computeIRR([-100, 110]);
assert(irrSimple !== null && approx(irrSimple, 10, 0.1), `IRR([-100, 110]) ≈ 10% (got ${irrSimple})`);

// A slightly larger, still hand-checkable case: 1000 out, 500/500/500 back.
// NPV at 10%: -1000 + 500/1.1 + 500/1.1^2 + 500/1.1^3 = -1000 + 454.55 + 413.22 + 375.66 ≈ 243.43
const npvMultiPeriod = computeNPV([-1000, 500, 500, 500], 10);
assert(approx(npvMultiPeriod, 243.43, 0.5), `NPV([-1000,500,500,500], 10%) ≈ 243.43 (got ${npvMultiPeriod})`);

// Cash flows that never turn positive (all outflows) -> IRR has no answer,
// must return null rather than some misleading number.
const irrNoRoot = computeIRR([-100, -50, -20]);
assert(irrNoRoot === null, `IRR of an all-negative cash flow series is null (got ${irrNoRoot})`);

// Payback period: -100, then 40/40/40 — crosses zero partway through
// period 3 (cumulative: -100, -60, -20, +20), so payback = 2.5 periods.
const payback = computePaybackPeriod([-100, 40, 40, 40]);
assert(payback !== null && approx(payback, 2.5), `payback period ≈ 2.5 (got ${payback})`);

// Payback period 0 when the very first cash flow is already non-negative
// (no investment to pay back at all).
const paybackImmediate = computePaybackPeriod([100, 40]);
assert(paybackImmediate === 0, `payback period is 0 when there's no negative outlay (got ${paybackImmediate})`);

// WACC: 70% equity at 15%, 30% debt at 8%, 30% tax ->
// 0.7*15 + 0.3*8*(1-0.3) = 10.5 + 1.68 = 12.18
const wacc = computeWACC({ equityValue: 70, debtValue: 30, costOfEquityPct: 15, costOfDebtPct: 8, taxRatePct: 30 });
assert(wacc !== null && approx(wacc, 12.18), `WACC(70/30, 15%/8%, 30% tax) ≈ 12.18% (got ${wacc})`);

// WACC with no capital at all -> null, not a divide-by-zero NaN.
const waccNoCapital = computeWACC({ equityValue: 0, debtValue: 0, costOfEquityPct: 15, costOfDebtPct: 8, taxRatePct: 30 });
assert(waccNoCapital === null, `WACC with zero total capital is null, not NaN (got ${waccNoCapital})`);

// All-equity WACC should just equal the cost of equity (debt weight is 0).
const waccAllEquity = computeWACC({ equityValue: 100, debtValue: 0, costOfEquityPct: 18, costOfDebtPct: 9, taxRatePct: 25 });
assert(waccAllEquity !== null && approx(waccAllEquity, 18), `all-equity WACC = cost of equity (got ${waccAllEquity})`);

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
