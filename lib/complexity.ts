// Financial complexity (v236). Definition: complexity is the cost of carrying items that earn little. Three things add it: products that bring in
// little of the revenue, suppliers that take too small a share of spend to be worth the admin, and monthly recurring costs too small to be worth
// managing on their own. The review counts each from the records and says what to look at. It changes nothing. Pure.

export const TAIL_REVENUE_SHARE_PCT = 1;      // a product below this share of twelve-month revenue is in the tail
export const TINY_SUPPLIER_SPEND_PCT = 1;     // a supplier below this share of spend is a small account
export const SMALL_RECURRING_PCT_OF_REVENUE = 0.2; // a monthly cost below this share of monthly revenue is small

export interface ProductRevenue { productId: string; name: string; revenue: number; contribution: number }
export interface SupplierSpend { supplier: string; spend: number; sharePct: number }
export interface RecurringCost { name: string; monthlyAmount: number }

export function complexityReview(i: {
  products: ProductRevenue[];
  suppliers: SupplierSpend[];
  recurring: RecurringCost[];
  monthlyRevenue: number;
}) {
  const totalRevenue = i.products.reduce((t, p) => t + p.revenue, 0);
  const tailProducts = i.products
    .filter((p) => p.revenue > 0 && totalRevenue > 0 && (p.revenue / totalRevenue) * 100 < TAIL_REVENUE_SHARE_PCT)
    .map((p) => ({ name: p.name, sharePct: Math.round((p.revenue / totalRevenue) * 1000) / 10, contribution: Math.round(p.contribution * 100) / 100 }))
    .sort((a, b) => a.contribution - b.contribution);
  const smallSuppliers = i.suppliers
    .filter((s) => s.supplier !== "No supplier recorded" && s.sharePct < TINY_SUPPLIER_SPEND_PCT)
    .map((s) => ({ supplier: s.supplier, sharePct: s.sharePct, spend: s.spend }));
  const smallRecurring = i.monthlyRevenue > 0
    ? i.recurring.filter((r) => (r.monthlyAmount / i.monthlyRevenue) * 100 < SMALL_RECURRING_PCT_OF_REVENUE).map((r) => ({ name: r.name, monthlyAmount: r.monthlyAmount }))
    : [];
  const items = tailProducts.length + smallSuppliers.length + smallRecurring.length;
  const level: "simple" | "moderate" | "complex" = items <= 3 ? "simple" : items <= 10 ? "moderate" : "complex";
  return { tailProducts, smallSuppliers, smallRecurring, items, level };
}
