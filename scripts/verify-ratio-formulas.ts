// The accounting formulas the app did not have (lib/ratioFormulas.ts): each with worked numbers from the sheets, the zero-divisor cases, and the wiring.
// Run: npx tsx scripts/verify-ratio-formulas.ts
import fs from "node:fs";
import * as f from "../lib/ratioFormulas";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

ok(f.proprietaryRatio(8000, 10000) === 80, "shareholders' funds of 8,000 over total assets of 10,000 is a 80% proprietary ratio");
ok(f.receivablesTurnover(120000, 20000) === 6, "net credit sales of 120,000 over receivables of 20,000 turns the receivables over 6 times");
ok(f.averageCollectionDays(120000, 20000) === 60.8, "365 days over 6 turns is about 61 days to collect");
ok(f.payablesTurnover(60000, 15000) === 4, "credit purchases of 60,000 over payables of 15,000 is 4 turns");
ok(f.averagePaymentDays(60000, 15000) === 91.3, "365 days over 4 turns is about 91 days to pay");
ok(f.pvRatio(40000, 100000) === 40, "a contribution of 40,000 on sales of 100,000 is a 40% P/V ratio");
ok(f.operatingRatio(60000, 25000, 100000) === 85, "COGS of 60,000 plus operating expenses of 25,000 over net sales of 100,000 is an 85% operating ratio");
ok(f.marginOnSellingPrice(20, 100) === 20 && f.markupOnCost(25, 100) === 25, "a profit of 20 on a selling price of 100 is a 20% margin; a profit of 25 on a cost of 100 is a 25% markup");
ok(f.averageCollectionDays(0, 20000) === null && f.proprietaryRatio(8000, 0) === null, "with nothing to divide by, no ratio is shown");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("proprietaryRatio(") && screen.includes("averageCollectionDays(") && screen.includes("pvRatio("), "the screen shows the new formulas");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
