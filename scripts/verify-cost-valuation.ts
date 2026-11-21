// Cost behaviour and value at an earnings multiple (lib/costBehaviour.ts, lib/valuation.ts, the screen): each expense category has a behaviour, the split
// for chosen months, transfers and other kinds left out, EBITDA with interest and depreciation added back, value at a multiple, equity after loans and cash,
// the multiple limits, and the wiring. Worked numbers. Run: npx tsx scripts/verify-cost-valuation.ts
import fs from "node:fs";
import { CATEGORY_BEHAVIOUR, splitCosts } from "../lib/costBehaviour";
import { trailingEbitda, valueAtMultiple, validMultiple } from "../lib/valuation";
import { EXPENSE_CATEGORIES } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(EXPENSE_CATEGORIES.every((c) => CATEGORY_BEHAVIOUR[c] !== undefined), "every expense category has a cost behaviour");
ok(CATEGORY_BEHAVIOUR["Rent & utilities"] === "semi_variable" && CATEGORY_BEHAVIOUR["Payroll & labor"] === "fixed" && CATEGORY_BEHAVIOUR["Transport & logistics"] === "variable", "rent and utilities are semi-variable, payroll is fixed, transport is variable");

const exp = [
  { amount: 6000, category: "Payroll & labor", startDate: "2026-10-01", kind: "expense", isRecurring: false },      // fixed
  { amount: 2000, category: "Transport & logistics", startDate: "2026-10-05", kind: "expense", isRecurring: false }, // variable
  { amount: 1000, category: "Marketing", startDate: "2026-10-09", kind: "expense", isRecurring: false },            // semi-variable
  { amount: 500, category: "Software & tools", startDate: "2026-09-02", kind: "expense", isRecurring: false },      // another month
  { amount: 900, category: "Insurance", startDate: "2026-10-12", kind: "revenue", isRecurring: false },             // not a cost: left out
];
const s = splitCosts(exp, { from: "2026-10", to: "2026-10" });
ok(s.fixed === 6000 && s.variable === 2000 && s.semiVariable === 1000 && s.total === 9000, "October's costs: fixed 6,000, variable 2,000, semi-variable 1,000, total 9,000");
ok(s.fixedPct === 66.7 && s.variablePct === 22.2, "fixed is two thirds of October's costs, variable a fifth");
ok(splitCosts([], { from: "2026-10", to: "2026-10" }).fixedPct === null, "with no costs in the period, no share is shown");
const rent = [{ amount: 4000, category: "Rent & utilities", startDate: "2026-08-01", kind: "expense", isRecurring: true, recurrence: "monthly" }];
ok(splitCosts(rent, { from: "2026-10", to: "2026-10" }).total === 4000 && splitCosts(rent, { from: "2026-07", to: "2026-10" }).total === 12000, "a monthly cost counts in every month from its start: once in October, and in each of the three months from August to October (12,000 over July to October, since it starts in August)");

ok(trailingEbitda([
  { netProfitPreTax: 800000, interestExpense: 50000, depreciationExpense: 150000 },
  { netProfitPreTax: 200000, interestExpense: 0, depreciationExpense: 50000 },
]) === 1250000, "EBITDA is pre-tax profit with interest and depreciation added back: (800,000 + 50,000 + 150,000) + (200,000 + 0 + 50,000) = 1,250,000");
const v = valueAtMultiple({ ebitda: 1000000, multiple: 5, loansPayable: 800000, cash: 300000 });
ok(v.enterpriseValue === 5000000 && v.equityValue === 4500000, "1m of EBITDA at 5 times is 5m of value; less 800k of loans and plus 300k of cash, the owners' value is 4.5m");
ok(validMultiple(5) === null && validMultiple(-1) !== null && validMultiple(80) !== null, "a multiple from 0 to 50 is accepted; anything else is refused");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("splitCosts(") && screen.includes("trailingEbitda(") && screen.includes("valueAtMultiple("), "the profit split screen shows the cost behaviour split and the value at an earnings multiple");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
