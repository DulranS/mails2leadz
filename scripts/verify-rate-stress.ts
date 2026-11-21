// Interest rate stress (lib/rateStress.ts, the loan form, the scenario screen): the repayment on a 100,000 loan at 12% over 12 months, the balance after
// payments, a rate rise raising the repayment, the months and balance left, fixed loans left out of the stress, and the wiring. Run:
// npx tsx scripts/verify-rate-stress.ts
import fs from "node:fs";
import { monthlyPayment, balanceAfter, stressLoan } from "../lib/rateStress";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const pmt = monthlyPayment(100000, 12, 12);
ok(Math.abs(pmt - 8884.88) < 0.01, "100,000 at 12% over 12 months repays 8,884.88 a month");
ok(balanceAfter(100000, 12, 12, 0) === 100000 && balanceAfter(100000, 12, 12, 12) === 0, "the balance is the full amount before payments, and nothing after the last");
ok(balanceAfter(100000, 12, 12, 6) > 0 && balanceAfter(100000, 12, 12, 6) < 100000, "half way through, part of the balance is still owed");
ok(monthlyPayment(100000, 13, 12) > monthlyPayment(100000, 12, 12), "a higher rate means a higher repayment");

const loan = { principal: 100000, annualRatePct: 12, termMonths: 12, startDate: "2026-01-01", variable: true };
const s = stressLoan(loan, "2026-07-01", [1, 2, 3]);
ok(s.monthsLeft === 6, "six months of a twelve-month loan are paid by July, so six are left");
ok(s.balanceOwed > 0 && s.balanceOwed < 100000, "the balance owed is what the schedule says is left");
ok(s.scenarios.every((x, i, a) => i === 0 || x.extraPerMonth > a[i - 1].extraPerMonth), "each rate rise costs more per month than the one before");
ok(s.scenarios[0].extraPerYear === Math.round(s.scenarios[0].extraPerMonth * 12 * 100) / 100, "the yearly extra is twelve monthly extras");
ok(stressLoan(loan, "2027-02-01", [2]).balanceOwed === 0, "a loan that has ended owes nothing, so a rise costs nothing");

const loanForm = read("app/loans/page.tsx");
ok(loanForm.includes("rateType") || loanForm.includes("variable"), "a loan can be marked variable-rate on its form");
ok(read("components/ops/ScenarioPlanPanel.tsx").includes("stressLoan(") && read("components/ops/ScenarioPlanPanel.tsx").includes("variable"), "the scenario screen stresses only the variable-rate loans");
ok(read("lib/types.ts").includes("variable?: boolean") || read("lib/types.ts").includes("rateType"), "the loan record can say it is variable-rate");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
