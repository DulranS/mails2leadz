// Seasonal view of revenue (lib/seasonalForecast.ts): honest gating, exact maths on hand cases, gaps, order independence.
// Run: npx tsx scripts/verify-seasonal-forecast.ts
import { computeSeasonalOutlook, SEASONAL_MIN_SPAN_MONTHS } from "../lib/seasonalForecast";
import * as fs from "fs";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) { checks++; if (!cond) { fails++; console.error("FAIL:", msg); } }
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const key = (abs: number) => { const y = Math.floor(abs / 12); return `${y}-${String(abs - y * 12 + 1).padStart(2, "0")}`; };
const START = 2023 * 12; // 2023-01
// Seasonal pattern averaging exactly 1: December high, June low.
const S = [1, 1, 1, 1, 1, 0.7, 1, 1, 1, 1, 1.3, 1.0]; // sums to 12.0? 10*1 + .7 + 1.3 = 12 -> yes (11 entries listed + one below)
const pattern = [1, 1, 1, 1, 1, 0.7, 1, 1, 1, 1, 1, 1.3]; // Jan..Dec, mean 1
ok(near(pattern.reduce((a, b) => a + b, 0), 12), "pattern averages 1");
void S;

const series = (months: number, level = 100) =>
  Array.from({ length: months }, (_, i) => ({ month: key(START + i), value: level * pattern[(START + i) % 12] }));

// --- 36 complete months of flat level 100 with the pattern; "today" is 2026-01 (so history is 2023-01..2025-12)
const hist36 = series(36);
const out = computeSeasonalOutlook(hist36, "2026-01", 3);
ok(out.ready, "36 months is ready");
ok(out.completeMonths === 36, `complete months 36, got ${out.completeMonths}`);
// Flat series -> trend = mean = 100 -> raw ratio = pattern. n = 3 per month -> w = 3/5 = 0.6.
const expectIdx = pattern.map((s) => 1 + 0.6 * (s - 1));
ok(out.indices !== null && out.indices.every((v, i) => near(v, expectIdx[i], 0.02)), "indices ~ 1 + 0.6 x (pattern - 1) on a flat series (the line's tiny tilt from the within-year pattern allows 0.02)");
ok(out.indices !== null && out.indices[11] < 1 + (pattern[11] - 1) && out.indices[5] > pattern[5], "shrinkage pulls Dec down and Jun up toward 1");
ok(out.indices !== null && near(out.indices.reduce((a, b) => a + b, 0) / 12, 1, 1e-12), "indices average exactly 1");
ok(out.strongest?.calendarMonth === 12 && out.weakest?.calendarMonth === 6, "strongest Dec, weakest Jun");
ok(out.projections.length === 3 && out.projections[0].month === "2026-01", "projects the 3 months after the last booked month");
ok(out.projections.every((p) => near(p.seasonal, p.trend * p.index)), "seasonal = trend x index");

// --- Gating: 23-month span is not ready, 24 is.
ok(!computeSeasonalOutlook(series(23), "2026-01", 3).ready, "23 months not ready");
const g24 = computeSeasonalOutlook(series(24), "2025-01", 3);
ok(g24.ready, "24 months ready (each calendar month seen twice)");
ok(SEASONAL_MIN_SPAN_MONTHS === 24, "min span constant");
ok(!computeSeasonalOutlook([], "2026-01", 3).ready, "empty not ready");
ok(computeSeasonalOutlook([], "2026-01", 3).projections.length === 0, "not ready gives no projections");
ok(!computeSeasonalOutlook(hist36, "bad", 3).ready, "bad as-of month not ready");

// --- Current (incomplete) month is excluded even when present with a tiny value.
const withPartial = [...hist36, { month: "2026-01", value: 1 }];
const wp = computeSeasonalOutlook(withPartial, "2026-01", 3);
ok(wp.completeMonths === 36 && wp.indices !== null && out.indices !== null && wp.indices.every((v, i) => near(v, out.indices![i])), "current month ignored");
// ...but projections start after the last booked month (the partial one), matching the main forecast.
ok(wp.projections[0].month === "2026-02", `projections start after the last booked month, got ${wp.projections[0].month}`);

