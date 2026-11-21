// Pipeline coverage (lib/pipelineCoverage.ts) and the rate-rise what-if (lib/rateRise.ts). Hand-worked numbers.
// Run: npx tsx scripts/verify-pipeline-coverage-and-rate-rise.ts
import fs from "node:fs";
import { pipelineCoverage } from "../lib/pipelineCoverage";
import { levelPayment, rateRise, rateRiseDebts } from "../lib/rateRise";
import { computeLoanSchedule, computeLoanSummary } from "../lib/calculations";
import type { Loan } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

// ---- Pipeline coverage -------------------------------------------------------------------------------------------------
// Target 100,000, booked 40,000 so far: 60,000 still needed. Open leads worth 90,000 + 90,000 = 180,000 = exactly 3.0x.
const h = pipelineCoverage([90000, 90000], 100000, 40000)!;
ok(h.stillNeeded === 60000 && h.pipeline === 180000 && h.coverage === 3 && h.level === "healthy", "180,000 against 60,000 still needed is 3.0x: healthy at the boundary");
ok(pipelineCoverage([89999], 100000, 40000)!.level === "thin" && pipelineCoverage([89999], 100000, 40000)!.coverage === 1.5, "89,999 against 60,000 is 1.5x, thin");
ok(pipelineCoverage([179999], 100000, 40000)!.level === "thin", "just under 3x is thin, not healthy");
ok(pipelineCoverage([60000], 100000, 40000)!.level === "thin" && pipelineCoverage([60000], 100000, 40000)!.coverage === 1, "exactly 1.0x is thin: it covers the gap only if every single lead closes");
ok(pipelineCoverage([59999], 100000, 40000)!.level === "short", "under 1x is short: cannot cover the gap even if every lead closes");
ok(pipelineCoverage([30000, 20000], 100000, 40000)!.coverage === 0.8, "50,000 against 60,000 is 0.8x");
// Target already met or exceeded: nothing to cover.
ok(pipelineCoverage([50000], 100000, 100000) === null && pipelineCoverage([50000], 100000, 130000) === null, "target met or beaten: no figure");
ok(pipelineCoverage([50000], 100000, 99999.996) === null, "a gap under half a cent counts as met");
// Nothing to compare: no figure rather than a misleading one.
ok(pipelineCoverage([50000], 0, 0) === null && pipelineCoverage([50000], null, 0) === null && pipelineCoverage([50000], undefined, 0) === null && pipelineCoverage([50000], NaN, 0) === null && pipelineCoverage([50000], -5, 0) === null, "no target, zero, negative or bad target: no figure");
ok(pipelineCoverage([], 100000, 0) === null && pipelineCoverage([0, null, undefined, NaN, -5], 100000, 0) === null, "no open lead has a value: no figure (silence is not '0x')");
// Revenue so far is bad or negative: treated as nothing booked.
ok(pipelineCoverage([100000], 100000, undefined)!.stillNeeded === 100000 && pipelineCoverage([100000], 100000, NaN)!.stillNeeded === 100000, "missing or bad revenue so far counts as 0 booked");
ok(pipelineCoverage([100000], 100000, -2000)!.bookedSoFar === 0 && pipelineCoverage([100000], 100000, -2000)!.stillNeeded === 100000, "a negative month (refunds) does not raise the amount still needed above the target");
// Invalid lead values are ignored, valid ones counted.
ok(pipelineCoverage([60000, NaN, -1, 0, null, undefined, 120000], 100000, 40000)!.pipeline === 180000, "only positive finite values are summed");

