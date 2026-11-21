// Verifies lib/calculations.ts's computeStartupCapitalNeeded — the
// "how much capital do I need to start" calculator added to
// app/profitability/page.tsx, prefilled from the same monthlyFixedCosts
// figure computeBreakEven already computes elsewhere on that page.
//
// Run: npx tsx scripts/verify-startup-capital-math.ts

import { computeStartupCapitalNeeded } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// Standard case: setup costs + (monthly fixed costs × buffer months).
const standard = computeStartupCapitalNeeded(500000, 50000, 6);
assert(standard === 800000, `500000 + (50000 × 6) = 800000 (got ${standard})`);

// No one-time costs at all -> just the buffer.
const noSetup = computeStartupCapitalNeeded(0, 50000, 12);
assert(noSetup === 600000, `0 + (50000 × 12) = 600000, buffer-only case (got ${noSetup})`);

// No ongoing fixed costs -> just the one-time setup costs.
const noFixed = computeStartupCapitalNeeded(100000, 0, 6);
assert(noFixed === 100000, `100000 + (0 × 6) = 100000, setup-only case (got ${noFixed})`);

// Zero buffer months -> the buffer term drops out entirely regardless of
// the monthly figure, not a NaN or a leftover partial month.
const zeroBuffer = computeStartupCapitalNeeded(100000, 10000, 0);
assert(zeroBuffer === 100000, `100000 + (10000 × 0) = 100000, zero buffer (got ${zeroBuffer})`);

// Nothing entered at all -> zero, not NaN/undefined.
const nothing = computeStartupCapitalNeeded(0, 0, 0);
assert(nothing === 0, `0 + (0 × 0) = 0 (got ${nothing})`);

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
