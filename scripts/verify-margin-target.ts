// Net margin target vs actual (lib/marginTarget.ts) and its wiring. Hand-worked numbers.
// Run: npx tsx scripts/verify-margin-target.ts
import fs from "node:fs";
import { marginVsTarget } from "../lib/marginTarget";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const m = (month: string, totalRevenue: number, netProfitPreTax: number) => ({ month, totalRevenue, netProfitPreTax });
const NOW = "2026-10";

// Target 15%. Jul: 100 on 1000 = 10% (-5). Aug: 150 on 1000 = 15% (on target, 0). Sep: 80 on 800 = 10% (-5). Oct (running): 30 on 100 = 30% (+15).
const r = marginVsTarget([m("2026-07", 1000, 100), m("2026-08", 1000, 150), m("2026-09", 800, 80), m("2026-10", 100, 30)], 15, NOW)!;
ok(r.rows.map((x) => x.month).join() === "2026-07,2026-08,2026-09,2026-10", "three complete months then the running one, oldest first");
ok(r.rows[0].marginPct === 10 && r.rows[0].gapPts === -5 && r.rows[0].onTarget === false, "July: 10% against 15%, 5 points short");
ok(r.rows[1].marginPct === 15 && r.rows[1].gapPts === 0 && r.rows[1].onTarget === true, "August: exactly on target counts as on target");
ok(r.rows[3].partial && r.rows[3].marginPct === 30 && r.rows[3].onTarget === true && !r.rows[2].partial, "only the running month is marked partial");
ok(r.monthsBelowInARow === 1, "September is below, August was on target: 1 month below in a row (the running month does not count)");
const two = marginVsTarget([m("2026-08", 1000, 100), m("2026-09", 800, 80)], 15, NOW)!;
ok(two.monthsBelowInARow === 2, "two complete months below in a row");
// A month with no revenue is neither a hit nor a miss and does not break or extend a streak.
const gap = marginVsTarget([m("2026-07", 1000, 100), m("2026-08", 0, -50), m("2026-09", 800, 80)], 15, NOW)!;
ok(gap.rows[1].marginPct === null && gap.rows[1].onTarget === null && gap.monthsBelowInARow === 2, "a month with no revenue has no margin, is skipped in the streak (Sep and Jul are both below: 2)");
// Losses: negative margin is below.
const loss = marginVsTarget([m("2026-09", 1000, -100)], 15, NOW)!;
ok(loss.rows[0].marginPct === -10 && loss.rows[0].gapPts === -25 && loss.monthsBelowInARow === 1, "a loss is -10%, 25 points short");
// Only the last N complete months, and nothing from the future.
const many = marginVsTarget([m("2026-04", 1, 1), m("2026-05", 1, 1), m("2026-06", 1, 1), m("2026-07", 1, 1), m("2026-11", 1, 1)], 15, NOW)!;
ok(many.rows.map((x) => x.month).join() === "2026-05,2026-06,2026-07", "the last 3 complete months; a future month is ignored; no running month row when there is no data for it");
// No target, or a bad one: nothing.
ok(marginVsTarget([m("2026-09", 1000, 100)], 0, NOW) === null && marginVsTarget([m("2026-09", 1000, 100)], undefined, NOW) === null && marginVsTarget([m("2026-09", 1000, 100)], -5, NOW) === null && marginVsTarget([m("2026-09", 1000, 100)], 150, NOW) === null && marginVsTarget([m("2026-09", 1000, 100)], NaN, NOW) === null, "no target, zero, negative, over 100 or NaN: no comparison");
ok(marginVsTarget([], 15, NOW)!.rows.length === 0 && marginVsTarget([], 15, "junk") === null, "no months: an empty list; a bad current month: nothing");
ok(marginVsTarget([m("2026-09", NaN, NaN)], 15, NOW)!.rows[0].marginPct === null, "NaN figures are treated as no revenue, never as a number");

// Wiring: the setting is saved, defaulted, shown on the dashboard, and read-only.
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(/targetNetMarginPct\?: number;/.test(types) && /targetNetMarginPct: 0,/.test(types), "Settings has the target, off (0) by default");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(/targetNetMarginPct: Math\.min\(100, Math\.max\(0, Number\(targetNetMarginPct\) \|\| 0\)\)/.test(settings), "Settings saves it clamped to 0-100");
const dash = fs.readFileSync("app/dashboard/page.tsx", "utf8");
ok(/marginVsTarget\(monthlyPnL, settings\.targetNetMarginPct/.test(dash), "the dashboard compares the P&L months with the target");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
