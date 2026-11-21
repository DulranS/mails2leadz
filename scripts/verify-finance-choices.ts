// Finance choices (lib/financeChoices.ts): loan repayments, the real annual cost of a loan with its fee, comparing offers on total cost and
// affordability, and the option to wait before investing; checked with worked numbers. Run: npx tsx scripts/verify-finance-choices.ts
import fs from "node:fs";
import { monthlyPayment, effectiveAnnualPct, compareLoans, waitingOption } from "../lib/financeChoices";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(Math.abs(monthlyPayment(1000, 12, 12) - 88.85) < 0.01, "a 1,000 loan at 12% over 12 months repays about 88.85 a month");
ok(monthlyPayment(1200, 0, 12) === 100, "a loan at no interest is spread evenly over its months");
ok(Math.abs((effectiveAnnualPct({ name: "x", amount: 1000, annualRatePct: 12, termMonths: 12, upfrontFee: 0 }) ?? 0) - 12.68) < 0.05, "with no fee, the real annual cost is the monthly rate compounded (about 12.68% for 12% a year as 1% a month)");
const withFee = effectiveAnnualPct({ name: "x", amount: 1000, annualRatePct: 12, termMonths: 12, upfrontFee: 50 });
ok(withFee !== null && withFee > 12.68, "an upfront fee raises the real annual cost above the headline rate");
ok(effectiveAnnualPct({ name: "x", amount: 1000, annualRatePct: 12, termMonths: 12, upfrontFee: 1000 }) === null, "a fee that takes the whole loan leaves no meaningful cost");

const offers = [
  { name: "Bank A", amount: 1000, annualRatePct: 12, termMonths: 12, upfrontFee: 50 },
  { name: "Supplier", amount: 1000, annualRatePct: 0, termMonths: 12, upfrontFee: 0 },
  { name: "Bank B", amount: 1000, annualRatePct: 10, termMonths: 12, upfrontFee: 0 },
];
const ranked = compareLoans(offers, 85); // 83.33 a month fits; 87.92 a month does not
ok(ranked[0].name === "Supplier" && ranked[0].totalCost === 0, "offers are ranked by total cost, the cheapest first (interest-free credit here)");
ok(ranked.find((r) => r.name === "Bank A")!.totalCost > ranked.find((r) => r.name === "Bank B")!.totalCost, "a fee can make a lower-rate loan cost more than one with no fee, so the fee is in the total");
ok(ranked.find((r) => r.name === "Bank B")!.affordable === false && ranked.find((r) => r.name === "Supplier")!.affordable === true, "a repayment that is more than the money to spare is shown as not affordable");
ok(compareLoans(offers).every((r) => r.affordable === null), "without a monthly figure to spare, affordability is not judged");

const invest = waitingOption({ outlay: 1000, npvNow: 200, pvUp: 1600, pvDown: 700, probUp: 0.5, rate: 0.1 });
ok(invest.waitValue === 272.73 && invest.optionValue === 72.73 && invest.recommendation === "wait", "with a good chance of a large upside and a bad case we can avoid, waiting is worth 72.73 more, so we wait");
const small = waitingOption({ outlay: 1000, npvNow: 200, pvUp: 1100, pvDown: 700, probUp: 0.5, rate: 0.1 });
ok(small.optionValue < 0 && small.recommendation === "invest now", "when the upside is small, waiting is worth less than investing now, so we invest now");
ok(waitingOption({ outlay: 1000, npvNow: -50, pvUp: 900, pvDown: 900, probUp: 0.5, rate: 0.1 }).investNowValue === 0, "investing now is never valued below zero, since we would not invest at a loss");

ok(tabsForRole("owner").includes("choices") && tabsForRole("manager").includes("choices") && !tabsForRole("staff").includes("choices"), "loans and waiting are for the owner and manager");
ok(read("components/ops/FinanceChoicesPanel.tsx").includes("Nothing is saved or agreed") || read("components/ops/FinanceChoicesPanel.tsx").includes("nothing is saved or agreed") || read("components/ops/FinanceChoicesPanel.tsx").includes("Nothing is saved"), "the screen says nothing is saved or agreed");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
