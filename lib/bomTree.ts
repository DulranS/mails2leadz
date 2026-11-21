// Multi-level bills of materials: a made item whose recipe uses other made items (a sub-assembly), which have their own recipes.
// Planning a run walks the whole tree: each level uses what is on hand first, and makes the rest bottom-up, so the plan lists
// the sub-runs to record first, then the finished run, and the raw materials still missing.
//
// Read-only and pure. Recording stays one run at a time (recordProduction in contexts/DataContext.tsx), so each run is valued at
// the average cost the ledger has when it is written. This module only plans it.
import type { BomLine } from "./production";

export const MAX_BOM_DEPTH = 8;
export const MAX_BUILDABLE = 100000;

export type BomOf = (productId: string) => BomLine[];
export type OnHandOf = (productId: string) => number;

// A recipe that leads back to itself, or nests deeper than MAX_BOM_DEPTH. Null when it is sound. The `path` is the chain of
// products that loops back, so the message can name them.
export function bomProblem(productId: string, bomOf: BomOf): { kind: "loop"; path: string[] } | { kind: "deep" } | null {
  const stack: string[] = [productId];
  const walk = (id: string): { kind: "loop"; path: string[] } | { kind: "deep" } | null => {
    if (stack.length > MAX_BOM_DEPTH) return { kind: "deep" };
    for (const c of bomOf(id)) {
      const next = c.componentProductId;
      if (stack.includes(next)) return { kind: "loop", path: [...stack, next] };
      stack.push(next);
      const found = walk(next);
      stack.pop();
      if (found) return found;
    }
    return null;
  };
  return walk(productId);
}

export interface RunPlan {
  // Runs to record, in order: sub-assemblies first, the requested run last. Each is a product and the good units to make.
  runs: { productId: string; qty: number }[];
  // Raw materials (products with no recipe) still missing, after using everything on hand at every level.
  shortages: { productId: string; short: number }[];
  // How much of each raw material the whole plan uses from stock.
  rawUsed: { productId: string; qty: number }[];
  // Estimated cost of the plan at the average cost each product has now (raw materials and sub-assemblies on hand).
  estimatedCost: number;
  feasible: boolean;
}

// Plans `qty` good units of `productId`. Stock is shared across the tree, so a raw material used by two branches is counted once.
export function planRun(productId: string, qty: number, i: { bomOf: BomOf; onHandOf: OnHandOf; costOf?: (id: string) => number }): RunPlan {
  const avail = new Map<string, number>();
  const have = (id: string) => {
    if (!avail.has(id)) avail.set(id, Math.max(0, i.onHandOf(id)));
    return avail.get(id) as number;
  };
  const take = (id: string, n: number) => avail.set(id, have(id) - n);
  const runs: { productId: string; qty: number }[] = [];
  const shortMap = new Map<string, number>();
  const rawMap = new Map<string, number>();
  const costOf = i.costOf ?? (() => 0);
  let estimatedCost = 0;

  // Making `n` units of `id`: each recipe line needs its amount per unit, drawn from stock first, then made or, for raw, short.
  const need = (id: string, n: number, depth: number) => {
    if (depth > MAX_BOM_DEPTH) return;
    const bom = i.bomOf(id);
    for (const c of bom) {
      const required = c.qtyPerUnit * n;
      if (!(required > 0)) continue;
      const cid = c.componentProductId;
      const fromStock = Math.min(have(cid), required);
      if (fromStock > 0) {
        take(cid, fromStock);
        estimatedCost += fromStock * costOf(cid);
        if (i.bomOf(cid).length === 0) rawMap.set(cid, (rawMap.get(cid) ?? 0) + fromStock);
      }
      const remaining = required - fromStock;
      if (remaining <= 0) continue;
      if (i.bomOf(cid).length > 0) {
        // A sub-assembly that is short: plan its own runs first, then this one is made from them.
        need(cid, remaining, depth + 1);
        runs.push({ productId: cid, qty: remaining });
      } else {
        shortMap.set(cid, (shortMap.get(cid) ?? 0) + remaining);
      }
    }
  };

  if (!(qty > 0)) return { runs: [], shortages: [], rawUsed: [], estimatedCost: 0, feasible: true };
  need(productId, qty, 0);
  runs.push({ productId, qty });
  return {
    runs,
    shortages: [...shortMap.entries()].map(([id, short]) => ({ productId: id, short })),
    rawUsed: [...rawMap.entries()].map(([id, q]) => ({ productId: id, qty: q })),
    estimatedCost,
    feasible: shortMap.size === 0,
  };
}

// The most good units the whole tree can make from raw stock, making sub-assemblies as needed. Zero when there is no recipe.
// Feasibility only gets harder as the quantity grows, so a doubling search then a bisection finds the limit.
export function buildableFromRaw(productId: string, i: { bomOf: BomOf; onHandOf: OnHandOf }): number {
  if (i.bomOf(productId).length === 0) return 0;
  const ok = (n: number) => planRun(productId, n, i).feasible;
  if (!ok(1)) return 0;
  let lo = 1;
  let hi = 2;
  while (hi <= MAX_BUILDABLE && ok(hi)) {
    lo = hi;
    hi *= 2;
  }
  if (hi > MAX_BUILDABLE) return MAX_BUILDABLE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
