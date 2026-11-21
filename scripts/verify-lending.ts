// Empirical check for money the business has lent out (lib/lending.ts): interest, repayments, late and
// partial payments, write-offs, what is still to come, and that the books still balance with lending in them.
//
// Run: npx tsx scripts/verify-lending.ts
import {
  computeLendingPortfolio, lendingPresentValue, lentSchedule, monthsSinceStart, settleInFullAmount,
  summarizeLentLoan, validateLentLoanTerms, validateLentTxn,
} from "../lib/lending";
import { addMonthsIso, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL } from "../lib/calculations";
import type { LentLoan, LentLoanTxn } from "../lib/types";
import { PERIOD_GUARDED_METHODS, type PeriodGuardState } from "../lib/periodGuards";
import { MUTATION_NAME } from "../lib/readOnlyGuard";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) pass++; else { fail++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

let seq = 0;
const loan = (o: Partial<LentLoan> = {}): LentLoan => ({
  id: "L" + ++seq, borrower: "Nimal", principal: 100000, annualInterestRatePct: 18, termMonths: 12,
  startDate: "2025-01-15", createdAt: 1, ...o,
});
const rep = (l: LentLoan, date: string, amount: number, kind: LentLoanTxn["kind"] = "repayment"): LentLoanTxn =>
  ({ id: "T" + ++seq, loanId: l.id, kind, date, amount, createdAt: seq });
// Pays every agreed instalment on its agreed date.
const payAsAgreed = (l: LentLoan, upTo?: string) => lentSchedule(l).filter((r) => !upTo || r.date <= upTo).map((r) => rep(l, r.date, r.payment));

// 1. Months are anchored at the start date, so month-end loans don't drift.
{
  assert(monthsSinceStart("2025-01-15", "2025-01-15") === 0, "no time has passed on the day it is lent");
  assert(near(monthsSinceStart("2025-01-15", "2025-04-15"), 3, 1e-9), "three whole months land exactly on 3");
  assert(near(monthsSinceStart("2025-01-31", "2025-02-28"), 1, 1e-9), "31 Jan + 1 month is 28 Feb: exactly 1");
  assert(near(monthsSinceStart("2025-01-31", "2025-03-31"), 2, 1e-9), "31 Jan + 2 months is 31 Mar: exactly 2, no drift");
  assert(near(monthsSinceStart("2025-01-15", "2025-02-01"), 17 / 31, 1e-9), "a part month counts by days");
  assert(monthsSinceStart("2025-01-15", "2024-12-01") === 0, "a date before the start is zero, never negative");
}

// 2. Paid exactly as agreed, the loan closes to the cent and the interest matches the schedule.
for (const [name, o] of [
  ["installments 18% / 12m", {}],
  ["installments from 31 Jan", { startDate: "2025-01-31" }],
  ["installments 0% interest", { annualInterestRatePct: 0 }],
  ["installments 36m at 24%", { termMonths: 36, annualInterestRatePct: 24 }],
  ["interest-only 12m", { repaymentStyle: "interest_only" as const }],
  ["interest-only from 31 Jan", { repaymentStyle: "interest_only" as const, startDate: "2025-01-31" }],
] as [string, Partial<LentLoan>][]) {
  const l = loan(o);
  const sched = lentSchedule(l);
  const txns = payAsAgreed(l);
  const asOf = addMonthsIso(l.startDate, l.termMonths + 1);
  const s = summarizeLentLoan(l, txns, asOf);
  const schedInterest = sched.reduce((t, r) => t + r.interest, 0);
  assert(s.status === "repaid", `${name}: closes as repaid`);
  assert(near(s.principalOutstanding, 0, 0.01) && near(s.accruedInterest, 0, 0.01), `${name}: nothing left owing`);
  assert(near(s.interestReceived, schedInterest, 0.05), `${name}: interest received matches the schedule (${s.interestReceived.toFixed(2)} vs ${schedInterest.toFixed(2)})`);
  assert(near(s.principalReceived, l.principal, 0.05), `${name}: the whole principal came back`);
  assert(s.overdueAmount === 0 && s.daysOverdue === 0, `${name}: never overdue`);
  assert(near(s.principalReceived + s.interestReceived, txns.reduce((t, x) => t + x.amount, 0), 1e-6), `${name}: principal + interest = cash received`);
}

// 3. Mid-term, on time: current, with the right balance and the future laid out.
{
  const l = loan();
  const asOf = "2025-06-15"; // 5 payments due
  const s = summarizeLentLoan(l, payAsAgreed(l, asOf), asOf);
  const sched = lentSchedule(l);
  assert(s.status === "current", "on time mid-term is current");
  assert(near(s.principalOutstanding, sched[4].balance, 0.01), "balance equals the schedule's balance after 5 payments");
  assert(near(s.accruedInterest, 0, 0.01), "paid up on a due date: no interest accrued yet");
  assert(s.future.length === 7, "seven payments still to come");
  assert(near(s.future.reduce((t, f) => t + f.principal, 0), s.principalOutstanding, 0.01), "future principal adds back to what is owed");
  assert(near(s.future.reduce((t, f) => t + f.interest, 0), sched.slice(5).reduce((t, r) => t + r.interest, 0), 0.05), "future interest equals the schedule's remaining interest");
  assert(near(s.interestStillToEarn, s.future.reduce((t, f) => t + f.interest, 0), 0.01), "interest still to earn is the future interest when nothing is late");
  assert(s.nextDueDate === "2025-07-15" && near(s.nextDueAmount ?? 0, s.scheduledPayment, 0.01), "next payment date and amount");
  const twelve = s.future.filter((f) => f.date <= "2026-06-15").reduce((t, f) => t + f.total, 0);
  assert(near(s.expectedNext12m, twelve, 0.01), "next-12-months expectation");
}

// 4. Mid-month accrual: owed but unpaid interest is shown, and is not counted as received.
{
  const l = loan();
  const asOf = "2025-06-30"; // 15 days after the 5th payment
  const s = summarizeLentLoan(l, payAsAgreed(l, "2025-06-15"), asOf);
  const bal = lentSchedule(l)[4].balance;
  assert(near(s.accruedInterest, bal * 0.015 * (15 / 30), 0.5), "half a month of interest has built up");
  assert(s.overdueAmount === 0 && s.status === "current", "accrued but not yet due is not overdue");
  assert(near(s.interestReceived, lentSchedule(l).slice(0, 5).reduce((t, r) => t + r.interest, 0), 0.05), "accrued interest is not in 'received'");
}

// 5. Late and missed payments are flagged, sized and aged.
{
  const l = loan();
  const sched = lentSchedule(l);
  const txns = payAsAgreed(l, "2025-03-15"); // the Feb and Mar payments, then nothing
  const asOf = "2025-06-20"; // 5 are due (Feb-Jun), 3 missed (Apr, May, Jun)
  const s = summarizeLentLoan(l, txns, asOf);
  assert(s.status === "overdue", "missed payments make it overdue");
  assert(near(s.overdueAmount, sched[2].payment + sched[3].payment + sched[4].payment, 0.01), "overdue is the sum of the three missed payments");
  assert(s.daysOverdue === 66, `aged from the first missed due date (15 Apr → 20 Jun = 66 days, got ${s.daysOverdue})`);
  assert(s.accruedInterest > 0 && s.principalOutstanding > sched[4].balance, "interest keeps building on the larger balance");
  const catchUp = s.future.reduce((t, f) => t + f.principal, 0) + 0;
  assert(near(catchUp, sched[4].balance, 0.01), "after catching up, the future matches the original schedule's balance");
}

// 6. A short payment pays interest first, then principal.
{
  const l = loan();
  const s = summarizeLentLoan(l, [rep(l, "2025-02-15", 1000)], "2025-02-15");
  assert(near(s.interestReceived, 1000) && near(s.principalReceived, 0), "1,000 against 1,500 of interest is all interest");
  assert(near(s.accruedInterest, 500), "500 of interest is still owed");
  assert(near(s.principalOutstanding, 100000), "principal untouched");
  const s2 = summarizeLentLoan(l, [rep(l, "2025-02-15", 10000)], "2025-02-15");
  assert(near(s2.interestReceived, 1500) && near(s2.principalReceived, 8500), "10,000 = 1,500 interest then 8,500 principal");
  assert(near(s2.principalOutstanding, 91500), "principal reduced by 8,500");
}

// 7. Early repayment saves interest (interest follows what really happened).
{
  const l = loan();
  const sched = lentSchedule(l);
  const early = [...payAsAgreed(l, "2025-03-15"), rep(l, "2025-03-15", sched[1].balance)]; // after 2 payments, pays off the rest on the 15 Mar due date
  const s = summarizeLentLoan(l, early, "2025-04-01");
  assert(s.status === "repaid", "paying off the balance early closes the loan");
  assert(s.interestReceived < sched.reduce((t, r) => t + r.interest, 0) - 100, "less interest than the full schedule");
  assert(s.future.length === 0 && s.expectedNext12m === 0, "nothing left to come");
}

// 8. Settle in full is exactly what is owed.
{
  const l = loan();
  const txns = payAsAgreed(l, "2025-03-15");
  const amt = settleInFullAmount(l, txns, "2025-04-01");
  const s = summarizeLentLoan(l, [...txns, rep(l, "2025-04-01", amt)], "2025-04-01");
  assert(s.status === "repaid" && s.owedTotal < 0.5, "settle-in-full closes the loan");
  assert(s.overpaid < 0.01, "and doesn't overpay");
}

// 9. Overpayment is refused, and a later entry can't be broken by a backdated one.
{
  const l = loan();
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-02-15", amount: 500000 }, "2025-06-01") !== null, "a repayment far above what is owed is refused");
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-02-15", amount: 9000 }, "2025-06-01") === null, "a normal repayment is accepted");
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-06-02", amount: 9000 }, "2025-06-01") !== null, "a future date is refused");
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-01-01", amount: 9000 }, "2025-06-01") !== null, "a date before the loan was made is refused");
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-02-15", amount: 0 }, "2025-06-01") !== null, "zero is refused");
  assert(validateLentTxn(l, [], { kind: "repayment", date: "2025-02-15", amount: NaN }, "2025-06-01") !== null, "not-a-number is refused");
  const late = [rep(l, "2025-03-15", settleInFullAmount(l, [], "2025-03-15"))]; // borrower settled in full in March
  assert(validateLentTxn(l, late, { kind: "repayment", date: "2025-02-15", amount: 30000 }, "2025-06-01") !== null, "a backdated payment that leaves the March settlement too big is refused");
  assert(validateLentTxn(l, [], { kind: "writeoff", date: "2025-02-15", amount: 100001 }, "2025-06-01") !== null, "writing off more than the principal is refused");
  assert(validateLentTxn(l, [], { kind: "writeoff", date: "2025-02-15", amount: 40000 }, "2025-06-01") === null, "a partial write-off is accepted");
}

// 10. Write-offs: principal is given up, unpaid interest is forgiven with it, status shows it.
{
  const l = loan();
  const txns = [...payAsAgreed(l, "2025-03-15"), rep(l, "2025-08-01", 0, "writeoff")];
  const bal = summarizeLentLoan(l, payAsAgreed(l, "2025-03-15"), "2025-08-01").principalOutstanding;
  const w = rep(l, "2025-08-01", bal, "writeoff");
  const s = summarizeLentLoan(l, [...payAsAgreed(l, "2025-03-15"), w], "2025-09-01");
  assert(txns.length > 0, "fixture built");
  assert(s.status === "written_off", "fully written off is shown as such");
  assert(near(s.writtenOff, bal, 0.01) && s.principalOutstanding === 0 && s.accruedInterest === 0, "the balance and unpaid interest are gone");
  assert(s.overdueAmount === 0 && s.future.length === 0, "nothing is chased after a write-off");
  const part = summarizeLentLoan(l, [w.kind === "writeoff" ? { ...w, amount: bal / 2 } : w], "2025-09-01");
  assert(part.status !== "written_off" && part.status !== "repaid" && near(part.writtenOff, bal / 2, 0.01), "a partial write-off keeps the loan open");
}

// 11. The portfolio.
{
  const a = loan({ borrower: "Nimal", principal: 100000 });
  const b = loan({ borrower: "Kamal", principal: 50000, startDate: "2025-02-01" });
  const c = loan({ borrower: "nimal ", principal: 20000, startDate: "2025-03-01", repaymentStyle: "interest_only" });
  const txns = [...payAsAgreed(a, "2025-09-15"), ...payAsAgreed(c, "2025-09-01")]; // Kamal pays nothing
  const p = computeLendingPortfolio([a, b, c], txns, "2025-09-30");
  assert(p.loanCount === 3 && p.openCount === 3, "three open loans");
  assert(p.loans[0].loan.id === b.id && p.loans[0].status === "overdue", "the late loan is listed first");
  assert(p.overdueCount === 1 && near(p.overdueAmount, p.loans[0].overdueAmount, 0.01), "overdue totals come from the late loan");
  assert(near(p.totalLent, 170000), "total lent");
  assert(near(p.principalOutstanding, p.loans.reduce((t, s) => t + s.principalOutstanding, 0), 0.01), "outstanding is the sum");
  assert(near(p.interestReceived + p.principalReceived, txns.reduce((t, x) => t + x.amount, 0), 0.01), "everything received is accounted for");
  assert(p.largestBorrower !== null && p.largestBorrower.name.toLowerCase() === "nimal", "same borrower typed with different case/spacing is grouped");
  assert(p.largestBorrower !== null && p.largestBorrower.sharePct > 50, "concentration is measured");
  const pv0 = lendingPresentValue(p, 0);
  const pv10 = lendingPresentValue(p, 10);
  const pv30 = lendingPresentValue(p, 30);
  const everything = p.overdueAmount + p.loans.reduce((t, s) => t + s.future.reduce((u, f) => u + f.total, 0), 0);
  assert(near(pv0, everything, 0.01), "PV at 0% is everything still to be collected");
  assert(pv10 < pv0 && pv30 < pv10 && pv30 > 0, "PV falls as the discount rate rises");
  assert(lendingPresentValue(p, -5) === pv0 && lendingPresentValue(p, NaN) === pv0, "a nonsense discount rate is treated as 0%");
}

// 12. Money-weighted return on a loan paid as agreed is the effective yearly rate of the contract.
{
  const l = loan({ startDate: "2024-01-15" });
  const p = computeLendingPortfolio([l], payAsAgreed(l), "2025-03-01");
  const effective = (Math.pow(1 + 0.18 / 12, 12) - 1) * 100;
  assert(p.annualizedReturnPct !== null && near(p.annualizedReturnPct, effective, 0.3), `annualised return ≈ ${effective.toFixed(2)}% (got ${p.annualizedReturnPct?.toFixed(2)}%)`);
  const fresh = computeLendingPortfolio([loan({ startDate: "2025-02-20" })], [], "2025-03-01");
  assert(fresh.annualizedReturnPct === null, "no annualised return on a loan only days old");
}

// 13. Validation of the loan's own terms.
{
  const ok = { borrower: "A", principal: 1000, annualInterestRatePct: 12, termMonths: 6, startDate: "2025-01-01" };
  assert(validateLentLoanTerms(ok, "2025-06-01") === null, "good terms accepted");
  assert(validateLentLoanTerms({ ...ok, borrower: "  " }, "2025-06-01") !== null, "blank borrower refused");
  assert(validateLentLoanTerms({ ...ok, principal: 0 }, "2025-06-01") !== null, "zero principal refused");
  assert(validateLentLoanTerms({ ...ok, annualInterestRatePct: -1 }, "2025-06-01") !== null, "negative rate refused");
  assert(validateLentLoanTerms({ ...ok, termMonths: 0 }, "2025-06-01") !== null && validateLentLoanTerms({ ...ok, termMonths: 2.5 }, "2025-06-01") !== null, "zero / fractional term refused");
  assert(validateLentLoanTerms({ ...ok, startDate: "2025-07-01" }, "2025-06-01") !== null, "future start refused");
  assert(validateLentLoanTerms({ ...ok, annualInterestRatePct: 0 }, "2025-06-01") === null, "an interest-free loan is allowed");
}

// 14. THE BOOKS: with lending in play, cash, profit and the Balance Sheet must balance. Deterministic case first.
{
  const TODAY = "2025-09-30";
  const capital: any[] = [{ id: "c1", kind: "investment", amount: 500000, date: "2024-12-01", createdAt: 1 }];
  const a = loan({ principal: 100000, startDate: "2025-01-15" });
  const b = loan({ principal: 30000, startDate: "2025-04-01", repaymentStyle: "interest_only" });
  const wBal = summarizeLentLoan(b, [], "2025-08-01").principalOutstanding;
  const txns = [...payAsAgreed(a, "2025-07-15"), rep(b, "2025-05-01", 450), rep(b, "2025-06-01", 450), rep(b, "2025-08-01", wBal, "writeoff")];
  const port = computeLendingPortfolio([a, b], txns, TODAY);
  const pnl = computeMonthlyPnL([], [], [], [], [], capital, 20, 0, [], [], [], [], [], [], [], port.monthly);
  const summary = computeCapitalSummary(capital, pnl);
  const bs = computeBalanceSheet(pnl, 0, [], summary, TODAY, [], 0, 0, [], 0, { costBasis: 0, marketValue: 0 }, port.principalOutstanding);
  assert(bs.balances, `Balance Sheet balances with lending (assets ${bs.totalAssets.toFixed(2)} vs L+E ${bs.totalLiabilitiesAndEquity.toFixed(2)})`);
  assert(near(bs.loansLentValue, port.principalOutstanding), "money lent out appears on the Balance Sheet at principal still owed");
  const cashIn = pnl.reduce((t, m) => t + m.lendingInterest + m.loanCollections, 0);
  assert(near(cashIn, port.interestReceived + port.principalReceived, 0.01), "cash collected in the P&L equals what the loans received");
  assert(near(pnl.reduce((t, m) => t + m.lendingInterest, 0), port.interestReceived, 0.01), "profit counts interest only when received");
  assert(near(pnl.reduce((t, m) => t + m.lendingWriteOff, 0), port.writtenOff, 0.01), "a write-off is a loss");
  const pre = pnl.reduce((t, m) => t + m.netProfitPreTax, 0);
  assert(near(pre, port.interestReceived - port.writtenOff, 0.01), "with nothing else going on, pre-tax profit = interest received − written off");
  const none = computeMonthlyPnL([], [], [], [], [], capital, 20, 0, [], [], [], [], [], [], [], []);
  assert(none.every((m) => m.lendingInterest === 0 && m.moneyLent === 0 && m.loanCollections === 0 && m.lendingWriteOff === 0), "a business that lends nothing is unchanged");
}

// 15. THE BOOKS, randomised: many shapes of lending, the identity must always hold.
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const TODAY = "2026-03-31";
  let balancedAll = true, identityAll = true, trials = 0;
  for (let t = 0; t < 300; t++) {
    const loans: LentLoan[] = [];
    const txns: LentLoanTxn[] = [];
    const n = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const start = addMonthsIso("2024-01-01", Math.floor(rnd() * 24)).slice(0, 8) + String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
      const l = loan({
        principal: Math.round(5000 + rnd() * 200000), annualInterestRatePct: Math.round(rnd() * 36), termMonths: 3 + Math.floor(rnd() * 30),
        startDate: start, repaymentStyle: rnd() < 0.4 ? "interest_only" : "installments",
      });
      loans.push(l);
      // a borrower who pays some, skips some, pays partial amounts, and sometimes gets written off
      for (const row of lentSchedule(l)) {
        if (row.date > TODAY) break;
        const r = rnd();
        if (r < 0.55) txns.push(rep(l, row.date, row.payment));
        else if (r < 0.7) txns.push(rep(l, row.date, row.payment * rnd()));
        else if (r < 0.75) txns.push(rep(l, addMonthsIso(row.date, 1) > TODAY ? row.date : addMonthsIso(row.date, 1), row.payment));
      }
      const w = summarizeLentLoan(l, txns, TODAY);
      if (rnd() < 0.25 && w.principalOutstanding > 1) txns.push(rep(l, TODAY, w.principalOutstanding * rnd(), "writeoff"));
    }
    const port = computeLendingPortfolio(loans, txns, TODAY);
    const capital: any[] = [{ id: "c", kind: "investment", amount: 5_000_000, date: "2023-12-01", createdAt: 1 }];
    const pnl = computeMonthlyPnL([], [], [], [], [], capital, Math.round(rnd() * 30), 0, [], [], [], [], [], [], [], port.monthly);
    const bs = computeBalanceSheet(pnl, 0, [], computeCapitalSummary(capital, pnl), TODAY, [], 0, 0, [], 0, { costBasis: 0, marketValue: 0 }, port.principalOutstanding);
    if (!bs.balances) { balancedAll = false; console.error("  unbalanced trial", t, bs.totalAssets, bs.totalLiabilitiesAndEquity); }
    const identity = port.totalLent - port.principalReceived - port.writtenOff;
    if (!near(identity, port.principalOutstanding, 0.05)) { identityAll = false; console.error("  identity broke", t, identity, port.principalOutstanding); }
    for (const s of port.loans) if (s.principalOutstanding < -1e-6 || s.accruedInterest < -1e-6 || s.overdueAmount < -1e-6 || !Number.isFinite(s.owedTotal)) { identityAll = false; console.error("  bad number", s); }
    trials++;
  }
  assert(balancedAll, `the Balance Sheet balanced in all ${trials} random lending books`);
  assert(identityAll, `lent − collected − written off = still owed, in all ${trials} random books`);
}