// ---- Rate rise ---------------------------------------------------------------------------------------------------------
// levelPayment: 12,000 over 12 months at 0% is 1,000. At 12% a year (1% a month): 12,000 x 0.01 / (1 - 1.01^-12) = 1,066.19.
ok(levelPayment(12000, 0, 12) === 1000, "0% rate: balance divided by months");
ok(near(levelPayment(12000, 12, 12), 1066.19), `12,000 at 12% over 12 months pays 1,066.19 (got ${levelPayment(12000, 12, 12)})`);
ok(levelPayment(0, 12, 12) === 0 && levelPayment(1000, 12, 0) === 0 && levelPayment(-5, 12, 12) === 0, "no balance or no months: no payment");
// One loan: 12,000 owed, 12 left, 12% now. At +2 points (14%): monthly r = 14/1200.
const d1 = [{ id: "a", name: "A", balance: 12000, annualRatePct: 12, monthsLeft: 12 }];
const r2 = rateRise(d1, 2)!;
const up = levelPayment(12000, 14, 12);
ok(near(r2.currentMonthly, 1066.19) && near(r2.newMonthly, up) && near(r2.extraMonthly, up - 1066.19), "current and new monthly payments match the annuity formula");
ok(near(r2.extraInterest, (up - levelPayment(12000, 12, 12)) * 12), "extra interest is the monthly difference over the 12 payments left");
// Cross-check against a full schedule: total interest at 14% minus at 12% on a 12,000, 12-month loan must equal extraInterest.
const sched = (rate: number) => computeLoanSchedule({ id: "x", name: "x", principal: 12000, annualInterestRatePct: rate, termMonths: 12, startDate: "2026-01-01", active: true, createdAt: 0 }).reduce((s, p) => s + p.interest, 0);
ok(near(r2.extraInterest, sched(14) - sched(12), 0.02), `matches the app's own schedule: ${r2.extraInterest} vs ${sched(14) - sched(12)}`);
ok(r2.extraPct !== null && near(r2.extraPct, ((up - 1066.19) / 1066.19) * 100, 0.1), "extra as a percentage of today's payment");
// A bigger rise costs more, and the effect grows faster than the rise (it is compound).
ok(rateRise(d1, 3)!.extraInterest > rateRise(d1, 2)!.extraInterest && rateRise(d1, 2)!.extraInterest > rateRise(d1, 1)!.extraInterest, "more points, more cost");
// A 0% loan: the first point still costs something.
const z = rateRise([{ id: "z", name: "Z", balance: 12000, annualRatePct: 0, monthsLeft: 12 }], 1)!;
ok(z.currentMonthly === 1000 && z.newMonthly > 1000 && z.extraInterest > 0, "a 0% loan repriced to 1% costs a little more");
// Two loans: totals add, biggest extra first; a closed or finished one is left out.
const d2 = [
  { id: "small", name: "Small", balance: 1000, annualRatePct: 10, monthsLeft: 10 },
  { id: "big", name: "Big", balance: 50000, annualRatePct: 10, monthsLeft: 36 },
  { id: "done", name: "Done", balance: 0, annualRatePct: 10, monthsLeft: 0 },
];
const t = rateRise(d2, 2)!;
ok(t.perLoan.length === 2 && t.perLoan[0].id === "big", "the loan that suffers most is listed first; the finished one is left out");
ok(near(t.extraMonthly, t.perLoan[0].extraMonthly + t.perLoan[1].extraMonthly, 0.02) && near(t.extraInterest, t.perLoan[0].extraInterest + t.perLoan[1].extraInterest, 0.02), "portfolio total is the sum of the loans");
// Bad input.
ok(rateRise(d1, 0) === null && rateRise(d1, -1) === null && rateRise(d1, NaN) === null && rateRise(d1, 51) === null, "zero, negative, bad or absurd rise: no figure");
ok(rateRise([], 2) === null && rateRise([{ id: "q", name: "Q", balance: 0, annualRatePct: 5, monthsLeft: 5 }], 2) === null, "no debt: no figure");
// A negative recorded rate is treated as 0, never as a discount that would make a rise look cheaper.
ok(near(rateRise([{ id: "n", name: "N", balance: 12000, annualRatePct: -3, monthsLeft: 12 }], 2)!.newMonthly, levelPayment(12000, 2, 12)), "a negative recorded rate is floored at 0 before the rise is added");

// rateRiseDebts from real Loan records, as of a date. Loan of 12,000, 12% for 12 months from 2026-01-01; asOf 2026-06-15 = 5 paid (Feb..Jun), 7 to come.
const loan: Loan = { id: "L1", name: "Bank", principal: 12000, annualInterestRatePct: 12, termMonths: 12, startDate: "2026-01-01", active: true, createdAt: 0 };
const debts = rateRiseDebts([loan], "2026-06-15");
const sum = computeLoanSummary(loan, "2026-06-15");
const left = computeLoanSchedule(loan).filter((p) => p.date > "2026-06-15").length;
ok(debts.length === 1 && debts[0].monthsLeft === left && near(debts[0].balance, sum.currentBalance, 0.001) && debts[0].annualRatePct === 12, "balance and payments left come from the same schedule the Loans page shows");
// The payment recomputed on the remaining balance equals the loan's own scheduled payment (that is what amortization means).
ok(near(levelPayment(debts[0].balance, 12, debts[0].monthsLeft), sum.monthlyPayment, 0.01), "the level payment on what is left equals the scheduled payment");
// On the day a payment falls due it counts as paid (the Loans page does the same): payments fall on the 1st, Feb to Jan.
ok(rateRiseDebts([loan], "2026-06-01")[0].monthsLeft === 7 && rateRiseDebts([loan], "2026-05-31")[0].monthsLeft === 8, "a payment due today is already paid, so 7 are left on 2026-06-01 and 8 the day before");
ok(rateRiseDebts([{ ...loan, active: false }], "2026-06-15").length === 0, "a closed loan is left out");
ok(rateRiseDebts([loan], "2027-06-15").length === 0, "a fully repaid loan is left out");
ok(rateRiseDebts([loan], "2025-12-01").length === 1 && rateRiseDebts([loan], "2025-12-01")[0].monthsLeft === 12, "a loan not yet started has all its payments left");

// ---- Wiring: the screens use these modules, with the right gate -------------------------------------------------------
const leads = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(/from "@\/lib\/pipelineCoverage"/.test(leads) && /pipelineCoverage\(/.test(leads), "Leads page uses lib/pipelineCoverage");
ok(/can\(role, "view:reports"\)\s*\n?\s*\? pipelineCoverage\(/.test(leads), "Leads page shows coverage only to roles that can see reports (Staff never see financial figures)");
const loansPage = fs.readFileSync("app/loans/page.tsx", "utf8");
ok(/RateRiseCard/.test(loansPage), "Loans page renders the rate-rise card");
const card = fs.readFileSync("components/RateRiseCard.tsx", "utf8");
ok(/rateRiseDebts\(/.test(card) && /rateRise\(/.test(card), "the card uses lib/rateRise");

if (fails) { console.error(`\n${fails} of ${checks} checks FAILED`); process.exit(1); }
console.log(`OK: ${checks} checks passed`);
