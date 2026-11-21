// VAT registration check (v291, lib/vatThreshold.ts): the two thresholds (LKR 60m in 12 months, LKR 15m in a quarter), the 80% warning, the
// exact-edge cases, the cut-off at the chosen month, the currency gate, and the wiring on the Tax tab. Worked numbers.
import fs from "node:fs";
import path from "node:path";
import { vatThresholdStatus, vatTurnover, VAT_LK } from "../lib/vatThreshold";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const months = (vals: number[], start = "2026-01") => vals.map((v, i) => {
  const d = new Date(`${start}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i);
  return { month: d.toISOString().slice(0, 7), salesRevenue: v };
});

// Thresholds as stated
ok(VAT_LK.annual === 60_000_000 && VAT_LK.quarter === 15_000_000 && VAT_LK.currency === "LKR", "the thresholds are LKR 60 million a year and LKR 15 million a quarter");

// Exactly at the threshold: not over, but approaching (100% of it)
const exact = vatTurnover(months(Array(12).fill(5_000_000)), "2026-12");
ok(exact.last12Months === 60_000_000 && exact.bestQuarter === 15_000_000, "12 months of 5m: 60m in the year, 15m in the best quarter");
ok(vatThresholdStatus({ currency: "LKR", ...exact }).status === "approaching", "exactly at the threshold is approaching, not over (only more than the threshold is over)");

// Over the annual threshold by one cent
const over1 = vatTurnover(months([...Array(11).fill(5_000_000), 5_000_000.01]), "2026-12");
ok(vatThresholdStatus({ currency: "LKR", ...over1 }).status === "over", "60,000,000.01 in 12 months is over");

// Over the quarter threshold, with a low annual total
const quarterOver = vatTurnover(months([...Array(9).fill(0), 5_000_001, 5_000_001, 5_000_001]), "2026-12");
ok(quarterOver.bestQuarter > VAT_LK.quarter && quarterOver.last12Months < VAT_LK.annual, "a burst of sales in one quarter is caught");
ok(vatThresholdStatus({ currency: "LKR", ...quarterOver }).status === "over", "more than 15m in one quarter is over, even with a low annual total");

// 80%: 48m a year is approaching; 47.9m is below
ok(vatThresholdStatus({ currency: "LKR", ...vatTurnover(months(Array(12).fill(4_000_000)), "2026-12") }).status === "approaching", "48m in a year (80%) is approaching");
ok(vatThresholdStatus({ currency: "LKR", ...vatTurnover(months(Array(12).fill(3_991_666.67)), "2026-12") }).status === "below", "just under 80% of both thresholds is below");

// Cut-off: months after the chosen month do not count
const half = vatTurnover(months(Array(12).fill(5_000_000)), "2026-06");
ok(half.last12Months === 30_000_000 && half.bestQuarter === 15_000_000, "to June only, 6 months count: 30m in the year, 15m in the best quarter");

// Fewer than three months: the stretch is all there is
const two = vatTurnover(months([4_000_000, 4_000_000]), "2026-02");
ok(two.bestQuarter === 8_000_000 && two.last12Months === 8_000_000, "two months: the best stretch is both months");

// Only LKR is checked: thresholds are in LKR
ok(vatThresholdStatus({ currency: "USD", last12Months: 999_999_999, bestQuarter: 999_999_999 }).status === "not_applicable", "a business in another currency is not checked against LKR thresholds");

// Wiring: the Tax tab shows the check, and it reads the business's own revenue
const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/statements/page.tsx"), "utf8");
ok(page.includes("<VatRegistrationCard months={monthlyPnL}") && page.includes("function VatRegistrationCard"), "the Tax tab shows the VAT registration check from the monthly figures");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
