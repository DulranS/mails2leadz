// computeAllLedgers used to re-filter every list once per product (products x transactions: ~1s at 500 products /
// 100k sales, re-run on every snapshot). It now groups each list once. This proves the result is IDENTICAL to the
// old per-product filter on randomised data, including the awkward cases: same-day same-createdAt ties (order is
// preserved), returns that do and don't restock, adjustments, products with no activity, and transactions for a
// product that is not in the list (counted by both, v273: their stock must not vanish from the balance sheet).
//
// Run: npx tsx scripts/verify-ledger-grouping.ts
import { computeAllLedgers, computeProductLedger } from "../lib/calculations";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The previous implementation, kept here as the reference.
function reference(products: any[], purchases: any[], sales: any[], returns: any[], adjustments: any[]) {
  const out = new Map<string, any>();
  for (const product of products) {
    out.set(product.id, computeProductLedger(
      purchases.filter((p) => p.productId === product.id),
      sales.filter((s) => s.productId === product.id),
      returns.filter((r) => r.productId === product.id),
      adjustments.filter((a) => a.productId === product.id),
    ));
  }
  // v273: a product missing from the list still gets a ledger (its stock must count)
  const known = new Set(products.map((p) => p.id));
  const orphans = new Set<string>([...purchases, ...sales, ...returns, ...adjustments].map((x: any) => x.productId).filter((id: string) => !known.has(id)));
  for (const id of orphans) {
    out.set(id, computeProductLedger(
      purchases.filter((p) => p.productId === id),
      sales.filter((s) => s.productId === id),
      returns.filter((r) => r.productId === id),
      adjustments.filter((a) => a.productId === id),
    ));
  }
  return out;
}
const norm = (m: Map<string, any>) => JSON.stringify([...m.entries()].map(([k, v]) => [k, {
  ...v, saleCogs: [...v.saleCogs.entries()], returnRestockValue: [...v.returnRestockValue.entries()], adjustmentValue: [...v.adjustmentValue.entries()],
}]));

let pass = 0, fail = 0;
for (let seed = 1; seed <= 300; seed++) {
  const r = rng(seed); const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const P = int(0, 12);
  const products: any[] = Array.from({ length: P }, (_, i) => ({ id: `g${i}`, name: `G${i}`, type: "product", active: true, createdAt: 0 }));
  const pid = () => (r() < 0.05 ? "ghost" : `g${int(0, Math.max(P - 1, 0))}`); // 5%: a product that is not in the list
  const day = () => `2026-0${int(1, 3)}-${String(int(10, 12)).padStart(2, "0")}`; // few days -> many same-day ties
  const purchases = Array.from({ length: int(0, 60) }, (_, i) => ({ id: `pu${i}`, productId: pid(), qty: int(1, 50), unitCost: int(10, 900), date: day(), createdAt: int(1, 4) }));
  const sales = Array.from({ length: int(0, 120) }, (_, i) => ({ id: `sa${i}`, productId: pid(), qty: int(1, 12), unitPrice: int(50, 2000), date: day(), createdAt: int(1, 4) }));
  const returns = Array.from({ length: int(0, 20) }, (_, i) => { const s: any = sales[int(0, Math.max(sales.length - 1, 0))]; return { id: `re${i}`, productId: s?.productId ?? pid(), saleId: s?.id ?? "x", qty: int(1, 3), restock: r() < 0.6, date: day(), createdAt: int(1, 4) }; });
  const adjustments = Array.from({ length: int(0, 15) }, (_, i) => ({ id: `ad${i}`, productId: pid(), qty: int(-5, 20), reason: "count", date: day(), createdAt: int(1, 4) }));

  const want = norm(reference(products, purchases, sales, returns as any, adjustments as any));
  const got = norm(computeAllLedgers(products, purchases as any, sales as any, returns as any, adjustments as any));
  if (want === got) pass++; else { fail++; if (fail <= 5) console.error(`FAIL seed ${seed}: ledgers differ from the per-product filter`); }
}
// Omitted optional lists behave the same as empty ones
const p1: any[] = [{ id: "a", name: "A", type: "product", active: true, createdAt: 0 }];
const pu: any[] = [{ id: "pu1", productId: "a", qty: 5, unitCost: 100, date: "2026-01-01", createdAt: 1 }];
const sa: any[] = [{ id: "sa1", productId: "a", qty: 2, unitPrice: 150, date: "2026-01-02", createdAt: 2 }];
if (norm(computeAllLedgers(p1, pu, sa)) === norm(computeAllLedgers(p1, pu, sa, [], []))) pass++; else { fail++; console.error("FAIL: omitted lists differ from empty lists"); }
if (computeAllLedgers([], pu, sa).size === 1) pass++; else { fail++; console.error("FAIL: stock for a product missing from the list should still be counted (one ledger)"); }
const only = computeAllLedgers(p1, pu, sa).get("a")!;
if (only.qtyOnHand === 3 && only.wac === 100) pass++; else { fail++; console.error("FAIL: basic ledger wrong", only.qtyOnHand, only.wac); }

console.log(`ledger-grouping: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
