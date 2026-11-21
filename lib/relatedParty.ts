// Related-party sales and purchases (pass 350). A customer or supplier the owner marks as related (a family member, a company they control,
// a director). Customers and suppliers are matched by name, as the rest of the app matches them. The share is taken of sales and of purchases
// in the range, before discounts and tax. Flagged over 10% (a rule of thumb, shown beside the result). Pure.

export const RELATED_PARTY_SHARE_LIMIT_PCT = 10;

export interface RpSale { customer?: string; qty: number; unitPrice: number; date: string }
export interface RpPurchase { supplier?: string; qty: number; unitCost: number; date: string }
export interface RpParty { name: string; relatedParty?: boolean }

const nameKey = (s: string | undefined | null): string => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const r2 = (n: number): number => Math.round(n * 100) / 100;
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Sales and purchases in [from, to] (months as yyyy-mm), and the part with a related party. Null share when there is no total. */
export function relatedPartyShare({ sales, purchases, customers, suppliers, from, to }: {
  sales: RpSale[]; purchases: RpPurchase[]; customers: RpParty[]; suppliers: RpParty[]; from: string; to: string;
}) {
  const relatedCustomers = new Set(customers.filter((c) => c.relatedParty && nameKey(c.name)).map((c) => nameKey(c.name)));
  const relatedSuppliers = new Set(suppliers.filter((s) => s.relatedParty && nameKey(s.name)).map((s) => nameKey(s.name)));
  const inRange = (date: string): boolean => {
    const m = String(date ?? "").slice(0, 7);
    return m >= from && m <= to;
  };
  let salesTotal = 0;
  let salesRelated = 0;
  for (const s of sales) {
    if (!inRange(s.date)) continue;
    const amount = (Number(s.qty) || 0) * (Number(s.unitPrice) || 0);
    salesTotal += amount;
    if (relatedCustomers.has(nameKey(s.customer))) salesRelated += amount;
  }
  let purchasesTotal = 0;
  let purchasesRelated = 0;
  for (const p of purchases) {
    if (!inRange(p.date)) continue;
    const amount = (Number(p.qty) || 0) * (Number(p.unitCost) || 0);
    purchasesTotal += amount;
    if (relatedSuppliers.has(nameKey(p.supplier))) purchasesRelated += amount;
  }
  return {
    salesTotal: r2(salesTotal),
    salesRelated: r2(salesRelated),
    purchasesTotal: r2(purchasesTotal),
    purchasesRelated: r2(purchasesRelated),
    salesPct: pct(salesRelated, salesTotal),
    purchasesPct: pct(purchasesRelated, purchasesTotal),
  };
}
