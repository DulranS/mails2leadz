// Lending: money the business has LENT out and earns interest on, what is still owed, what has been earned,
// what is late, and what is still to come.
//
// Management accounting only. The owner records what was lent and each repayment actually received; nothing
// connects to a bank, a credit bureau or any authority, nothing is filed anywhere, and nothing here moves
// money. Pure functions, no I/O. (The mirror image of `Loan` / computeLoanSchedule, which is money the
// business BORROWED.)
//
// How interest works (the same convention as the Loans page, so both sides of a loan read alike):
//   interest builds up at annualRate / 12 a month on the principal still owed, counted from the day the money
//   left the business. A part month counts by days. A repayment pays the interest owed first, then the
//   principal, which is how a lender is normally paid. Pay on the agreed dates and the figures match the
//   schedule to the cent; pay late, early or short and the interest follows what really happened.
//
// How it ties into the books (see computeMonthlyPnL / computeBalanceSheet in lib/calculations.ts):
//   lend out         cash out by the principal. It becomes an asset, "money lent out".
//   repayment        cash in. The interest part is profit (below operating profit, taxed with it); the
//                    principal part just turns the asset back into cash.
//   write-off        the principal given up on is a loss in that month. No cash moves.
// Interest is counted as profit WHEN IT IS RECEIVED, never before: interest that is owed but unpaid is shown
// on the Lending page as "earned, not received yet" and stays out of profit, tax and cash until the money
// arrives. That is the cautious way to count a promise from a borrower. Cash + money lent out always equals
// the sum of these flows, so the Balance Sheet keeps balancing by construction.
import { addMonthsIso, computeLoanSchedule } from "./calculations";
import { computeXirrPct } from "./investments";
import type { Loan, LentLoan, LentLoanTxn } from "./types";

const EPS = 0.005; // below half a cent is float noise
const SETTLED = 0.5; // under half a currency unit owed counts as settled: people type rounded repayments

export type LentLoanStatus = "current" | "overdue" | "repaid" | "written_off";

export const LENT_STYLE_LABELS = {
  installments: "Equal monthly payments",
  interest_only: "Interest each month, principal at the end",
} as const;

// One month of lending cash and profit effects. This is the only thing the monthly P&L needs.
export interface LendingMonthly {
  month: string; // "YYYY-MM"
  lent: number; // cash that left the business as new loans
  principalCollected: number; // principal repaid by borrowers
  interestReceived: number; // interest received
  writtenOff: number; // principal given up on: a loss, no cash
}

export interface LentFlow {
  date: string;
  interest: number;
  principal: number;
  total: number;
}

