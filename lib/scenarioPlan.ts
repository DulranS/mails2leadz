// Probability-weighted scenario plan (v235): instead of one forecast, a set of scenarios, each with the chance it happens. Each gives the monthly
// profit it would produce from the business's own contribution margin and fixed costs; the expected profit weights them by their chances. The
// largest-customer loss is modelled from the sales history: that customer's share of revenue is removed in the scenarios that lose them.
// Pure: no I/O. The chances are the owner's judgement; the arithmetic is exact.

export interface Scenario { name: string; probability: number; revenueChangePct: number; loseLargestCustomer: boolean }
export interface PlanInput {
  monthlyRevenue: number; // a typical month, from the business's own history
  contributionMarginPct: number; // what each unit of revenue leaves after its variable costs
  monthlyFixedCosts: number;
  largestCustomerSharePct: number; // that customer's share of revenue, from the sales history
  scenarios: Scenario[];
}

export function validatePlan(i: PlanInput): string | null {
  if (i.scenarios.length === 0) return "Add at least one scenario.";
  const total = i.scenarios.reduce((t, s) => t + s.probability, 0);
  if (Math.abs(total - 100) > 0.01) return `The chances must add up to 100% (they add to ${Math.round(total * 10) / 10}%).`;
  if (i.scenarios.some((s) => s.probability < 0 || s.revenueChangePct < -100)) return "A chance cannot be negative, and revenue cannot fall by more than 100%.";
  if (i.contributionMarginPct < 0 || i.contributionMarginPct > 100) return "The contribution margin must be between 0 and 100%.";
  return null;
}

export function planOutcome(i: PlanInput) {
  const cm = i.contributionMarginPct / 100;
  const rows = i.scenarios.map((s) => {
    const revenueKept = 1 + s.revenueChangePct / 100;
    const customerKept = s.loseLargestCustomer ? 1 - i.largestCustomerSharePct / 100 : 1;
    const revenue = i.monthlyRevenue * revenueKept * customerKept;
    const profit = revenue * cm - i.monthlyFixedCosts;
    return { name: s.name, probability: s.probability, revenue: round2(revenue), profit: round2(profit) };
  });
  const expectedProfit = round2(rows.reduce((t, r) => t + (r.probability / 100) * r.profit, 0));
  const breakEvenRevenue = cm > 0 ? round2(i.monthlyFixedCosts / cm) : null;
  // Operating leverage: how much monthly profit moves for each 1% change in revenue, given the fixed costs above.
  const profitPerRevenuePoint = round2(i.monthlyRevenue * cm / 100);
  return { rows, expectedProfit, breakEvenRevenue, profitPerRevenuePoint, chanceOfLoss: round1(rows.reduce((t, r) => t + (r.profit < 0 ? r.probability : 0), 0)) };
}

// The largest customer's share of revenue over the window (default twelve months), from sales with a customer name. No customer means walk-in
// trade, grouped together. Returns null when there are no sales in the window.
export function largestCustomerShare(sales: { date: string; qty: number; unitPrice: number; customer?: string }[], todayIso: string, months = 12) {
  const end = Date.parse(`${todayIso}T00:00:00Z`);
  const start = end - months * 30 * 86_400_000;
  const byCustomer = new Map<string, number>();
  let total = 0;
  for (const s of sales) {
    const t = Date.parse(`${s.date}T00:00:00Z`);
    const value = s.qty * s.unitPrice;
    if (!(value > 0) || t < start || t > end) continue;
    const who = (s.customer ?? "").trim() || "Walk-in trade";
    byCustomer.set(who, (byCustomer.get(who) ?? 0) + value);
    total += value;
  }
  if (total <= 0) return null;
  const [name, value] = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, sharePct: round1((value / total) * 100) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
