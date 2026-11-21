// Customer profitability (v262). A customer is worth serving only if what they leave after the cost of what they bought, the refunds they drew and the
// discounts given is positive. "A bad customer is worse than no customer": the screen lists each customer's profit, worst first, with a flag. Money only:
// the time a customer takes is not measured. Pure.
import { balanceAfter, monthlyPayment } from "./rateStress";

export interface PSale { id: string; date: string; productId: string; qty: number; unitPrice: number; customer?: string; promoOffAmount?: number }
export interface PReturn { saleId: string; date: string; refundAmount: number }

export type CustomerFlag = "loses money" | "thin margin" | "returns a lot" | "healthy";

export function customerProfitability(
  sales: PSale[],
  returns: PReturn[],
  unitCostOf: (productId: string) => number,
  period: { from: string; to: string },
) {
  const inP = (d: string) => d.slice(0, 7) >= period.from && d.slice(0, 7) <= period.to;
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const byName = new Map<string, { revenue: number; cost: number; refunds: number; discounts: number }>();
  const row = (name: string) => {
    let r = byName.get(name);
    if (!r) { r = { revenue: 0, cost: 0, refunds: 0, discounts: 0 }; byName.set(name, r); }
    return r;
  };
  for (const s of sales) {
    if (!inP(s.date) || !s.customer?.trim()) continue;
    const r = row(s.customer.trim());
    r.revenue += s.qty * s.unitPrice;
    r.cost += s.qty * unitCostOf(s.productId);
    r.discounts += s.promoOffAmount ?? 0;
  }
  for (const ret of returns) {
    if (!inP(ret.date)) continue;
    const s = saleById.get(ret.saleId);
    if (!s?.customer?.trim()) continue;
    row(s.customer.trim()).refunds += ret.refundAmount;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = [...byName.entries()].map(([name, v]) => {
    const profit = r2(v.revenue - v.cost - v.refunds - v.discounts);
    const marginPct = v.revenue > 0 ? Math.round((profit / v.revenue) * 1000) / 10 : null;
    const returnPct = v.revenue > 0 ? Math.round((v.refunds / v.revenue) * 1000) / 10 : null;
    const flag: CustomerFlag = profit <= 0 ? "loses money" : returnPct !== null && returnPct >= 15 ? "returns a lot" : marginPct !== null && marginPct < 5 ? "thin margin" : "healthy";
    return { name, revenue: r2(v.revenue), profit, marginPct, returnPct, flag };
  });
  rows.sort((a, b) => a.profit - b.profit);
  return rows;
}

// Principal repaid on a loan in a period: the balance owed at the start of the period less the balance at its end. Counts payments from the loan's start.
export function principalRepaid(loans: { principal: number; annualRatePct: number; termMonths: number; startDate: string; active?: boolean }[], period: { from: string; to: string }) {
  const monthsBetween = (from: string, to: string) => {
    const [fy, fm] = from.slice(0, 7).split("-").map(Number);
    const [ty, tm] = to.slice(0, 7).split("-").map(Number);
    return (ty - fy) * 12 + (tm - fm);
  };
  let total = 0;
  for (const l of loans) {
    if (l.active === false) continue;
    const startPaid = Math.max(0, monthsBetween(l.startDate, period.from));
    const endPaid = Math.max(0, monthsBetween(l.startDate, period.to) + 1);
    const before = balanceAfter(l.principal, l.annualRatePct, l.termMonths, startPaid);
    const after = balanceAfter(l.principal, l.annualRatePct, l.termMonths, endPaid);
    total += Math.max(0, before - after);
  }
  return Math.round(total * 100) / 100;
}

export { monthlyPayment };
