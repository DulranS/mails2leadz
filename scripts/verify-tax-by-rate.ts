// Tax split by rate (lib/taxByRate.ts). Hand-worked numbers.
// Run: npx tsx scripts/verify-tax-by-rate.ts
import { taxByRate, hasTaxedRows } from "../lib/taxByRate";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// Two rates: 18% on 1000 + 500, 8% on 200, and 300 exempt.
const rows = taxByRate(
  [{ net: 1000, tax: 180 }, { net: 500, tax: 90 }, { net: 200, tax: 16 }, { net: 300 }, { net: 100, tax: 0 }],
  [18, 8]
);
const r18 = rows.find((r) => r.ratePct === 18)!;
const r8 = rows.find((r) => r.ratePct === 8)!;
const none = rows.find((r) => r.ratePct === null)!;
ok(r18.base === 1500 && r18.tax === 270 && r18.lines === 2, "18%: base 1500, tax 270, 2 lines");
ok(r8.base === 200 && r8.tax === 16 && r8.lines === 1, "8%: base 200, tax 16");
ok(none.base === 400 && none.tax === 0 && none.lines === 2, "no tax: base 400 (300 + 100), 2 lines");
ok(rows[rows.length - 1].ratePct === null, "the no-tax row is last");
ok(rows[0].ratePct === 18 && rows[1].ratePct === 8, "taxed rows run highest rate first");
// Totals are preserved: nothing lost or doubled by grouping.
ok(rows.reduce((s, r) => s + r.tax, 0) === 286 && rows.reduce((s, r) => s + r.base, 0) === 2100, "grouping keeps the totals (tax 286, base 2100)");

// Rounding: 33.33 at 18% = 6.00 (5.9994); a line of 0.33 at 18% = 0.06 (0.0594).
const small = taxByRate([{ net: 33.33, tax: 6.0 }, { net: 0.33, tax: 0.06 }], [18]);
ok(small.length === 1 && small[0].ratePct === 18 && small[0].lines === 2, "cent-rounded tax still lands on its rate");

// A rate that is no longer known (the shop rate changed): shown at the rate it works out to, not forced into another.
const old = taxByRate([{ net: 1000, tax: 150 }, { net: 1000, tax: 180 }], [18]);
ok(old.length === 2 && old.some((r) => r.ratePct === 15 && r.base === 1000 && r.tax === 150) && old.some((r) => r.ratePct === 18), "an unknown rate keeps its own computed row (15%)");

// The tolerance is one cent, no more: 18.50 tax on 100 is NOT 18% (that would be 18.00), so it keeps its own 18.5% row.
const off = taxByRate([{ net: 100, tax: 18.5 }], [18]);
ok(off.length === 1 && off[0].ratePct === 18.5, "a line half a unit off the known rate is not forced into it");

// Ambiguity: when two known rates both fit within a cent, the closer one wins.
const amb = taxByRate([{ net: 0.5, tax: 0.04 }], [8, 8.5]);
ok(amb.length === 1 && amb[0].ratePct === 8, "closest known rate wins (0.5 at 8% = 0.04 exactly)");

// Bad data never throws or poisons totals.
const bad = taxByRate([{ net: NaN, tax: 5 }, { net: 100, tax: NaN }, { net: 100, tax: -3 }], [18]);
ok(bad.every((r) => Number.isFinite(r.base) && Number.isFinite(r.tax)), "NaN and negative values stay finite");
ok(taxByRate([], [18]).length === 0 && taxByRate([], []).length === 0, "no lines: no rows");

ok(hasTaxedRows(rows) === true && hasTaxedRows(taxByRate([{ net: 10 }], [18])) === false && hasTaxedRows([]) === false, "worth showing only when something was taxed");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
