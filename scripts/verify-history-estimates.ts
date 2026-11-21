// Estimates for the staged project from the business's own history (lib/decisionTree.ts estimateFromHistory): the share of months that rose,
// the average rise and fall, the minimum history it needs, and the wiring to the screen. Run: npx tsx scripts/verify-history-estimates.ts
import fs from "node:fs";
import { estimateFromHistory } from "../lib/decisionTree";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// Six months: 100, 120, 96, 115.2, 92.16, 110.59. Ratios: 1.2 up, 0.8 down, 1.2 up, 0.8 down, 1.2 up. Up 3 of 5; ups average 1.2; downs 0.8.
const e = estimateFromHistory([100, 120, 96, 115.2, 92.16, 110.592]);
ok(e !== null && e.probUp === 0.6 && e.up === 1.2 && e.down === 0.8 && e.months === 6, "the chance of a rise is the share of months that rose (3 of 5), and the factors are the average rise and fall");
ok(estimateFromHistory([100, 110, 121, 133, 146]) === null, "five months is not enough to estimate from; six is the minimum");
ok(estimateFromHistory([100, 110, 121, 133, 146, 160]) === null, "a history with only rises gives no estimate of a fall, so none is suggested");
ok(estimateFromHistory([100, 90, 81, 73, 66, 59]) === null, "a history with only falls gives no estimate of a rise, so none is suggested");
ok(estimateFromHistory([100, 0, 120, 100, 90, 110, 95]) !== null, "months with no revenue are left out rather than breaking the estimate");
ok(read("components/ops/FinanceChoicesPanel.tsx").includes("estimateFromHistory(monthlyPnL.map((m) => m.totalRevenue))") && read("components/ops/FinanceChoicesPanel.tsx").includes("Use these"), "the screen offers the history-based figures, and the owner chooses to use them");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
