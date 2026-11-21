// Probability-weighted scenario plan (lib/scenarioPlan.ts): the profit in each scenario, the expected profit weighted by the chances, the chance of
// a loss, the break-even revenue, the operating leverage, the largest-customer share from sales, and the validation. Worked numbers. Run:
// npx tsx scripts/verify-scenario-plan.ts
import { planOutcome, validatePlan, largestCustomerShare, type PlanInput } from "../lib/scenarioPlan";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const plan: PlanInput = {
  monthlyRevenue: 100000, contributionMarginPct: 40, monthlyFixedCosts: 30000, largestCustomerSharePct: 30,
  scenarios: [
    { name: "Base", probability: 60, revenueChangePct: 0, loseLargestCustomer: false },
    { name: "Downturn", probability: 30, revenueChangePct: -20, loseLargestCustomer: false },
    { name: "Severe: lose the biggest customer and a downturn", probability: 10, revenueChangePct: -20, loseLargestCustomer: true },
  ],
};
ok(validatePlan(plan) === null, "chances that add to 100% are accepted");
const out = planOutcome(plan);
ok(out.rows[0].profit === 10000 && out.rows[0].revenue === 100000, "the base case: revenue 100,000, profit 10,000 (40% margin less 30,000 fixed)");
ok(out.rows[1].profit === 2000, "the downturn (revenue down 20%): profit 2,000");
ok(out.rows[2].revenue === 56000 && out.rows[2].profit === -7600, "the severe case loses 30% of revenue to the largest customer as well: revenue 56,000, profit -7,600");
ok(out.expectedProfit === 5840, "the expected profit is 60% x 10,000 + 30% x 2,000 + 10% x -7,600 = 5,840");
ok(out.chanceOfLoss === 10, "the chance of a loss is the chance of the scenarios that lose money (10%)");
ok(out.breakEvenRevenue === 75000, "break-even revenue is the fixed costs over the margin (30,000 / 40% = 75,000)");
ok(out.profitPerRevenuePoint === 400, "operating leverage: each 1% of revenue moves monthly profit by 400");

ok(validatePlan({ ...plan, scenarios: [{ name: "A", probability: 50, revenueChangePct: 0, loseLargestCustomer: false }] }) !== null, "chances that do not add to 100% are refused, and the total is shown");
ok(validatePlan({ ...plan, scenarios: [] }) !== null, "a plan with no scenarios is refused");
ok(validatePlan({ ...plan, contributionMarginPct: 120 }) !== null, "a margin above 100% is refused");

const sales = [
  { date: "2026-10-01", qty: 3, unitPrice: 1000, customer: "Hotel A" },   // 3,000
  { date: "2026-10-05", qty: 2, unitPrice: 1000, customer: "Cafe B" },    // 2,000
  { date: "2026-10-09", qty: 5, unitPrice: 1000 },                        // 5,000 walk-in
  { date: "2024-01-01", qty: 9, unitPrice: 9999, customer: "Old" },       // outside the window
];
const top = largestCustomerShare(sales, "2026-11-09");
ok(top !== null && top.name === "Walk-in trade" && top.sharePct === 50, "the largest customer is found by revenue over the last twelve months (walk-in trade at 50%)");
ok(largestCustomerShare([], "2026-11-09") === null, "with no sales in the window, there is no customer share to use");

import fs from "node:fs";
import { tabsForRole } from "../lib/operations";
const readSp = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
ok(tabsForRole("owner").includes("scenarios") && tabsForRole("manager").includes("scenarios") && !tabsForRole("staff").includes("scenarios"), "the scenario plan is for the owner and manager");
ok(!/addDoc|updateDoc|setDoc|deleteDoc/.test(readSp("components/ops/ScenarioPlanPanel.tsx")) && readSp("components/ops/ScenarioPlanPanel.tsx").includes("Nothing is saved"), "the scenario plan saves nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
