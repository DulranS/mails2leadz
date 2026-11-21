// Finance choices (v221b): two decisions with a single right arithmetic. (1) Loan offers compared on what they really cost: the monthly
// repayment, the total paid, and the real annual cost once the upfront fee is counted. (2) Real options: whether to invest now or wait for
// the uncertainty to clear; waiting is worth something only when the business can choose not to invest if things go badly. Pure: no I/O.

export interface LoanOffer { name: string; amount: number; annualRatePct: number; termMonths: number; upfrontFee: number }
export interface LoanResult { name: string; monthlyPayment: number; totalRepaid: number; totalCost: number; effectiveAnnualPct: number | null; affordable: boolean | null }

// The level monthly repayment on a loan (annuity formula). A zero rate is simply the amount spread evenly.
export function monthlyPayment(amount: number, annualRatePct: number, termMonths: number): number {
  const i = annualRatePct / 100 / 12;
  if (termMonths <= 0) return NaN;
  if (i === 0) return amount / termMonths;
  return (amount * i) / (1 - Math.pow(1 + i, -termMonths));
}

// The real annual cost of a loan: the monthly rate that equates what is received (the amount less the fee) with the repayments, annualised.
// It rises above the stated rate when there is a fee, which is why offers are compared on this figure, not on the headline rate.
export function effectiveAnnualPct(o: LoanOffer): number | null {
  const pay = monthlyPayment(o.amount, o.annualRatePct, o.termMonths);
  if (!Number.isFinite(pay)) return null;
  const received = o.amount - o.upfrontFee;
  if (received <= 0) return null;
  let lo = 0, hi = 0.2;
  const f = (m: number) => pay * (1 - Math.pow(1 + m, -o.termMonths)) / m - received;
  if (f(lo + 1e-9) * f(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.round((Math.pow(1 + (lo + hi) / 2, 12) - 1) * 10000) / 100;
}

// Offers compared by total cost (the cheapest first). If the monthly surplus is given, each offer says whether its repayment fits within it.
export function compareLoans(offers: LoanOffer[], monthlySurplus?: number): LoanResult[] {
  return offers
    .map((o) => {
      const pay = monthlyPayment(o.amount, o.annualRatePct, o.termMonths);
      const totalRepaid = pay * o.termMonths;
      return {
        name: o.name,
        monthlyPayment: Math.round(pay * 100) / 100,
        totalRepaid: Math.round(totalRepaid * 100) / 100,
        totalCost: Math.round((totalRepaid + o.upfrontFee - o.amount) * 100) / 100,
        effectiveAnnualPct: effectiveAnnualPct(o),
        affordable: monthlySurplus === undefined ? null : pay <= monthlySurplus,
      };
    })
    .sort((a, b) => a.totalCost - b.totalCost);
}

// Invest now, or wait a year. If we wait, the project either turns out well (up) or badly (down), each with a chance; if it turns out badly
// we simply do not invest. The option to wait is worth the expected value of that choice, discounted, less what investing now is worth.
export function waitingOption(p: { outlay: number; npvNow: number; pvUp: number; pvDown: number; probUp: number; rate: number }) {
  const exUp = Math.max(p.pvUp - p.outlay, 0);
  const exDown = Math.max(p.pvDown - p.outlay, 0);
  const waitValue = (p.probUp * exUp + (1 - p.probUp) * exDown) / (1 + p.rate);
  const investNow = Math.max(p.npvNow, 0);
  const optionValue = waitValue - investNow;
  return {
    waitValue: Math.round(waitValue * 100) / 100,
    investNowValue: Math.round(investNow * 100) / 100,
    optionValue: Math.round(optionValue * 100) / 100,
    recommendation: optionValue > 0.005 ? "wait" as const : "invest now" as const,
  };
}
