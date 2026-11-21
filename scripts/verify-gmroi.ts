// Empirical check for gmroiAnnualized (lib/calculations.ts).
// Run: npx tsx scripts/verify-gmroi.ts
import { computeFinancialHealthRatios } from "../lib/calculations";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const zeroed = (o: Record<string, unknown>) => new Proxy(o, { get: (t, k) => (k in t ? (t as any)[k] : 0) });
const months = (n: number, revenue: number, cogs: number) =>
  Array.from({ length: n }, () => zeroed({ totalRevenue: revenue, cogs, grossProfit: revenue - cogs })) as any;

// 12 months: revenue 10k/mo, cogs 6k/mo => gross profit 48k; stock at cost 24k.
let h = computeFinancialHealthRatios(months(12, 10000, 6000), zeroed({ inventoryValue: 24000 }) as any, 12);
const expected = (48000 / 24000) * (365 / 360);
assert(h.gmroiAnnualized !== null && Math.abs(h.gmroiAnnualized - expected) < 1e-9, `GP 48k on stock 24k => ${expected.toFixed(3)} (annualized)`);

// Reconciles with turnover: GMROI = turnover x GP / COGS.
const viaTurnover = (h.inventoryTurnoverAnnualized as number) * (48000 / 72000);
assert(Math.abs((h.gmroiAnnualized as number) - viaTurnover) < 1e-9, "GMROI = inventory turnover x (gross profit / COGS)");

// 6-month window is annualized, not left as a half-year figure.
h = computeFinancialHealthRatios(months(6, 10000, 6000), zeroed({ inventoryValue: 24000 }) as any, 6);
assert(Math.abs((h.gmroiAnnualized as number) - (24000 / 24000) * (365 / 180)) < 1e-9, "6-month window annualized");

// No stock or no sales => null (no divide-by-zero).
h = computeFinancialHealthRatios(months(12, 10000, 6000), zeroed({ inventoryValue: 0 }) as any, 12);
assert(h.gmroiAnnualized === null, "no stock => null");
h = computeFinancialHealthRatios(months(12, 0, 0), zeroed({ inventoryValue: 24000 }) as any, 12);
assert(h.gmroiAnnualized === null, "no revenue => null");

// Selling below cost shows as negative, not hidden.
h = computeFinancialHealthRatios(months(12, 5000, 6000), zeroed({ inventoryValue: 24000 }) as any, 12);
assert((h.gmroiAnnualized as number) < 0, "selling below cost => negative GMROI");
