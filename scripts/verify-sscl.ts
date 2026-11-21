// SSCL registration check (lib/vatThreshold.ts SSCL_LK, v333, KPMG on Act No. 10 of 2026). Run: tsx scripts/verify-sscl.ts
import { readFileSync } from "node:fs";
import { SSCL_LK, vatThresholdStatus, vatTurnover } from "../lib/vatThreshold";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
const st = (last12Months: number, bestQuarter: number) => vatThresholdStatus({ currency: "LKR", last12Months, bestQuarter }, SSCL_LK);

ok(SSCL_LK.quarter === 9_000_000, "the quarterly SSCL threshold is LKR 9 million");
ok(SSCL_LK.annual === 36_000_000, "the four-quarter SSCL threshold is LKR 36 million");
ok(st(1_000_000, 9_000_001).status === "over", "a quarter just over LKR 9m is over, even with a low year");
ok(st(36_000_001, 1_000_000).status === "over", "a year just over LKR 36m is over, even with a low quarter");
ok(st(20_000_000, 2_000_000).status === "below", "well under both is below");
ok(st(29_000_000, 1_000_000).status === "approaching", "80% of the LKR 36m year is approaching");
ok(st(1_000_000, 7_200_000).status === "approaching", "80% of the LKR 9m quarter is approaching");
ok(st(36_000_000, 9_000_000).status === "approaching", "exactly the limit is not over (strictly above)");
ok(st(60_000_000, 0).status === "over", "the old LKR 60m VAT figure is far over the SSCL limit (not used for SSCL)");

const months = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, salesRevenue: 3_200_000 }));
const t = vatTurnover(months, "2026-12");
ok(t.bestQuarter === 9_600_000, "the best quarter is three months of sales (LKR 9.6m here)");
ok(st(t.last12Months, t.bestQuarter).status === "over", "a steady LKR 3.2m a month is over the quarterly SSCL threshold");

const page = readFileSync(new URL("../app/statements/page.tsx", import.meta.url), "utf8");
ok(page.includes("bestQuarter={t.bestQuarter}"), "the SSCL panel receives the real best quarter");
ok(!page.includes("bestQuarter: 0"), "the SSCL panel no longer passes a zero quarter");
ok(page.includes("LKR 9 million in a quarter"), "the panel states the quarterly threshold");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
