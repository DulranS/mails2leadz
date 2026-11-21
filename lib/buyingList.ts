// "What to order now": every active stock item whose stock plus what is already on order has fallen to its reorder
// point, with a suggested quantity, the supplier it was last bought from, what it should cost at the latest price, and
// a total per supplier. Optionally split by a cash budget so the most urgent items are covered first.
//
// Read-only and derived from the EOQ/reorder figures, stock levels, open orders and purchases the app already holds.
// It places no order and changes no stock, cost or cash figure.
import type { Product, Purchase } from "./types";

export interface BuyingEoq {
  eoq: number;
  reorderPoint: number;
  dailyDemand: number;
}

export interface BuyingLine {
  productId: string;
  name: string;
  sku: string;
  supplier: string | null; // last supplier this item was bought from
  onHand: number;
  onOrder: number;
  reorderPoint: number;
  suggestQty: number;
  unitCost: number; // latest purchase cost, else the average cost; 0 when neither is known
  costKnown: boolean;
  lineCost: number;
  coverDays: number | null; // days the stock on hand lasts at the recent selling rate
}

export interface BuyingGroup {
  supplier: string | null;
  lines: BuyingLine[];
  total: number;
}

export interface BuyingList {
  groups: BuyingGroup[];
  lines: BuyingLine[]; // all lines, most urgent first
  total: number;
  unknownCostCount: number;
}

const byDate = (a: Purchase, b: Purchase) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);

export function computeBuyingList(input: {
  products: Product[];
  qtyOnHand: Map<string, number>;
  onOrder: Map<string, number>;
  eoq: Map<string, BuyingEoq>;
  wac: Map<string, number>;
  purchases: Purchase[];
}): BuyingList {
  const latestByProduct = new Map<string, Purchase>();
  for (const p of [...input.purchases].sort(byDate)) {
    if (p.qty > 0 && p.unitCost > 0) latestByProduct.set(p.productId, p);
  }

  const lines: BuyingLine[] = [];
  for (const prod of input.products) {
    if (prod.type !== "product" || !prod.active) continue;
    const e = input.eoq.get(prod.id);
    if (!e || !(e.eoq > 0) || !(e.reorderPoint > 0)) continue; // not enough sales history to say
    const onHand = input.qtyOnHand.get(prod.id) ?? 0;
    const onOrder = input.onOrder.get(prod.id) ?? 0;
    const position = onHand + onOrder;
    if (position > e.reorderPoint) continue;
    // Order up to reorder point + one economic batch, never less than one batch.
    const suggestQty = Math.ceil(Math.max(e.eoq, e.reorderPoint + e.eoq - position));
    const latest = latestByProduct.get(prod.id);
    const unitCost = latest ? latest.unitCost : (input.wac.get(prod.id) ?? 0);
    const costKnown = unitCost > 0;
    lines.push({
      productId: prod.id,
      name: prod.name,
      sku: prod.sku,
      supplier: latest?.supplier?.trim() || null,
      onHand,
      onOrder,
      reorderPoint: e.reorderPoint,
      suggestQty,
      unitCost: costKnown ? unitCost : 0,
      costKnown,
      lineCost: costKnown ? suggestQty * unitCost : 0,
      coverDays: e.dailyDemand > 0 ? Math.max(0, onHand) / e.dailyDemand : null,
    });
  }
  // Most urgent first: least cover, items with no cover figure last.
  lines.sort((a, b) => (a.coverDays ?? Infinity) - (b.coverDays ?? Infinity) || a.name.localeCompare(b.name));

  const groupMap = new Map<string, BuyingGroup>();
  for (const l of lines) {
    const k = l.supplier ? l.supplier.toLowerCase() : "";
    let g = groupMap.get(k);
    if (!g) {
      g = { supplier: l.supplier, lines: [], total: 0 };
      groupMap.set(k, g);
    }
    g.lines.push(l);
    g.total += l.lineCost;
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    if ((a.supplier === null) !== (b.supplier === null)) return a.supplier === null ? 1 : -1;
    return b.total - a.total || (a.supplier ?? "").localeCompare(b.supplier ?? "");
  });
  return {
    groups,
    lines,
    total: lines.reduce((s, l) => s + l.lineCost, 0),
    unknownCostCount: lines.filter((l) => !l.costKnown).length,
  };
}

// Walk the lines most urgent first and cover each one that still fits in the budget. A line that does not fit is
// deferred and the walk carries on, so cash is not left idle behind one big item. Items with an unknown cost cannot be
// checked against a budget, so they are listed as `unpriced` and not counted against it.
export function splitByBudget(lines: BuyingLine[], budget: number): { afford: BuyingLine[]; defer: BuyingLine[]; unpriced: BuyingLine[]; spend: number } {
  const afford: BuyingLine[] = [];
  const defer: BuyingLine[] = [];
  const unpriced: BuyingLine[] = [];
  let spend = 0;
  const room = Math.max(0, budget);
  for (const l of lines) {
    if (!l.costKnown) { unpriced.push(l); continue; }
    if (spend + l.lineCost <= room + 1e-9) { afford.push(l); spend += l.lineCost; }
    else defer.push(l);
  }
  return { afford, defer, unpriced, spend };
}

// One supplier's whole list as orders, in one press. Lines marked Wait (the budget does not cover them) are left out, so the press
// never overspends what was set aside. Lines with no known cost cannot be priced, so they are not ordered and are listed back for the
// person to order by hand. Nothing is placed here: the caller places the returned orders one by one.
export interface SupplierOrderPlan {
  orders: { productId: string; name: string; qtyOrdered: number; unitCost: number; supplier?: string }[];
  noCost: BuyingLine[];
  deferred: BuyingLine[];
  total: number;
}

export function planSupplierOrder(group: BuyingGroup, waitIds: ReadonlySet<string> = new Set()): SupplierOrderPlan {
  const orders: SupplierOrderPlan["orders"] = [];
  const noCost: BuyingLine[] = [];
  const deferred: BuyingLine[] = [];
  let total = 0;
  for (const l of group.lines) {
    if (waitIds.has(l.productId)) {
      deferred.push(l);
      continue;
    }
    if (!l.costKnown || !(l.unitCost > 0)) {
      noCost.push(l);
      continue;
    }
    if (!(l.suggestQty > 0)) continue;
    orders.push({ productId: l.productId, name: l.name, qtyOrdered: l.suggestQty, unitCost: l.unitCost, supplier: group.supplier ?? undefined });
    total += l.suggestQty * l.unitCost;
  }
  return { orders, noCost, deferred, total: Math.round(total * 100) / 100 };
}
