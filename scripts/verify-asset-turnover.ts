// Empirical check for assetTurnoverAnnualized (lib/calculations.ts).
// Run: npx tsx scripts/verify-asset-turnover.ts
import { computeFinancialHealthRatios } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
// Any field the function reads but this test doesn't care about reads as 0.
const zeroed = (o: Record<string, unknown>) => new Proxy(o, { get: (t, k) => (k in t ? (t as any)[k] : 0) });

const months = (n: number, revenue: number) =>
  Array.from({ length: n }, () => zeroed({ totalRevenue: revenue })) as any;

let h = computeFinancialHealthRatios(months(12, 10000), zeroed({ totalAssets: 60000 }) as any, 12);
const expected = (120000 / 60000) * (365 / 360);
assert(h.assetTurnoverAnnualized !== null && Math.abs(h.assetTurnoverAnnualized - expected) < 1e-9, `12 months, revenue 120k, assets 60k => ${expected.toFixed(3)}x (annualized)`);

h = computeFinancialHealthRatios(months(6, 10000), zeroed({ totalAssets: 60000 }) as any, 6);
assert(Math.abs((h.assetTurnoverAnnualized as number) - (60000 / 60000) * (365 / 180)) < 1e-9, "6-month window is annualized, not left as a half-year figure");

h = computeFinancialHealthRatios(months(12, 10000), zeroed({ totalAssets: 0 }) as any, 12);
assert(h.assetTurnoverAnnualized === null, "no assets => null (no divide-by-zero)");

h = computeFinancialHealthRatios(months(12, 0), zeroed({ totalAssets: 60000 }) as any, 12);
assert(h.assetTurnoverAnnualized === null, "no revenue => null");
