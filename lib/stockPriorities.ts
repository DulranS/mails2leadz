// Stock priorities (v206b): two decisions an inventory owner keeps making. (1) Which products deserve the money: a grid of recent demand
// against margin, so high-demand high-margin lines are protected and low-demand low-margin lines are reviewed. (2) What to do with stock
// that has stopped selling: a clearance plan that shows the cash each markdown would release and the holding cost it saves, so clearing is
// a comparison, not a guess. Estimates only; nothing is priced or ordered by these figures. Pure.

export type PriorityQuadrant = "protect" | "push_margin" | "volume" | "review";

export const PRIORITY_LABEL: Record<PriorityQuadrant, string> = {
  protect: "High demand, high margin: protect and keep in stock",
  push_margin: "Lower demand, high margin: promote it to sell more",
  volume: "High demand, lower margin: check the price or cost",
  review: "Lower demand, lower margin: review, reduce or stop buying",
};

export interface PriorityRow {
  productId: string;
  name: string;
  unitsSold90: number;
  marginPct: number | null;
  quadrant: PriorityQuadrant | null; // null when there is no margin to judge
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The order the grid is read in: the protected lines first, then the rest; the ones that cannot be judged last.
const ORDER: PriorityQuadrant[] = ["protect", "push_margin", "volume", "review"];
const rankOf = (q: PriorityQuadrant | null) => (q === null ? ORDER.length : ORDER.indexOf(q));

// Each product on the grid. Demand and margin are split at their medians across the products that have both, so the grid is relative to
// this business, not to a number picked in advance.
export function priorityGrid(items: { productId: string; name: string; unitsSold90: number; unitPrice: number; unitCost: number }[]): PriorityRow[] {
  const rows = items.map((i) => ({
    productId: i.productId,
    name: i.name,
    unitsSold90: i.unitsSold90,
    marginPct: i.unitPrice > 0 ? Math.round(((i.unitPrice - i.unitCost) / i.unitPrice) * 1000) / 10 : null,
  }));
  const judged = rows.filter((r) => r.marginPct !== null);
  const demandMid = median(judged.map((r) => r.unitsSold90));
  const marginMid = median(judged.map((r) => r.marginPct as number));
  return rows.map((r) => {
    if (r.marginPct === null) return { ...r, quadrant: null };
    const highDemand = r.unitsSold90 >= demandMid;
    const highMargin = (r.marginPct as number) >= marginMid;
    const quadrant: PriorityQuadrant = highDemand && highMargin ? "protect" : !highDemand && highMargin ? "push_margin" : highDemand ? "volume" : "review";
    return { ...r, quadrant };
  }).sort((a, b) => rankOf(a.quadrant) - rankOf(b.quadrant) || b.unitsSold90 - a.unitsSold90);
}

export const MARKDOWN_STEPS = [20, 35, 50] as const;
export const CLEAR_AFTER_IDLE_DAYS = 90; // stock that has not sold for this long is worth clearing at any price that still covers its cost

export type ClearanceAdvice = "clear" | "below_cost" | "hold";

export interface ClearanceStep {
  markdownPct: number;
  pricePerUnit: number;
  cashReleased: number; // the money from selling all the stock at this price
  marginLeftPct: number | null; // margin per unit at this price, as a share of the price
  advice: ClearanceAdvice;
}

// For stock that has stopped selling: each markdown step, the cash it releases, and the advice. The rule is deliberately plain: clear at a
// price that still covers the cost once the stock has been idle long enough; a price below cost is shown but not advised; otherwise hold.
export function clearancePlan(item: { qtyOnHand: number; unitCost: number; unitPrice: number; idleDays: number }): ClearanceStep[] {
  if (item.qtyOnHand <= 0 || item.unitPrice <= 0) return [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return MARKDOWN_STEPS.map((pct) => {
    const price = item.unitPrice * (1 - pct / 100);
    const marginLeft = price > 0 ? ((price - item.unitCost) / price) * 100 : null;
    const advice: ClearanceAdvice = price < item.unitCost ? "below_cost" : item.idleDays >= CLEAR_AFTER_IDLE_DAYS ? "clear" : "hold";
    return {
      markdownPct: pct,
      pricePerUnit: r2(price),
      cashReleased: r2(price * item.qtyOnHand),
      marginLeftPct: marginLeft === null ? null : Math.round(marginLeft * 10) / 10,
      advice,
    };
  });
}
