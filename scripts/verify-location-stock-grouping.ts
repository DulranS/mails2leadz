// computeLocationStockLevels used to re-scan every list once per product x location (1.2s at 500 products / 100k
// sales, re-run on every snapshot). It now sums each list once per product + location. This proves the quantities are
// IDENTICAL to the old per-product/location filter().reduce() on randomised data: records with no location (default
// location), a business with no default location, inactive locations, returns that do and don't restock, adjustments
// (negative too), transfers in and out, products that are inactive or not stock items, and ghost products.
//
// Run: npx tsx scripts/verify-location-stock-grouping.ts
import { computeLocationStockLevels, resolveLocationId } from "../lib/stockTracking";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The previous implementation, kept as the reference.
function reference(products: any[], locations: any[], purchases: any[], sales: any[], returns: any[], adjustments: any[], transfers: any[]) {
  const activeLocations = locations.filter((l) => l.active);
  const result: any[] = [];
  for (const product of products.filter((p) => p.type === "product" && p.active)) {
    for (const location of activeLocations) {
      const inLoc = (id: string | undefined) => resolveLocationId(id, locations) === location.id;
      const purchased = purchases.filter((p) => p.productId === product.id && inLoc(p.locationId)).reduce((s, p) => s + p.qty, 0);
      const sold = sales.filter((s) => s.productId === product.id && inLoc(s.locationId)).reduce((s, x) => s + x.qty, 0);
      const restocked = returns.filter((r) => r.productId === product.id && r.restock && inLoc(r.locationId)).reduce((s, r) => s + r.qty, 0);
      const adjusted = adjustments.filter((a) => a.productId === product.id && inLoc(a.locationId)).reduce((s, a) => s + a.qty, 0);
      const tin = transfers.filter((t) => t.productId === product.id && t.toLocationId === location.id).reduce((s, t) => s + t.qty, 0);
      const tout = transfers.filter((t) => t.productId === product.id && t.fromLocationId === location.id).reduce((s, t) => s + t.qty, 0);
      result.push({ productId: product.id, productName: product.name, locationId: location.id, qtyOnHand: purchased - sold + restocked + adjusted + tin - tout });
    }
  }
  return result;
}

let pass = 0, fail = 0;
for (let seed = 1; seed <= 400; seed++) {
  const r = rng(seed); const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const L = int(0, 4);
  const locations: any[] = Array.from({ length: L }, (_, i) => ({ id: `L${i}`, name: `Loc${i}`, active: r() < 0.75, isDefault: i === 0 && r() < 0.85 }));
  const P = int(0, 10);
  const products: any[] = Array.from({ length: P }, (_, i) => ({ id: `g${i}`, name: `G${i}`, type: r() < 0.85 ? "product" : "service", active: r() < 0.9 }));
  const pid = () => (r() < 0.05 ? "ghost" : `g${int(0, Math.max(P - 1, 0))}`);
  const loc = () => (r() < 0.3 ? undefined : r() < 0.05 ? "L_gone" : `L${int(0, Math.max(L - 1, 0))}`);
  const purchases = Array.from({ length: int(0, 60) }, (_, i) => ({ id: `pu${i}`, productId: pid(), qty: int(1, 50) / (r() < 0.3 ? 4 : 1), locationId: loc() }));
  const sales = Array.from({ length: int(0, 120) }, (_, i) => ({ id: `sa${i}`, productId: pid(), qty: int(1, 12) / (r() < 0.3 ? 3 : 1), locationId: loc() }));
  const returns = Array.from({ length: int(0, 20) }, (_, i) => ({ id: `re${i}`, productId: pid(), qty: int(1, 3), restock: r() < 0.6, locationId: loc() }));
  const adjustments = Array.from({ length: int(0, 15) }, (_, i) => ({ id: `ad${i}`, productId: pid(), qty: int(-5, 20), locationId: loc() }));
  const transfers = Array.from({ length: int(0, 15) }, (_, i) => ({ id: `tr${i}`, productId: pid(), qty: int(1, 9), fromLocationId: loc() ?? "L0", toLocationId: loc() ?? "L1" }));

  const want = JSON.stringify(reference(products, locations, purchases, sales, returns, adjustments, transfers));
  const got = JSON.stringify(computeLocationStockLevels(products, locations, purchases as any, sales as any, returns as any, adjustments as any, transfers as any));
  if (want === got) pass++; else { fail++; if (fail <= 5) console.error(`FAIL seed ${seed}: stock levels differ from the per-product/location filter`); }
}
// Omitted optional lists behave like empty ones; no locations -> no rows
const prods: any[] = [{ id: "a", name: "A", type: "product", active: true }];
const locs: any[] = [{ id: "L1", name: "Main", active: true, isDefault: true }];
const pu: any[] = [{ id: "pu1", productId: "a", qty: 10 }];
const sa: any[] = [{ id: "sa1", productId: "a", qty: 4, locationId: "L1" }];
const one = computeLocationStockLevels(prods, locs, pu, sa);
if (one.length === 1 && one[0].qtyOnHand === 6) pass++; else { fail++; console.error("FAIL: basic default-location stock wrong", JSON.stringify(one)); }
if (computeLocationStockLevels(prods, [], pu, sa).length === 0) pass++; else { fail++; console.error("FAIL: no locations should give no rows"); }

console.log(`location-stock-grouping: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
