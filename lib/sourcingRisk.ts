// Sourcing risk (v226b): how dependent the business is on each supplier. A product bought from only one supplier stops if that supplier does;
// a supplier that takes most of the spend is a single point of failure for the whole business. Measured over the last twelve months of
// purchases. Pure: reads purchases, changes nothing.

export interface PurchaseLine { productId: string; qty: number; unitCost: number; date: string; supplier?: string }
export const SINGLE_SOURCE_SPEND_SHARE_PCT = 50; // a supplier taking at least this share of spend is flagged

export interface ProductSourcing { productId: string; suppliers: string[]; singleSource: boolean; spend: number }
export interface SupplierDependence { supplier: string; spend: number; sharePct: number; flagged: boolean }

const DAY = 86_400_000;

export function sourcingRisk(purchases: PurchaseLine[], todayIso: string) {
  const end = Date.parse(`${todayIso}T00:00:00Z`);
  const start = end - 365 * DAY;
  const recent = purchases.filter((p) => {
    const t = Date.parse(`${p.date}T00:00:00Z`);
    return t >= start && t <= end && p.qty > 0 && p.unitCost >= 0;
  });
  const UNKNOWN = "No supplier recorded";
  const supplierOf = (p: PurchaseLine) => (p.supplier ?? "").trim() || UNKNOWN;
  const totalSpend = recent.reduce((t, p) => t + p.qty * p.unitCost, 0);

  const bySupplier = new Map<string, number>();
  const byProduct = new Map<string, { suppliers: Set<string>; spend: number }>();
  for (const p of recent) {
    const s = supplierOf(p);
    const spend = p.qty * p.unitCost;
    bySupplier.set(s, (bySupplier.get(s) ?? 0) + spend);
    const entry = byProduct.get(p.productId) ?? { suppliers: new Set<string>(), spend: 0 };
    entry.suppliers.add(s);
    entry.spend += spend;
    byProduct.set(p.productId, entry);
  }

  const products: ProductSourcing[] = [...byProduct.entries()].map(([productId, e]) => ({
    productId,
    suppliers: [...e.suppliers].sort(),
    // A product whose supplier was never recorded is not single-sourced; its source is unknown, which is a separate gap.
    singleSource: e.suppliers.size === 1 && !e.suppliers.has(UNKNOWN),
    spend: round2(e.spend),
  })).sort((a, b) => Number(b.singleSource) - Number(a.singleSource) || b.spend - a.spend);

  const suppliers: SupplierDependence[] = [...bySupplier.entries()].map(([supplier, spend]) => {
    const sharePct = totalSpend > 0 ? round1((spend / totalSpend) * 100) : 0;
    return { supplier, spend: round2(spend), sharePct, flagged: sharePct >= SINGLE_SOURCE_SPEND_SHARE_PCT };
  }).sort((a, b) => b.spend - a.spend);

  return {
    totalSpend: round2(totalSpend),
    products,
    suppliers,
    singleSourceCount: products.filter((p) => p.singleSource).length,
    dominantSupplierFlagged: suppliers.some((s) => s.flagged && s.supplier !== UNKNOWN),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