// 16. Bad stored data never produces NaN or a crash.
{
  const l = loan({ principal: 0 });
  const s = summarizeLentLoan(l, [], "2025-06-01");
  assert(s.status === "repaid" && Number.isFinite(s.owedTotal), "a zero-principal loan is harmless");
  const l2 = loan({ termMonths: 0 });
  const s2 = summarizeLentLoan(l2, [], "2025-06-01");
  assert(Number.isFinite(s2.owedTotal) && s2.future.length === 0 && s2.overdueAmount === 0, "no schedule: no overdue, no future, no crash");
  const l3 = loan();
  const s3 = summarizeLentLoan(l3, [rep(l3, "2025-02-15", NaN), rep(l3, "2025-02-15", -5)], "2025-06-01");
  assert(s3.totalReceived === 0, "garbage repayments are ignored");
  const notStarted = computeLendingPortfolio([loan({ startDate: "2030-01-01" })], [], "2025-06-01");
  assert(notStarted.loanCount === 0 && notStarted.totalLent === 0, "a loan dated after the as-of date is not counted yet");
}

// 17. Closing the books locks lending too: every dated money movement is guarded, name-only edits are not.
{
  const l = loan({ startDate: "2025-03-10" });
  const t1 = rep(l, "2025-04-10", 5000);
  const state = { lentLoans: [{ id: l.id, startDate: l.startDate }], lentLoanTxns: [{ id: t1.id, date: t1.date }] } as unknown as PeriodGuardState;
  const dates = (name: string, ...args: any[]) => PERIOD_GUARDED_METHODS[name](args, state).filter(Boolean);
  assert(dates("addLentLoan", { startDate: "2025-02-01" }).join() === "2025-02-01", "lending out is checked against the day the money was handed over");
  assert(dates("addLentLoanTxn", { date: "2025-05-05" }).join() === "2025-05-05", "recording a repayment is checked against its date");
  assert(dates("deleteLentLoanTxn", t1.id).join() === "2025-04-10", "deleting a repayment is checked against its original date");
  assert(dates("deleteLentLoan", l.id).join() === "2025-03-10", "deleting a loan is checked against its start date");
  assert(dates("updateLentLoan", l.id, { annualInterestRatePct: 30 }).join() === "2025-03-10", "changing the rate is checked against the start date (it re-works past interest)");
  assert(dates("updateLentLoan", l.id, { startDate: "2025-01-01", principal: 9 }).join() === "2025-03-10,2025-01-01", "moving the start date checks both the old and the new date");
  assert(dates("updateLentLoan", l.id, { notes: "guarantor: Sunil", borrower: "N. Perera", purpose: "x" }).length === 0, "fixing a name or note moves no money, so a closed month doesn't block it");
  // every context method that can change lending is a mutation name (so an accountant login is read-only for it) and is guarded
  for (const m of ["addLentLoan", "updateLentLoan", "deleteLentLoan", "addLentLoanTxn", "deleteLentLoanTxn"]) {
    assert(MUTATION_NAME.test(m) && m in PERIOD_GUARDED_METHODS, `${m} is read-only for an accountant and period-guarded`);
  }
}

