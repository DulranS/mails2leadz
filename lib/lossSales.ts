// Sales that lost money: "never price to the bottom", made visible.
//
// A sale is below cost when what it brought in, after any discount, was less than the goods plus the per-sale costs
// attached to it (contribution margin below zero). The cause is a price or a discount that was too low, so this looks at
// the last 90 days and shows which items and which customers it keeps happening with.
//
// What is left out on purpose, so the list is only pricing decisions:
//   - sales with a refund against them (a return is not a pricing choice; it has its own records)
//   - sales marked oversold (stock was not there, so the cost of goods is not reliable)
// Pure arithmetic over figures the app already computes (SaleEconomics); changes nothing, writes nothing.
import { addDays, isIsoDate } from "./playbook";

export const LOSS_WINDOW_DAYS = 90;
const CENT = 0.005;

export interface LossSaleInput {
  id: string;
  productId: string;
  date: string; // ISO
  customer?: string;
}
export interface LossEconomicsInput {
  saleId: string;
  contributionMargin: number;
  revenue: number;
  refundedAmount: number;
  discountedAmount: number;
  oversold: boolean;
}

export interface LossLine {
  key: string; // product id, or the customer name in lower case
  name: string;
  sales: number; // sales below cost
  loss: number; // total money lost on them
}

export interface LossSalesSummary {
  considered: number; // sales in the window that were judged (no refund, not oversold)
  belowCost: number;
  shareBelowCostPct: number | null; // belowCost / considered, one decimal; null when nothing was judged
  totalLoss: number;
  discounted: number; // of the below-cost sales, how many carried a discount
  byItem: LossLine[]; // biggest loss first, at most 5
  byCustomer: LossLine[]; // biggest loss first, at most 3, only sales with a customer name
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ckey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function summarizeLossSales(
  sales: LossSaleInput[],
  economics: LossEconomicsInput[],
  productNames: Map<string, string>,
  today: string
): LossSalesSummary {
  const from = addDays(today, -LOSS_WINDOW_DAYS);
  const econ = new Map(economics.map((e) => [e.saleId, e]));
  let considered = 0, belowCost = 0, totalLoss = 0, discounted = 0;
  const items = new Map<string, LossLine>();
  const customers = new Map<string, LossLine>();
  for (const s of sales) {
    if (!isIsoDate(s.date) || s.date < from || s.date > today) continue;
    const e = econ.get(s.id);
    if (!e || e.oversold || e.refundedAmount > 0 || !Number.isFinite(e.contributionMargin)) continue;
    considered++;
    if (e.contributionMargin >= -CENT) continue;
    const loss = -e.contributionMargin;
    belowCost++;
    totalLoss += loss;
    if (e.discountedAmount > 0) discounted++;
    const it = items.get(s.productId) ?? { key: s.productId, name: productNames.get(s.productId) ?? "An item that was removed", sales: 0, loss: 0 };
    it.sales++;
    it.loss += loss;
    items.set(s.productId, it);
    const cn = (s.customer ?? "").trim();
    if (cn) {
      const ck = ckey(cn);
      const c = customers.get(ck) ?? { key: ck, name: cn, sales: 0, loss: 0 };
      c.sales++;
      c.loss += loss;
      customers.set(ck, c);
    }
  }
  const top = (m: Map<string, LossLine>, n: number) =>
    [...m.values()]
      .map((l) => ({ ...l, loss: money(l.loss) }))
      .sort((a, b) => b.loss - a.loss || b.sales - a.sales || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .slice(0, n);
  return {
    considered,
    belowCost,
    shareBelowCostPct: considered > 0 ? Math.round((belowCost / considered) * 1000) / 10 : null,
    totalLoss: money(totalLoss),
    discounted,
    byItem: top(items, 5),
    byCustomer: top(customers, 3),
  };
}