export interface LentScheduleRow {
  index: number; // 1-based
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// Months elapsed since the loan started, as one continuous number: whole months land exactly on the
// payment dates (start + 1 month, + 2 months ...), and a part month counts by days. Anchoring every date at
// the START date (never chaining from one payment to the next) is what stops month-end loans (31 Jan) from
// drifting.
export function monthsSinceStart(startIso: string, iso: string): number {
  if (iso <= startIso) return 0;
  const [y0, m0] = startIso.split("-").map(Number);
  const [y, m] = iso.split("-").map(Number);
  let k = (y - y0) * 12 + (m - m0);
  if (addMonthsIso(startIso, k) > iso) k -= 1;
  const a = addMonthsIso(startIso, k);
  const b = addMonthsIso(startIso, k + 1);
  return k + daysBetween(a, iso) / daysBetween(a, b);
}

const styleOf = (l: LentLoan) => l.repaymentStyle ?? "installments";
const monthlyRate = (l: LentLoan) => l.annualInterestRatePct / 1200;

// The payments the borrower agreed to. Empty when the terms can't form a schedule.
export function lentSchedule(loan: LentLoan): LentScheduleRow[] {
  const n = Math.max(0, Math.round(loan.termMonths));
  if (n === 0 || !(loan.principal > 0)) return [];
  if (styleOf(loan) === "installments") {
    // Same amortisation as the Loans page, so a loan reads the same from either side.
    const asLoan: Loan = {
      id: loan.id, name: loan.borrower, principal: loan.principal, annualInterestRatePct: loan.annualInterestRatePct,
      termMonths: n, startDate: loan.startDate, active: true, createdAt: loan.createdAt,
    };
    return computeLoanSchedule(asLoan).map((p) => ({
      index: p.periodIndex, date: p.date, payment: p.payment, principal: p.principal, interest: p.interest, balance: p.balance,
    }));
  }
  const r = monthlyRate(loan);
  const rows: LentScheduleRow[] = [];
  for (let i = 1; i <= n; i++) {
    const interest = loan.principal * r;
    const principal = i === n ? loan.principal : 0;
    rows.push({ index: i, date: addMonthsIso(loan.startDate, i), payment: interest + principal, principal, interest, balance: i === n ? 0 : loan.principal });
  }
  return rows;
}

interface Walk {
  started: boolean;
  principalOutstanding: number;
  accruedInterest: number; // owed by the borrower, not paid yet
  principalReceived: number;
  interestReceived: number;
  writtenOff: number;
  overpaid: number; // received (or written off) beyond what was owed: a data problem, kept visible
  lastPaymentDate: string | null;
  monthly: Map<string, { principal: number; interest: number; writtenOff: number }>;
}

const evRank = (k: LentLoanTxn["kind"]) => (k === "repayment" ? 0 : 1);

// Replays one loan's repayments and write-offs, in date order, as of a date.
function walk(loan: LentLoan, txns: LentLoanTxn[], asOfISO: string): Walk {
  const out: Walk = {
    started: loan.startDate <= asOfISO, principalOutstanding: 0, accruedInterest: 0, principalReceived: 0,
    interestReceived: 0, writtenOff: 0, overpaid: 0, lastPaymentDate: null, monthly: new Map(),
  };
  if (!out.started || !(loan.principal > 0)) return out;
  const r = monthlyRate(loan);
  const bump = (month: string, d: { principal?: number; interest?: number; writtenOff?: number }) => {
    const cur = out.monthly.get(month) ?? { principal: 0, interest: 0, writtenOff: 0 };
    out.monthly.set(month, { principal: cur.principal + (d.principal ?? 0), interest: cur.interest + (d.interest ?? 0), writtenOff: cur.writtenOff + (d.writtenOff ?? 0) });
  };
  const events = txns
    .filter((t) => t.loanId === loan.id && t.date <= asOfISO && Number.isFinite(t.amount) && t.amount > 0)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : evRank(a.kind) !== evRank(b.kind) ? evRank(a.kind) - evRank(b.kind) : a.createdAt - b.createdAt));

  let P = loan.principal;
  let A = 0;
  let m = 0; // months at the last event
  for (const ev of events) {
    const mm = monthsSinceStart(loan.startDate, ev.date);
    A += P * r * (mm - m);
    m = mm;
    if (ev.kind === "repayment") {
      const toInterest = Math.min(ev.amount, A);
      A -= toInterest;
      const rest = ev.amount - toInterest;
      const toPrincipal = Math.min(rest, P);
      P -= toPrincipal;
      const extra = rest - toPrincipal; // more than was owed: counted as interest so cash always reconciles
      out.interestReceived += toInterest + extra;
      out.principalReceived += toPrincipal;
      out.overpaid += extra;
      out.lastPaymentDate = ev.date;
      bump(ev.date.slice(0, 7), { principal: toPrincipal, interest: toInterest + extra });
    } else {
      const w = Math.min(ev.amount, P);
      P -= w;
      out.writtenOff += w;
      out.overpaid += ev.amount - w;
      bump(ev.date.slice(0, 7), { writtenOff: w });
      if (P <= EPS) A = 0; // nothing left to earn interest on: the unpaid interest is forgiven with it
    }
    if (P <= EPS) P = 0;
    if (A <= EPS) A = 0;
  }
  A += P * r * (monthsSinceStart(loan.startDate, asOfISO) - m);
  out.principalOutstanding = P <= EPS ? 0 : P;
  out.accruedInterest = A <= EPS ? 0 : A;
  return out;
}

