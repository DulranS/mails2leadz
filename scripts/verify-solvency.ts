// Solvency and value (lib/solvency.ts and the profit split screen): equity ratio, debt to equity, interest cover, book-based enterprise value, the solvency
// verdict, the cases with nothing to divide by, and the wiring. Worked numbers. Run: npx tsx scripts/verify-solvency.ts
import fs from "node:fs";
import { solvency } from "../lib/solvency";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const s = solvency({ totalEquity: 8000, totalAssets: 10000, loansPayable: 2000, cash: 2000, operatingProfit: 1200, interestPaid: 200 });
ok(s.equityRatioPct === 80, "equity of 8,000 out of 10,000 of assets is an 80% equity ratio");
ok(s.debtToEquity === 0.25, "2,000 borrowed against 8,000 owned is 0.25 owed per unit owned");
ok(s.interestCover === 6, "operating profit of 1,200 against 200 interest covers it 6 times");
ok(s.enterpriseValue === 8000, "book enterprise value is equity plus loans less cash (8,000 + 2,000 - 2,000)");
ok(s.verdict === "solvent", "owning more than owing is solvent");
ok(solvency({ totalEquity: -500, totalAssets: 1000, loansPayable: 1500, cash: 100, operatingProfit: 50, interestPaid: 0 }).verdict === "insolvent_on_books", "owing more than owned is flagged as insolvent on the books");
ok(solvency({ totalEquity: 0, totalAssets: 0, loansPayable: 0, cash: 0, operatingProfit: 0, interestPaid: 0 }).equityRatioPct === null, "with no assets, no equity ratio is shown rather than divided by zero");
ok(solvency({ totalEquity: 0, totalAssets: 100, loansPayable: 50, cash: 0, operatingProfit: 10, interestPaid: 0 }).debtToEquity === null, "with no equity, no debt to equity is shown");
ok(solvency({ totalEquity: 100, totalAssets: 100, loansPayable: 0, cash: 0, operatingProfit: 10, interestPaid: 0 }).interestCover === null, "with no interest paid, interest cover is not shown");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("solvency(") && screen.includes("Solvency"), "the profit split screen shows solvency and value beside the return on capital");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
