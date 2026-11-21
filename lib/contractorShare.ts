// Contractor and talent shares (v275). A product can name the contractor or talent who earns a share of its sales, and the share in percent. For each period
// this works out, per contractor, the revenue from their products (before tax) and the amount earned (revenue times share, rounded once per contractor).
// Sales of products with no contractor are reported as unassigned. A product whose share is not between 0% and 100% is reported as a problem and left
// unassigned. Returns are not netted off here yet, and the amounts are not yet deducted from profit or posted to the journal. Pure.

export interface CsProduct { id: string; name: string; contractorName?: string; contractorSharePct?: number }
export interface CsSale { id: string; date: string; productId: string; qty: number; unitPrice: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function contractorShares(sales: CsSale[], products: CsProduct[], period: { from: string; to: string }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const problems: string[] = [];
  const groups = new Map<string, { name: string; sharePct: number; revenue: number }>();
  let unassigned = 0;
  const seenProblem = new Set<string>();
  for (const s of sales) {
    const ym = s.date.slice(0, 7);
    if (ym < period.from || ym > period.to) continue;
    const revenue = s.qty * s.unitPrice;
    const p = byId.get(s.productId);
    const name = p?.contractorName?.trim() ?? "";
    const pct = p?.contractorSharePct;
    if (!name) { unassigned += revenue; continue; }
    if (pct === undefined || !(pct >= 0 && pct <= 100)) {
      if (p && !seenProblem.has(p.id)) { seenProblem.add(p.id); problems.push(`${p.name}: the share for ${name} must be between 0% and 100%.`); }
      unassigned += revenue;
      continue;
    }
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { name, sharePct: pct, revenue: 0 };
    if (g.sharePct !== pct) { problems.push(`${name} has different shares on different products; the first one is used.`); }
    g.revenue += revenue;
    groups.set(key, g);
  }
  const contractors = [...groups.values()]
    .map((g) => ({ name: g.name, sharePct: g.sharePct, revenue: r2(g.revenue), earned: r2(g.revenue * g.sharePct / 100) }))
    .sort((a, b) => b.earned - a.earned);
  return {
    contractors,
    unassignedRevenue: r2(unassigned),
    totalEarned: r2(contractors.reduce((t, c) => t + c.earned, 0)),
    problems,
  };
}
