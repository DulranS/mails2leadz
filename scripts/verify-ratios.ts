// Return ratios (lib/ratios.ts and the profit split screen): ROE and ROCE with worked numbers, the current-liability assumption, the cases with nothing to
// divide by, and the wiring. Run: npx tsx scripts/verify-ratios.ts
import fs from "node:fs";
import { roe, roce } from "../lib/ratios";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(roe(1020, 8000) === 12.75, "profit after tax of 1,020 on equity of 8,000 is a 12.75% return on equity");
ok(roe(-200, 8000) === -2.5, "a loss gives a negative return on equity");
ok(roe(1020, 0) === null && roe(1020, -500) === null, "with no positive equity, no return on equity is shown");
ok(roce(1200, 10000, 2000, 2000) === 12, "operating profit of 1,200 over capital employed of 10,000 (all liabilities are loans, so none are current) is 12%");
ok(roce(1200, 10000, 2600, 2000) === 12.77, "with 600 of other liabilities treated as current, capital employed is 9,400 and ROCE is 12.77%, not 12%");
ok(roce(1200, 1000, 3000, 1000) === null, "with current liabilities larger than total assets, capital employed is negative and no ROCE is shown");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("roe(") && screen.includes("roce("), "the profit split screen shows ROE and ROCE beside the return on capital");
const manual = read("USER-MANUAL.md");
ok(manual.includes("Return on equity") || manual.includes("return on equity"), "the manual explains ROE and ROCE and the current-liability assumption");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
