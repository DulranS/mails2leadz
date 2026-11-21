// Which debt to attack first, and what it saves. Compares three ways of repaying the same debts:
//   minimum    pay only each loan's scheduled payment, as the lender expects
//   avalanche  same total each month, but everything extra goes to the HIGHEST interest rate first (cheapest overall)
//   snowball   same total each month, extra goes to the SMALLEST balance first (clears loans fastest, builds momentum)
// Both strategies keep the monthly total constant: when a loan is cleared, the payment that was going to it rolls
// onto the next one. Pure functions, no I/O. Management arithmetic, not advice from a lender or a regulator.

export interface DebtInput {
  id: string;
  name: string;
  balance: number; // what is still owed now
  annualRatePct: number;
  minPayment: number; // the scheduled monthly payment
}

export type PayoffStrategy = "minimum" | "avalanche" | "snowball";

export interface PayoffPlan {
  strategy: PayoffStrategy;
  months: number; // months until every debt is cleared (the cap if it never is)
  cleared: boolean; // false when a payment doesn't even cover the interest, or the cap was hit
  totalInterest: number;
  totalPaid: number;
  order: { id: string; name: string; month: number }[]; // when each loan is cleared, soonest first
}

const MAX_MONTHS = 600;
const EPS = 0.005;

export function simulatePayoff(debts: DebtInput[], extraMonthly: number, strategy: PayoffStrategy): PayoffPlan {
  const live = debts
    .filter((d) => d.balance > EPS && Number.isFinite(d.balance))
    .map((d) => ({ ...d, bal: d.balance, min: Math.max(0, Number.isFinite(d.minPayment) ? d.minPayment : 0), rate: Math.max(0, d.annualRatePct) / 1200 }));
  const extra = Math.max(0, Number.isFinite(extraMonthly) ? extraMonthly : 0);
  const budget = live.reduce((t, d) => t + d.min, 0) + (strategy === "minimum" ? 0 : extra);

  const priority = (a: (typeof live)[number], b: (typeof live)[number]) =>
    strategy === "snowball" ? a.bal - b.bal || b.rate - a.rate : b.rate - a.rate || a.bal - b.bal;

  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  const order: PayoffPlan["order"] = [];
  while (live.some((d) => d.bal > EPS) && month < MAX_MONTHS) {
    month++;
    for (const d of live) if (d.bal > EPS) { const i = d.bal * d.rate; d.bal += i; totalInterest += i; }
    let pool = strategy === "minimum" ? 0 : budget;
    // 1. Everyone gets their scheduled payment (never more than they owe).
    for (const d of live) {
      if (d.bal <= EPS) continue;
      const pay = Math.min(d.min, d.bal);
      d.bal -= pay; totalPaid += pay;
      if (strategy !== "minimum") pool -= pay;
    }
    // 2. Whatever is left of the monthly total goes to the target loan, then the next, and so on.
    if (strategy !== "minimum" && pool > EPS) {
      for (const d of [...live].filter((x) => x.bal > EPS).sort(priority)) {
        if (pool <= EPS) break;
        const pay = Math.min(pool, d.bal);
        d.bal -= pay; pool -= pay; totalPaid += pay;
      }
    }
    for (const d of live) if (d.bal <= EPS && !order.some((o) => o.id === d.id)) { d.bal = 0; order.push({ id: d.id, name: d.name, month }); }
  }
  const cleared = !live.some((d) => d.bal > EPS);
  return { strategy, months: month, cleared, totalInterest, totalPaid, order };
}

export interface PayoffComparison {
  extraMonthly: number;
  totalDebt: number;
  monthlyMinimum: number;
  plans: Record<PayoffStrategy, PayoffPlan>;
  interestSaved: { avalanche: number; snowball: number }; // vs paying only the minimums
  monthsSaved: { avalanche: number; snowball: number };
  cheapest: "avalanche" | "snowball";
}

export function comparePayoff(debts: DebtInput[], extraMonthly: number): PayoffComparison {
  const plans = {
    minimum: simulatePayoff(debts, 0, "minimum"),
    avalanche: simulatePayoff(debts, extraMonthly, "avalanche"),
    snowball: simulatePayoff(debts, extraMonthly, "snowball"),
  };
  const open = debts.filter((d) => d.balance > EPS);
  return {
    extraMonthly: Math.max(0, extraMonthly || 0),
    totalDebt: open.reduce((t, d) => t + d.balance, 0),
    monthlyMinimum: open.reduce((t, d) => t + Math.max(0, d.minPayment), 0),
    plans,
    interestSaved: { avalanche: plans.minimum.totalInterest - plans.avalanche.totalInterest, snowball: plans.minimum.totalInterest - plans.snowball.totalInterest },
    monthsSaved: { avalanche: plans.minimum.months - plans.avalanche.months, snowball: plans.minimum.months - plans.snowball.months },
    cheapest: plans.avalanche.totalInterest <= plans.snowball.totalInterest + 1e-9 ? "avalanche" : "snowball",
  };
}
