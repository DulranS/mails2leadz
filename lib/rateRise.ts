// What if the rate on your loans went up?
//
// Many business loans are not fixed: the lender can reprice them when market rates move, and a spike can balloon the
// payment. Balancr records each loan at one rate, so this answers "if my lender added N points to what I owe now, what
// would it cost me" for loans that can be repriced. It re-works the payment on the balance still owed over the payments
// still to come, at the current rate and at the higher one, and shows the difference. Nothing is stored or changed; if
// the lender really does reprice, edit the loan's rate and every figure in the books follows.
//
// A fixed-rate loan is unaffected by this, and the page says so.
import type { Loan } from "./types";
import { computeLoanSchedule, computeLoanSummary } from "./calculations";

export interface RateRiseDebt {
  id: string;
  name: string;
  balance: number; // still owed today
  annualRatePct: number; // current nominal annual rate
  monthsLeft: number; // payments still to come
}

export interface RateRiseLoan {
  id: string;
  name: string;
  extraMonthly: number;
  extraInterest: number;
}

export interface RateRiseResult {
  points: number;
  currentMonthly: number; // total monthly payment on these balances today
  newMonthly: number; // the same, at the higher rate
  extraMonthly: number; // newMonthly - currentMonthly
  extraPct: number | null; // extraMonthly as a % of currentMonthly, null if nothing is paid today
  extraInterest: number; // extra interest over the remaining payments
  perLoan: RateRiseLoan[]; // biggest extra first
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Level monthly payment that clears `balance` in `months` payments at `annualPct`.
export function levelPayment(balance: number, annualPct: number, months: number): number {
  if (!(balance > 0) || !(months >= 1)) return 0;
  const n = Math.round(months);
  const r = Math.max(0, annualPct) / 100 / 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

// The loans still being repaid, as balance / rate / payments left, as of a date.
export function rateRiseDebts(loans: Loan[], asOfISO: string): RateRiseDebt[] {
  const out: RateRiseDebt[] = [];
  for (const l of loans) {
    if (!l.active) continue;
    const s = computeLoanSummary(l, asOfISO);
    if (!(s.currentBalance > 0.5)) continue;
    const monthsLeft = computeLoanSchedule(l).filter((p) => p.date > asOfISO).length;
    if (monthsLeft < 1) continue;
    out.push({ id: l.id, name: l.name, balance: s.currentBalance, annualRatePct: l.annualInterestRatePct, monthsLeft });
  }
  return out;
}

export function rateRise(debts: RateRiseDebt[], points: number): RateRiseResult | null {
  if (!Number.isFinite(points) || points <= 0 || points > 50) return null;
  const perLoan: RateRiseLoan[] = [];
  let current = 0;
  let next = 0;
  let extraInterest = 0;
  for (const d of debts) {
    if (!(d.balance > 0) || !(d.monthsLeft >= 1)) continue;
    const base = levelPayment(d.balance, d.annualRatePct, d.monthsLeft);
    const up = levelPayment(d.balance, Math.max(0, d.annualRatePct) + points, d.monthsLeft);
    const n = Math.round(d.monthsLeft);
    current += base;
    next += up;
    // The principal is the same either way, so the whole difference in what is paid is extra interest.
    const extra = (up - base) * n;
    extraInterest += extra;
    perLoan.push({ id: d.id, name: d.name, extraMonthly: round2(up - base), extraInterest: round2(extra) });
  }
  if (perLoan.length === 0) return null;
  perLoan.sort((a, b) => b.extraInterest - a.extraInterest);
  return {
    points,
    currentMonthly: round2(current),
    newMonthly: round2(next),
    extraMonthly: round2(next - current),
    extraPct: current > 0 ? Math.round(((next - current) / current) * 1000) / 10 : null,
    extraInterest: round2(extraInterest),
    perLoan,
  };
}
