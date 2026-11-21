// Partner revenue (v259). A customer records who referred them (a name, as typed when the customer was added). A partner in the business log is a
// distributor, reseller, agent or other channel partner. Revenue from customers referred by a partner is that partner's revenue for the period. Names
// are matched ignoring case and spacing; a misspelt name is not matched, so it shows as unattributed rather than being guessed. Pure.

export interface PartnerCustomer { name: string; referredBy?: string }
export interface PartnerSale { date: string; qty: number; unitPrice: number; customer?: string }

const norm = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function partnerRevenue(customers: PartnerCustomer[], sales: PartnerSale[], partners: string[], period: { from: string; to: string }) {
  const byCustomer = new Map<string, number>();
  let total = 0;
  for (const s of sales) {
    const m = s.date.slice(0, 7);
    if (m < period.from || m > period.to) continue;
    const value = s.qty * s.unitPrice;
    total += value;
    const key = norm(s.customer) || "walk-in";
    byCustomer.set(key, (byCustomer.get(key) ?? 0) + value);
  }
  const referrerOf = new Map(customers.map((c) => [norm(c.name), norm(c.referredBy)]));
  const rows = partners.map((p) => {
    const pn = norm(p);
    const refd = [...referrerOf.entries()].filter(([, ref]) => ref && ref === pn).map(([name]) => name);
    const revenue = refd.reduce((t, name) => t + (byCustomer.get(name) ?? 0), 0);
    return { partner: p, customers: refd.length, revenue: Math.round(revenue * 100) / 100, sharePct: total > 0 ? Math.round((revenue / total) * 1000) / 10 : null };
  });
  const attributed = rows.reduce((t, r) => t + r.revenue, 0);
  return { rows, total: Math.round(total * 100) / 100, unattributed: Math.round((total - attributed) * 100) / 100 };
}