export interface LentLoanSummary {
  loan: LentLoan;
  status: LentLoanStatus;
  principalOutstanding: number;
  accruedInterest: number; // earned on paper, not received: NOT in profit until it is
  owedTotal: number; // principalOutstanding + accruedInterest
  principalReceived: number;
  interestReceived: number;
  totalReceived: number;
  writtenOff: number;
  overdueAmount: number;
  daysOverdue: number; // 0 when nothing is late
  scheduledPayment: number; // the regular monthly payment (0 when there is no schedule)
  nextDueDate: string | null;
  nextDueAmount: number | null;
  endDate: string | null; // final agreed payment date
  future: LentFlow[]; // what arrives from here on if the borrower pays as agreed
  interestStillToEarn: number; // interest still to come if paid as agreed (counted when received)
  expectedNext12m: number; // cash expected over the next 12 months, as agreed (late amounts excluded)
  overpaid: number;
  lastPaymentDate: string | null;
}

export function summarizeLentLoan(loan: LentLoan, txns: LentLoanTxn[], asOfISO: string): LentLoanSummary {
  const w = walk(loan, txns, asOfISO);
  const P = w.principalOutstanding;
  const A = w.accruedInterest;
  const sched = w.started ? lentSchedule(loan) : [];
  const endDate = sched.length ? sched[sched.length - 1].date : null;
  const received = w.principalReceived + w.interestReceived;

  const owed = P + A;
  const closed = owed <= SETTLED || (P <= EPS && A <= SETTLED);
  const duePast = sched.filter((s) => s.date <= asOfISO);
  const dueToDate = duePast.reduce((s, x) => s + x.payment, 0);
  let overdue = closed ? 0 : Math.min(Math.max(0, dueToDate - received), owed);
  if (!closed && endDate && asOfISO >= endDate) overdue = owed; // the agreed term is over: all of it is due
  if (overdue <= SETTLED) overdue = 0;

  let daysOverdue = 0;
  if (overdue > 0) {
    let cum = 0;
    for (const row of duePast) {
      cum += row.payment;
      if (cum - received > SETTLED) { daysOverdue = Math.max(0, daysBetween(row.date, asOfISO)); break; }
    }
    if (daysOverdue === 0 && endDate && asOfISO >= endDate) daysOverdue = Math.max(0, daysBetween(endDate, asOfISO));
  }

  let status: LentLoanStatus;
  if (closed) status = w.writtenOff > SETTLED ? "written_off" : "repaid";
  else status = overdue > 0 ? "overdue" : "current";

  // What arrives from here on if the borrower pays as agreed. Anything late is "due now", so the future
  // starts from the position the schedule says the loan should be in once the borrower has caught up.
  const future: LentFlow[] = [];
  if (!closed && sched.length && !(endDate && asOfISO >= endDate)) {
    const schedPrincipalDue = duePast.reduce((s, x) => s + x.principal, 0);
    const principalBehind = Math.max(0, schedPrincipalDue - w.principalReceived - w.writtenOff);
    let bal = Math.max(0, P - principalBehind);
    const r = monthlyRate(loan);
    const regular = sched[0].payment;
    const style = styleOf(loan);
    for (const row of sched) {
      if (row.date <= asOfISO || bal <= EPS) continue;
      const interest = bal * r;
      const isLast = row === sched[sched.length - 1];
      let principal = 0;
      if (style === "installments") principal = isLast ? bal : Math.min(Math.max(0, regular - interest), bal);
      else principal = isLast ? bal : 0;
      bal -= principal;
      future.push({ date: row.date, interest, principal, total: interest + principal });
    }
  }
  const twelve = addMonthsIso(asOfISO, 12);
  const expectedNext12m = future.filter((f) => f.date <= twelve).reduce((s, f) => s + f.total, 0);
  const interestOverdue = Math.max(0, duePast.reduce((s, x) => s + x.interest, 0) - w.interestReceived);
  const interestStillToEarn = closed ? 0 : future.reduce((s, f) => s + f.interest, 0) + (overdue > 0 ? Math.min(interestOverdue, overdue) : 0);

  const next = sched.find((s) => s.date > asOfISO);
  return {
    loan, status, principalOutstanding: P, accruedInterest: A, owedTotal: owed,
    principalReceived: w.principalReceived, interestReceived: w.interestReceived, totalReceived: received, writtenOff: w.writtenOff,
    overdueAmount: overdue, daysOverdue, scheduledPayment: sched[0]?.payment ?? 0,
    nextDueDate: !closed && next ? next.date : null, nextDueAmount: !closed && next ? next.payment : null,
    endDate, future, interestStillToEarn, expectedNext12m, overpaid: w.overpaid, lastPaymentDate: w.lastPaymentDate,
  };
}

