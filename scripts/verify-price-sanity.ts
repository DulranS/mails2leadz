// Empirical check for the advisory "usual price" hint on the sale form (lib/priceSanity.ts).
//
// Run: npx tsx scripts/verify-price-sanity.ts
import { priceSanity, PRICE_LOW_RATIO, PRICE_HIGH_RATIO } from "../lib/priceSanity";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const kind = (e: number, u: number | undefined | null) => priceSanity(e, u)?.kind ?? null;

// The mistakes it exists for: a dropped zero and an extra zero
check("dropped zero (120 vs 1200) -> low", kind(120, 1200) === "low");
check("extra zero (12000 vs 1200) -> high", kind(12000, 1200) === "high");
check("ratio is reported", Math.abs((priceSanity(120, 1200)?.ratio ?? 0) - 0.1) < 1e-9 && Math.abs((priceSanity(12000, 1200)?.ratio ?? 0) - 10) < 1e-9);

// Normal trading must stay silent: discounts, clearance up to half price, premium up to double
for (const e of [1200, 1000, 900, 700, 601, 600, 1800, 2000, 2399, 2400]) check(`quiet at ${e} vs 1200`, kind(e, 1200) === null, String(kind(e, 1200)));
// Edges
check("just under half -> low", kind(599.99, 1200) === "low");
check("just over double -> high", kind(2400.01, 1200) === "high");
check("constants", PRICE_LOW_RATIO === 0.5 && PRICE_HIGH_RATIO === 2);

// Nothing to compare, nothing typed, or junk -> no hint (never a false alarm, never a crash)
check("no usual price", kind(100, undefined) === null && kind(100, null) === null && kind(100, 0) === null && kind(100, -5) === null);
check("nothing typed", kind(0, 1200) === null && kind(-1, 1200) === null);
check("NaN/Infinity", kind(NaN, 1200) === null && kind(Infinity, 1200) === null && kind(100, NaN) === null && kind(100, Infinity) === null);
// Small-priced items work the same way
check("cheap item dropped zero", kind(2, 20) === "low" && kind(200, 20) === "high" && kind(15, 20) === null);

console.log(`price-sanity: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
