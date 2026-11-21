// Operating profit (EBIT) and EBITDA on the income statement (lib/incomeMetrics.ts, pass 348). Run: tsx scripts/verify-income-metrics.ts
import { readFileSync } from "node:fs";
import { monthEbit, monthEbitda } from "../lib/incomeMetrics";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

ok(monthEbit({ contributionMargin: 1000, operatingExpenses: 400, depreciationExpense: 100 }) === 500, "EBIT is contribution margin less operating expenses and depreciation");
ok(monthEbitda({ contributionMargin: 1000, operatingExpenses: 400, depreciationExpense: 100 }) === 600, "EBITDA adds depreciation back");
ok(monthEbit({ contributionMargin: 1000, operatingExpenses: 400, depreciationExpense: 0 }) === monthEbitda({ contributionMargin: 1000, operatingExpenses: 400, depreciationExpense: 0 }), "with no depreciation EBIT and EBITDA are the same");
ok(monthEbit({ contributionMargin: 200, operatingExpenses: 500, depreciationExpense: 50 }) === -350, "a loss month gives a negative EBIT");
ok(monthEbitda({ contributionMargin: 200, operatingExpenses: 500, depreciationExpense: 50 }) === -300, "a loss month gives a negative EBITDA");
ok(monthEbit({ contributionMargin: 10.006, operatingExpenses: 0, depreciationExpense: 0 }) === 10.01, "the result is rounded to the cent");
ok(Number.isFinite(monthEbit({ contributionMargin: NaN, operatingExpenses: 0, depreciationExpense: 0 })), "a bad number gives a finite result, not NaN");

// Wiring: the statement shows both lines, and the Health page uses the same formula
const page = readFileSync(new URL("../app/statements/page.tsx", import.meta.url), "utf8");
ok(page.includes('from "@/lib/incomeMetrics"'), "the income statement imports the EBIT helper");
ok(page.includes("Operating profit (EBIT)") && page.includes("monthEbit(m)"), "the income statement shows operating profit (EBIT)");
ok(page.includes("monthEbitda(m)"), "the income statement shows EBITDA");
const calc = readFileSync(new URL("../lib/calculations.ts", import.meta.url), "utf8");
ok(calc.includes("m.contributionMargin - m.operatingExpenses - m.depreciationExpense"), "the Health figure uses the same EBIT formula");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