// Month-by-month effects of every loan, for the P&L and cash flow. Includes the month each loan was handed over.
export function computeLendingMonthly(loans: LentLoan[], txns: LentLoanTxn[], asOfISO: string): LendingMonthly[] {
  const map = new Map<string, LendingMonthly>();
  const bucket = (month: string) => {
    let b = map.get(month);
    if (!b) { b = { month, lent: 0, principalCollected: 0, interestReceived: 0, writtenOff: 0 }; map.set(month, b); }
    return b;
  };
  for (const loan of loans) {
    if (!(loan.principal > 0) || loan.startDate > asOfISO) continue;
    bucket(loan.startDate.slice(0, 7)).lent += loan.principal;
    for (const [month, d] of walk(loan, txns, asOfISO).monthly) {
      const b = bucket(month);
      b.principalCollected += d.principal;
      b.interestReceived += d.interest;
      b.writtenOff += d.writtenOff;
    }
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface LendingPortfolio {
  asOf: string;
  loans: LentLoanSummary[]; // late ones first, then the largest balance
  loanCount: number;
  openCount: number;
  totalLent: number; // everything ever handed over
  principalOutstanding: number; // the asset on the Balance Sheet
  accruedInterest: number;
  overdueAmount: number;
  overdueCount: number;
  principalReceived: number;
  interestReceived: number;
  writtenOff: number;
  badDebtPct: number | null; // written off as a % of everything lent
  expectedNext12m: number;
  interestStillToEarn: number;
  annualizedReturnPct: number | null; // money-weighted, null until there is enough history
  largestBorrower: { name: string; sharePct: number } | null; // concentration of what is still owed
  monthly: LendingMonthly[];
}

export function computeLendingPortfolio(loans: LentLoan[], txns: LentLoanTxn[], asOfISO: string): LendingPortfolio {
  const summaries = loans.filter((l) => l.startDate <= asOfISO).map((l) => summarizeLentLoan(l, txns, asOfISO));
  const order: Record<LentLoanStatus, number> = { overdue: 0, current: 1, written_off: 2, repaid: 3 };
  summaries.sort((a, b) => order[a.status] - order[b.status] || b.principalOutstanding - a.principalOutstanding);
  const sum = (f: (s: LentLoanSummary) => number) => summaries.reduce((t, s) => t + f(s), 0);
  const totalLent = sum((s) => s.loan.principal);
  const principalOutstanding = sum((s) => s.principalOutstanding);
  const writtenOff = sum((s) => s.writtenOff);

  // Money-weighted yearly return: lent out is money in, repayments are money back, and what is still owed
  // (principal only, the cautious value) is the terminal value.
  const flows: { date: string; amount: number }[] = [];
  for (const s of summaries) {
    flows.push({ date: s.loan.startDate, amount: -s.loan.principal });
    for (const t of txns) if (t.loanId === s.loan.id && t.kind === "repayment" && t.date <= asOfISO && t.amount > 0) flows.push({ date: t.date, amount: t.amount });
  }
  if (principalOutstanding > EPS) flows.push({ date: asOfISO, amount: principalOutstanding });

  const byBorrower = new Map<string, { name: string; owed: number }>();
  for (const s of summaries) {
    if (s.principalOutstanding <= EPS) continue;
    const key = s.loan.borrower.trim().toLowerCase();
    const cur = byBorrower.get(key) ?? { name: s.loan.borrower.trim(), owed: 0 };
    cur.owed += s.principalOutstanding;
    byBorrower.set(key, cur);
  }
  let largest: { name: string; sharePct: number } | null = null;
  for (const b of byBorrower.values()) {
    if (principalOutstanding > EPS && (!largest || b.owed / principalOutstanding * 100 > largest.sharePct)) {
      largest = { name: b.name, sharePct: (b.owed / principalOutstanding) * 100 };
    }
  }

  return {
    asOf: asOfISO, loans: summaries, loanCount: summaries.length,
    openCount: summaries.filter((s) => s.status === "current" || s.status === "overdue").length,
    totalLent, principalOutstanding, accruedInterest: sum((s) => s.accruedInterest),
    overdueAmount: sum((s) => s.overdueAmount), overdueCount: summaries.filter((s) => s.status === "overdue").length,
    principalReceived: sum((s) => s.principalReceived), interestReceived: sum((s) => s.interestReceived), writtenOff,
    badDebtPct: totalLent > 0 ? (writtenOff / totalLent) * 100 : null,
    expectedNext12m: sum((s) => s.expectedNext12m), interestStillToEarn: sum((s) => s.interestStillToEarn),
    annualizedReturnPct: summaries.length ? computeXirrPct(flows) : null,
    largestBorrower: largest, monthly: computeLendingMonthly(loans, txns, asOfISO),
  };
}

// What the money still owed is worth today, if every borrower pays as agreed, against what the same cash
// could earn elsewhere. Anything already late counts at face value (it is due now). With a discount rate of
// 0 this is simply everything still to be collected.
export function lendingPresentValue(portfolio: LendingPortfolio, discountPct: number): number {
  const rate = Number.isFinite(discountPct) ? Math.max(0, discountPct) / 100 : 0;
  let pv = 0;
  for (const s of portfolio.loans) {
    pv += s.overdueAmount;
    for (const f of s.future) {
      const years = Math.max(0, daysBetween(portfolio.asOf, f.date)) / 365;
      pv += f.total / Math.pow(1 + rate, years);
    }
  }
  return pv;
}

// What the borrower owes on a given day, to the cent: the "settle in full" amount.
export function settleInFullAmount(loan: LentLoan, txns: LentLoanTxn[], dateISO: string): number {
  const s = summarizeLentLoan(loan, txns, dateISO);
  return Math.round(s.owedTotal * 100) / 100;
}

// Why a new repayment or write-off can't be recorded, or null when it is fine. Replays the loan with the new
// entry in place so a backdated entry that would make a later one exceed what was owed is caught too.
export function validateLentTxn(
  loan: LentLoan,
  existing: LentLoanTxn[],
  candidate: { kind: LentLoanTxn["kind"]; date: string; amount: number },
  todayISO: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return "Pick a date.";
  if (candidate.date > todayISO) return "The date can't be in the future.";
  if (candidate.date < loan.startDate) return "That is before the loan was made.";
  if (!(Number.isFinite(candidate.amount) && candidate.amount > 0)) return "Enter an amount above zero.";
  const probe: LentLoanTxn = { id: "__new__", loanId: loan.id, kind: candidate.kind, date: candidate.date, amount: candidate.amount, createdAt: Number.MAX_SAFE_INTEGER };
  // Does this entry itself exceed what was owed on its own date?
  const upTo = existing.filter((t) => t.date <= candidate.date);
  if (walk(loan, [...upTo, probe], candidate.date).overpaid - walk(loan, upTo, candidate.date).overpaid > SETTLED) {
    return candidate.kind === "repayment"
      ? "That is more than the borrower owed on that date (interest plus principal). Check the amount, or use Settle in full."
      : "You can't write off more principal than is still owed on that date.";
  }
  // Would a backdated entry leave a LATER one larger than what is then owed?
  if (walk(loan, [...existing, probe], todayISO).overpaid - walk(loan, existing, todayISO).overpaid > SETTLED) {
    return "That would make a later entry larger than what was owed. Fix or delete that later one first.";
  }
  return null;
}

// Why a loan's own terms are not acceptable, or null.
export function validateLentLoanTerms(
  t: { borrower: string; principal: number; annualInterestRatePct: number; termMonths: number; startDate: string },
  todayISO: string
): string | null {
  if (!t.borrower.trim()) return "Say who the money was lent to.";
  if (!(Number.isFinite(t.principal) && t.principal > 0)) return "Enter the amount lent, above zero.";
  if (!(Number.isFinite(t.annualInterestRatePct) && t.annualInterestRatePct >= 0 && t.annualInterestRatePct <= 1000)) return "The yearly interest rate should be between 0 and 1000%.";
  if (!(Number.isInteger(t.termMonths) && t.termMonths >= 1 && t.termMonths <= 600)) return "The number of monthly payments should be a whole number from 1 to 600.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate)) return "Pick the date the money was handed over.";
  if (t.startDate > todayISO) return "The date can't be in the future.";
  return null;
}