// 18. The accountant pack's monthly P&L lists every line that makes up profit, so its columns add up to
// net_profit_before_tax. This is the identity those columns rely on, with every kind of line present at once.
{
  const l = loan({ startDate: "2025-01-15" });
  const t = [...payAsAgreed(l, "2025-06-15"), rep(l, "2025-08-01", 20000, "writeoff")];
  const port = computeLendingPortfolio([l], t, "2025-09-30");
  const assets: any[] = [{ id: "F", name: "Van", category: "Vehicles", purchaseDate: "2025-02-10", cost: 600000, usefulLifeMonths: 60, createdAt: 1 }];
  const capital: any[] = [{ id: "c", kind: "investment", amount: 900000, date: "2024-12-01", createdAt: 1 }];
  const inv: any[] = [{ month: "2025-06", income: 3000, realizedGain: 500, purchases: 0, saleProceeds: 0 }];
  const pnl = computeMonthlyPnL([], [], [], [], [], capital, 20, 0, assets, [], [], [], [], [], inv, port.monthly);
  let worst = 0;
  for (const m of pnl) {
    const sum = m.contributionMargin - m.operatingExpenses - m.interestExpense - m.depreciationExpense - m.badDebtExpense - m.stockShrinkage
      + m.disposalGainLoss + m.investmentIncome + m.realizedInvestmentGain + m.lendingInterest - m.lendingWriteOff;
    worst = Math.max(worst, Math.abs(sum - m.netProfitPreTax));
  }
  assert(pnl.length > 0 && worst < 0.01, `the exported P&L columns add up to net profit before tax (largest gap ${worst.toFixed(6)})`);
}

console.log(`\nverify-lending: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
