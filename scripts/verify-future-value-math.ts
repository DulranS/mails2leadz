// Verifies lib/calculations.ts's computeFutureValue/
// computeFutureValueOfSeries — the "what will this grow to" companion to
// the existing NPV/IRR/payback/WACC calculator on
// app/profitability/page.tsx — against known values, the same way this
// session verified every other piece of financial math rather than
// trusting a formula compiles just because it typechecks.
//
// Run: npx tsx scripts/verify-future-value-math.ts

import { computeFutureValue, computeFutureValueOfSeries, computeNPV } from "../lib/calculations";

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

// No growth at all -> the amount is simply unchanged, however many years pass.
const fvNoGrowth = computeFutureValue(1000, 0, 5);
assert(approx(fvNoGrowth, 1000), `FV(1000, 0%, 5yr) = 1000, unchanged (got ${fvNoGrowth})`);

// One year at 10% -> textbook simple case.
const fvOneYear = computeFutureValue(1000, 10, 1);
assert(approx(fvOneYear, 1100), `FV(1000, 10%, 1yr) = 1100 (got ${fvOneYear})`);

// Two years at 10%, compounded -> 1000 × 1.1² = 1210, not 1200 (which
// would be the wrong, simple-interest answer — this is the check that
// actually distinguishes compounding from a naive multiply).
const fvTwoYears = computeFutureValue(1000, 10, 2);
assert(approx(fvTwoYears, 1210), `FV(1000, 10%, 2yr) = 1210, compounded not simple interest (got ${fvTwoYears})`);

// Series with 0% growth -> just the contributions added up.
const seriesNoGrowth = computeFutureValueOfSeries(100, 0, 5);
assert(approx(seriesNoGrowth, 500), `FV of series(100/yr, 0%, 5yr) = 500, plain sum (got ${seriesNoGrowth})`);

// Series with growth: 1000/year at 5% for 3 years ->
// 1000 × ((1.05³ − 1) / 0.05) = 1000 × 3.1525 = 3152.50
const seriesWithGrowth = computeFutureValueOfSeries(1000, 5, 3);
assert(approx(seriesWithGrowth, 3152.5, 0.5), `FV of series(1000/yr, 5%, 3yr) ≈ 3152.50 (got ${seriesWithGrowth})`);

// A series' future value must be at least as large as the raw
// contributions whenever the rate is positive — growth can't be negative
// from a positive rate.
assert(seriesWithGrowth > 1000 * 3, "series future value exceeds the raw contributions when the rate is positive");

// Cross-check against the *other* direction: computeNPV already discounts
// a future cash flow back to today. A single future amount FV received in
// year n, discounted at rate r, should equal the present value that grew
// into it via computeFutureValue at that same rate — i.e. the two
// functions are proper inverses of each other, not just individually
// plausible-looking.
const presentValue = 5000;
const rate = 8;
const yearsOut = 4;
const grownForward = computeFutureValue(presentValue, rate, yearsOut);
const cashFlows = [0, 0, 0, 0, grownForward]; // nothing until year 4, then the grown amount
const discountedBack = computeNPV(cashFlows, rate);
assert(
  approx(discountedBack, presentValue, 0.5),
  `discounting computeFutureValue's own output back via computeNPV returns the original present value (${presentValue} vs ${discountedBack.toFixed(2)})`
);

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
