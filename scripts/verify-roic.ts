// Return on invested capital (lib/roic.ts): operating profit adds back interest, tax is taken off, invested capital is equity plus loans less cash, the
// return against the cost of capital, the zero-capital case, and the wiring into the profit split screen. Worked numbers. Run: npx tsx scripts/verify-roic.ts
import fs from "node:fs";
import { roic, valueSpread } from "../lib/roic";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const r = roic({ pretaxProfit: 1000, interestPaid: 200, taxRatePct: 15, equity: 8000, loansPayable: 2000, cash: 2000 });
ok(r.operatingProfit === 1200, "operating profit is the profit before tax plus the interest paid (1,000 + 200)");
ok(r.nopat === 1020, "after 15% tax, operating profit is 1,020");
ok(r.investedCapital === 8000, "invested capital is equity plus loans less cash (8,000 + 2,000 - 2,000 = 8,000)");
ok(r.roicPct === 12.75, "return on invested capital is 1,020 ÷ 8,000 = 12.75%");
ok(roic({ pretaxProfit: 1000, interestPaid: 0, taxRatePct: 15, equity: 1000, loansPayable: 0, cash: 1000 }).roicPct === null, "with no capital in use, no return is shown, rather than a division by zero");
ok(roic({ pretaxProfit: -500, interestPaid: 0, taxRatePct: 15, equity: 1000, loansPayable: 0, cash: 0 }).roicPct === -42.5, "a loss gives a negative return, shown as one");

const v = valueSpread(12.75, 10);
ok(v !== null && v.spreadPct === 2.75 && v.verdict === "creates value", "a 12.75% return against a 10% cost of capital creates value, by 2.75 points");
ok(valueSpread(8, 10)?.verdict === "destroys value", "an 8% return against a 10% cost destroys value");
ok(valueSpread(10, 10)?.verdict === "break-even", "a return exactly equal to the cost of capital is break-even");
ok(valueSpread(12.75, undefined) === null, "with no cost of capital entered, no verdict is given");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("roic(") && screen.includes("valueSpread("), "the profit split screen shows the return on invested capital against the cost of capital");
ok(screen.includes("costOfCapitalPct"), "the cost of capital is entered on the screen, not assumed");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