// --- Order independence, duplicates ignored (first one wins), junk ignored.
const shuffled = [...hist36].reverse();
const sh = computeSeasonalOutlook(shuffled, "2026-01", 3);
ok(sh.indices !== null && out.indices !== null && sh.indices.every((v, i) => near(v, out.indices![i], 1e-9)), "order independent");
const dup = computeSeasonalOutlook([...hist36, { month: "2024-03", value: 99999 }, { month: "x", value: 5 }, { month: "2024-13", value: 5 }, { month: "2024-04", value: NaN }], "2026-01", 3);
ok(dup.completeMonths === 36 && dup.indices !== null && out.indices !== null && dup.indices.every((v, i) => near(v, out.indices![i])), "duplicates and junk ignored");

// --- Gaps are skipped, not zero: drop 2024-05 and 2024-06; each calendar month still has >= 2 observations.
const gapped = hist36.filter((h) => h.month !== "2024-05" && h.month !== "2024-06");
const gp = computeSeasonalOutlook(gapped, "2026-01", 3);
ok(gp.ready && gp.completeMonths === 34, "gaps tolerated");
ok(gp.weakest?.calendarMonth === 6 && gp.strongest?.calendarMonth === 12, "season still found with gaps");
// A calendar month seen once only -> not ready (drop two of three Junes).
const thinJune = hist36.filter((h) => !["2023-06", "2024-06"].includes(h.month));
ok(!computeSeasonalOutlook(thinJune, "2026-01", 3).ready, "a calendar month with 1 observation is not ready");

// --- Trend: with growth the indices are about the pattern, not about the growth.
const growth = Array.from({ length: 36 }, (_, i) => ({ month: key(START + i), value: (100 + 5 * i) * pattern[(START + i) % 12] }));
const gr = computeSeasonalOutlook(growth, "2026-01", 6);
ok(gr.ready && gr.strongest?.calendarMonth === 12 && gr.weakest?.calendarMonth === 6, "growth does not turn December-high into a growth artefact");
ok(gr.projections[0].trend > 100 + 5 * 30, "trend continues upward");
ok(gr.indices!.every((v) => v > 0.5 && v < 1.5), "indices stay sane under growth");

// --- A zero/negative trend never divides: all-zero revenue is not ready, no NaN.
const zeros = Array.from({ length: 30 }, (_, i) => ({ month: key(START + i), value: 0 }));
const z = computeSeasonalOutlook(zeros, "2026-01", 3);
ok(!z.ready && z.projections.length === 0, "all-zero revenue not ready");

// --- Seasonal projection never negative.
const falling = Array.from({ length: 36 }, (_, i) => ({ month: key(START + i), value: Math.max(0, 400 - 11 * i) }));
const fl = computeSeasonalOutlook(falling, "2026-01", 24);
ok(fl.projections.every((p) => p.seasonal >= 0 && Number.isFinite(p.seasonal)), "never negative or NaN");

// --- Year-boundary keys.
ok(computeSeasonalOutlook(hist36, "2026-01", 14).projections[12].month === "2027-01", "month keys roll the year");

// --- Wiring: shown on the dashboard, documented, books files untouched by this module.
const dash = fs.readFileSync("app/dashboard/page.tsx", "utf8");
ok(dash.includes("computeSeasonalOutlook"), "dashboard uses the seasonal view");
const src = fs.readFileSync("lib/seasonalForecast.ts", "utf8");
ok(!/from\s+["']\.\/(calculations|types|firebase)/.test(src), "module is pure: imports nothing from the books");

console.log(fails === 0 ? `OK: ${checks} checks` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
