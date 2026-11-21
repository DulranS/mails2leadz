// Per-share figures (lib/perShare.ts and the profit split screen): earnings per share, value per share, the implied price-to-earnings ratio, the cases with no
// share count or no earnings, and the wiring. Worked numbers. Run: npx tsx scripts/verify-per-share.ts
import fs from "node:fs";
import { eps, valuePerShare, impliedPe } from "../lib/perShare";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(eps(1000000, 1000000) === 1, "1m of profit after tax over 1m shares is 1.00 per share");
ok(valuePerShare(4500000, 1000000) === 4.5, "an equity value of 4.5m over 1m shares is 4.50 per share");
ok(impliedPe(4.5, 1) === 4.5, "a value of 4.50 per share on earnings of 1.00 per share implies a price-to-earnings ratio of 4.5");
ok(eps(500000, 2000000) === 0.25, "500k of profit over 2m shares is 0.25 per share (diluted counts reduce it)");
ok(eps(1000000, undefined) === null && valuePerShare(4500000, 0) === null, "with no share count entered, no per-share figure is shown");
ok(eps(-200000, 1000000) === -0.2 && impliedPe(4.5, -0.2) === null, "a loss gives a negative EPS; no P/E is implied from a loss");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("eps(") && screen.includes("valuePerShare(") && screen.includes("impliedPe("), "the profit split screen shows EPS, value per share and the implied P/E");
ok(screen.includes("sharesInIssue"), "the share count is entered on the screen, not assumed");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
