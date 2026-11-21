// Interest rate stress on variable-rate loans (v254). A variable loan's monthly repayment is recalculated over the balance still owed at a higher rate,
// over the months still left. The balance is worked out from the loan's own schedule (principal, rate, term and the months already paid). Pure.

export interface StressLoan { principal: number; annualRatePct: number; termMonths: number; startDate: string; variable: boolean }

export function monthlyPayment(balance: number, annualPct: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualPct / 100 / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

export function balanceAfter(principal: number, annualPct: number, termMonths: number, paid: number): number {
  const r = annualPct / 100 / 12;
  const p = Math.min(Math.max(paid, 0), termMonths);
  if (p >= termMonths) return 0;
  if (r === 0) return principal * (1 - p / termMonths);
  const pmt = monthlyPayment(principal, annualPct, termMonths);
  return principal * Math.pow(1 + r, p) - pmt * ((Math.pow(1 + r, p) - 1) / r);
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

// The effect of each rate rise on one variable loan: the repayment now, and at each higher rate, over the balance and months still left today.
export function stressLoan(loan: StressLoan, today: string, risesPct: number[]) {
  const paid = Math.max(0, monthsBetween(loan.startDate, today));
  const balance = Math.round(balanceAfter(loan.principal, loan.annualRatePct, loan.termMonths, paid) * 100) / 100;
  const remaining = Math.max(0, loan.termMonths - paid);
  const now = Math.round(monthlyPayment(balance, loan.annualRatePct, remaining) * 100) / 100;
  const scenarios = risesPct.map((rise) => {
    const pmt = Math.round(monthlyPayment(balance, loan.annualRatePct + rise, remaining) * 100) / 100;
    return { risePct: rise, monthlyPayment: pmt, extraPerMonth: Math.round((pmt - now) * 100) / 100, extraPerYear: Math.round((pmt - now) * 12 * 100) / 100 };
  });
  return { balanceOwed: balance, monthsLeft: remaining, paymentNow: now, scenarios };
}
