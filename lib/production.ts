// Production arithmetic for a bill of materials: how much of each input a run uses (including scrap that was wasted), what a
// good unit costs once scrap and labour are spread over it, how many units can be made from stock on hand right now, and
// which made items are below their minimum and can be made.
//
// Read-only and pure: nothing here writes. recordProduction (contexts/DataContext.tsx) uses componentQty and unitCostOfRun, so
// the cost the run books is the cost these functions compute.

export interface BomLine {
  componentProductId: string;
  qtyPerUnit: number;
}

// Scrap is whole units that were spoiled in the run. Anything that is not a whole number of zero or more counts as none.
export function normalizeScrap(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Units of one component a run uses: the good units plus the scrap, each needing its per-unit amount.
export function componentQty(qtyPerUnit: number, goodQty: number, scrapQty = 0): number {
  return qtyPerUnit * (goodQty + scrapQty);
}

// Cost of one good unit: the components the run used (scrap included) plus labour and overhead, spread over the good units.
export function unitCostOfRun(componentCostTotal: number, laborPerUnit: number, goodQty: number): number {
  if (!(goodQty > 0)) return 0;
  return (componentCostTotal + laborPerUnit * goodQty) / goodQty;
}

// How many whole units the stock on hand can make, and which component runs out first. Zero when there is no bill of materials.
export function buildableQty(components: BomLine[], onHandOf: (productId: string) => number): { qty: number; limitingProductId: string | null } {
  let qty = Infinity;
  let limit: string | null = null;
  for (const c of components) {
    if (!(c.qtyPerUnit > 0)) continue;
    const can = Math.floor(Math.max(0, onHandOf(c.componentProductId)) / c.qtyPerUnit);
    if (can < qty) {
      qty = can;
      limit = c.componentProductId;
    }
  }
  if (!Number.isFinite(qty)) return { qty: 0, limitingProductId: null };
  return { qty, limitingProductId: limit };
}

// Components a run of `goodQty` (plus `scrapQty` wasted) would use more of than the stock on hand.
export function productionShortfalls(
  components: BomLine[],
  goodQty: number,
  scrapQty: number,
  onHandOf: (productId: string) => number
): { productId: string; need: number; have: number; short: number }[] {
  const out: { productId: string; need: number; have: number; short: number }[] = [];
  for (const c of components) {
    const need = componentQty(c.qtyPerUnit, goodQty, scrapQty);
    const have = Math.max(0, onHandOf(c.componentProductId));
    if (need > have) out.push({ productId: c.componentProductId, need, have, short: need - have });
  }
  return out;
}

export interface ProductionCandidate {
  id: string;
  name: string;
  active: boolean;
  components?: BomLine[];
  minStockLevel?: number;
}

export interface ProductionSuggestion {
  productId: string;
  name: string;
  onHand: number;
  minStockLevel: number;
  suggestQty: number; // how many to make now: the gap to the minimum, capped by what the components allow
  buildableQty: number;
  limitingProductId: string | null;
  blocked: boolean; // true when the components cannot make anything yet (suggestQty is then the gap, not what can be made)
}

// Made items below their minimum stock, most urgent first (lowest stock compared with its minimum). Items without a bill of
// materials or without a minimum are not suggested.
export function productionSuggestions(
  products: ProductionCandidate[],
  onHandOf: (productId: string) => number
): { ready: ProductionSuggestion[]; blocked: ProductionSuggestion[] } {
  const ready: ProductionSuggestion[] = [];
  const blocked: ProductionSuggestion[] = [];
  for (const p of products) {
    const bom = p.components ?? [];
    if (!p.active || bom.length === 0 || !(p.minStockLevel && p.minStockLevel > 0)) continue;
    const onHand = Math.max(0, onHandOf(p.id));
    const gap = p.minStockLevel - onHand;
    if (gap <= 0) continue;
    const { qty, limitingProductId } = buildableQty(bom, onHandOf);
    const row: ProductionSuggestion = {
      productId: p.id,
      name: p.name,
      onHand,
      minStockLevel: p.minStockLevel,
      suggestQty: Math.min(gap, qty),
      buildableQty: qty,
      limitingProductId,
      blocked: qty === 0,
    };
    if (row.blocked) {
      row.suggestQty = gap;
      blocked.push(row);
    } else {
      ready.push(row);
    }
  }
  const urgency = (s: ProductionSuggestion) => s.onHand / s.minStockLevel;
  ready.sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));
  blocked.sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));
  return { ready, blocked };
}
