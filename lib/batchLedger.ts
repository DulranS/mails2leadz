// Batch trace: which delivery (batch / lot) each sale came from, and which sales a given batch went to.
// Pure functions, no I/O (scripts/verify-batch-ledger.ts).
//
// DERIVED, NOT STORED. By default the books cost on weighted average cost and the trace changes none of it: no cost,
// stock, cash or profit figure moves. When the owner switches Settings to batch costing, the SAME replay below also
// supplies each sale's cost (computeProductLedgerByBatch), so the batch a sale is shown from is the batch it is costed at. It replays history in date order and attributes every unit sold to a delivery:
//   1. If the sale names a batch (Sale.batchPurchaseId, picked on the sale form) that batch is used first. RECORDED.
//   2. Everything else (and any overflow) comes from the delivery that expires soonest (FEFO), no expiry last,
//      then the oldest delivery. ESTIMATED: right whenever the shelf is actually picked in that order.
// A sale that cannot be matched to any delivery on hand at the time (sold before the stock was entered, or more than
// was bought) is counted as UNMATCHED, never silently dropped.
//
// Same stock arithmetic as lib/stockTracking.computeStockLevel: purchases - sales + restocked returns + adjustments
// (signed) - goods sent back to suppliers. The tests assert that the ledger's totals reconcile to it.
import type { Product, Purchase, Sale, SaleReturn, StockAdjustment, SupplierReturn } from "./types";
import type { ProductLedgerResult, SaleCogsResult } from "./calculations"; // types only: erased at build, so no import cycle with calculations

const EPS = 1e-9;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface BatchSaleLine {
  saleId: string;
  date: string;
  qty: number; // units of THIS batch in this sale (a sale can span batches)
  customer?: string;
  customerContact?: string;
  invoiceId?: string;
  recorded: boolean; // true = the seller picked this batch; false = estimated (earliest expiry first)
}

export interface BatchRow {
  productId: string;
  productName: string;
  purchaseId: string;
  batchRef?: string;
  supplier?: string;
  receivedDate: string;
  expiryDate?: string;
  qtyReceived: number;
  qtySold: number; // net of restocked returns
  qtyOther: number; // sent back to the supplier, or written off / adjusted
  remaining: number;
  unitCost: number; // what each unit of this delivery cost (the purchase's unit cost)
  sales: BatchSaleLine[]; // chronological
}

export interface ProductBatches {
  productId: string;
  productName: string;
  batches: BatchRow[]; // soonest expiry first, no-expiry last
  unmatchedSold: number; // sold with no delivery on hand to take it from
  unbatchedOnHand: number; // stock found by an adjustment, or returned from a sale with no batch
}

export interface BatchLedger {
  products: ProductBatches[]; // only products that have at least one delivery
  anyBatchInfo: boolean; // any delivery carries a batch reference or an expiry date
}

interface Live {
  row: BatchRow;
  seq: number; // arrival order: tie-break so the older delivery goes first
  cost: number; // unit cost this layer carries (the purchase's unit cost; for stock found without a batch, the cost then in force)
  unbatched: boolean; // stock with no delivery behind it (found by an adjustment, or returned from an unknown sale)
}

type Event =
  | { kind: "purchase"; date: string; at: number; p: Purchase }
  | { kind: "sale"; date: string; at: number; s: Sale }
  | { kind: "return"; date: string; at: number; r: SaleReturn }
  | { kind: "supplierReturn"; date: string; at: number; r: SupplierReturn }
  | { kind: "adjustment"; date: string; at: number; a: StockAdjustment };

function fefoCompare(a: Live, b: Live): number {
  const ea = a.row.expiryDate && ISO.test(a.row.expiryDate) ? a.row.expiryDate : null;
  const eb = b.row.expiryDate && ISO.test(b.row.expiryDate) ? b.row.expiryDate : null;
  if (ea !== eb) return ea === null ? 1 : eb === null ? -1 : ea < eb ? -1 : 1;
  return a.seq - b.seq;
}

interface PState {
  layers: Live[];
  deficit: number; // units sold or taken out with nothing on hand to take them from (never above 0 while layers hold stock)
  lastCost: number; // unit cost of the most recent delivery: what units with no stock behind them are valued at
}

interface Replay {
  states: Map<string, PState>;
  byPurchase: Map<string, Live>;
  anyBatchInfo: boolean;
  // Costing outputs, keyed by the id of the event they belong to (same shape the average-cost engine produces).
  saleCogs: Map<string, SaleCogsResult>;
  returnRestockValue: Map<string, number>;
  adjustmentValue: Map<string, number>;
  supplierReturnValue: Map<string, number>;
}

const sumRemaining = (st: PState) => st.layers.reduce((n, l) => n + l.row.remaining, 0);
const sumValue = (st: PState) => st.layers.reduce((n, l) => n + l.row.remaining * l.cost, 0);
function currentCost(st: PState): number {
  const q = sumRemaining(st);
  return q > EPS ? sumValue(st) / q : st.lastCost;
}

// THE one replay. Both the trace (computeBatchLedger) and the batch-costing engine (computeProductLedgerByBatch)
// run on it, so the batch a sale is SHOWN as coming from is always the batch whose cost it was BOOKED at.
// Events are ordered exactly as the average-cost engine orders them (date, then entry time).
function replay(products: Map<string, { name: string }>, events: Event[]): Replay {
  events.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.at - y.at));
  const states = new Map<string, PState>();
  const state = (id: string): PState => states.get(id) ?? states.set(id, { layers: [], deficit: 0, lastCost: 0 }).get(id)!;
  const byPurchase = new Map<string, Live>();
  const drawn = new Map<string, { live: Live; qty: number }[]>(); // saleId -> what it drew, so a return can put units back
  const out: Replay = { states, byPurchase, anyBatchInfo: false, saleCogs: new Map(), returnRestockValue: new Map(), adjustmentValue: new Map(), supplierReturnValue: new Map() };
  let seq = 0;

  // Draw `want` units, earliest expiry first; reports each (layer, qty) and returns the units nothing could cover.
  const draw = (st: PState, want: number, sink: (l: Live, q: number) => void): number => {
    let left = want;
    // Only layers that still hold units: exhausted ones would be re-sorted on every sale for nothing.
    for (const l of st.layers.filter((x) => x.row.remaining > EPS).sort(fefoCompare)) {
      if (left <= EPS) break;
      const q = Math.min(l.row.remaining, left);
      if (q <= EPS) continue;
      sink(l, q);
      left -= q;
    }
    return left;
  };
  // Units that arrive while something is still owed (an earlier oversell) cancel that debt first, so stock on hand and
  // "owed" are never both above zero. Mirrors the average-cost engine, where one running quantity does the same.
  const settle = (st: PState) => {
    if (st.deficit <= EPS) return;
    const left = draw(st, st.deficit, (l, q) => { l.row.remaining -= q; l.row.qtyOther += q; });
    st.deficit = left;
  };
  // Stock with no delivery behind it (found by an adjustment, or returned from a sale we cannot trace).
  const addLayer = (productId: string, qty: number, cost: number, date: string, label: string) => {
    const st = state(productId);
    const row: BatchRow = { productId, productName: products.get(productId)?.name ?? "", purchaseId: label, receivedDate: date, qtyReceived: qty, qtySold: 0, qtyOther: 0, remaining: qty, unitCost: cost, sales: [] };
    st.layers.push({ row, seq: seq++, cost, unbatched: true });
    settle(st);
  };

  for (const e of events) {
    if (e.kind === "purchase") {
      const p = e.p;
      if (p.batchRef || (p.expiryDate && ISO.test(p.expiryDate))) out.anyBatchInfo = true;
      const st = state(p.productId);
      const row: BatchRow = {
        productId: p.productId,
        productName: products.get(p.productId)?.name ?? "",
        purchaseId: p.id,
        batchRef: p.batchRef || undefined,
        supplier: p.supplier || undefined,
        receivedDate: p.date,
        expiryDate: p.expiryDate && ISO.test(p.expiryDate) ? p.expiryDate : undefined,
        qtyReceived: p.qty,
        qtySold: 0,
        qtyOther: 0,
        remaining: p.qty,
        unitCost: p.unitCost,
        sales: [],
      };
      const l: Live = { row, seq: seq++, cost: p.unitCost, unbatched: false };
      st.layers.push(l);
      st.lastCost = p.unitCost;
      byPurchase.set(p.id, l);
      settle(st); // units that went to cover an earlier oversell show as "other" on this batch
    } else if (e.kind === "sale") {
      const s = e.s;
      const st = state(s.productId);
      const available = sumRemaining(st);
      const oversold = s.qty > available + EPS;
      const picks: { live: Live; qty: number }[] = [];
      let cost = 0;
      let lastDrawnCost = st.lastCost;
      const book = (l: Live, q: number, recorded: boolean) => {
        l.row.remaining -= q;
        l.row.qtySold += q;
        l.row.sales.push({ saleId: s.id, date: s.date, qty: q, customer: s.customer, customerContact: s.customerContact, invoiceId: s.invoiceId, recorded });
        cost += q * l.cost;
        lastDrawnCost = l.cost;
        const prev = picks.find((x) => x.live === l);
        if (prev) prev.qty += q;
        else picks.push({ live: l, qty: q });
      };
      let left = Math.max(0, s.qty);
      const named = s.batchPurchaseId ? byPurchase.get(s.batchPurchaseId) : undefined;
      if (named && named.row.productId === s.productId && named.row.remaining > EPS) {
        const q = Math.min(named.row.remaining, left);
        book(named, q, true);
        left -= q;
      }
      if (left > EPS) left = draw(st, left, (l, q) => book(l, q, false));
      if (left > EPS) {
        st.deficit += left;
        cost += left * lastDrawnCost;
      }
      drawn.set(s.id, picks);
      out.saleCogs.set(s.id, { saleId: s.id, cogsPerUnit: s.qty > 0 ? cost / s.qty : currentCost(st), cogsTotal: cost, oversold });
    } else if (e.kind === "return") {
      const r = e.r;
      const st = state(r.productId);
      let left = r.qty;
      let value = 0;
      const picks = drawn.get(r.saleId) ?? [];
      // Back to the batch(es) the sale came from, last drawn first, at the cost they left at.
      for (let i = picks.length - 1; i >= 0 && left > EPS; i--) {
        const pk = picks[i];
        const q = Math.min(pk.qty, left);
        if (q <= EPS) continue;
        pk.qty -= q;
        pk.live.row.remaining += q;
        pk.live.row.qtySold -= q;
        value += q * pk.live.cost;
        let rest = q;
        for (let j = pk.live.row.sales.length - 1; j >= 0 && rest > EPS; j--) {
          const line = pk.live.row.sales[j];
          if (line.saleId !== r.saleId) continue;
          const cut = Math.min(line.qty, rest);
          line.qty -= cut;
          rest -= cut;
        }
        pk.live.row.sales = pk.live.row.sales.filter((x) => x.qty > EPS);
        left -= q;
      }
      settle(st);
      if (left > EPS) {
        const unit = out.saleCogs.get(r.saleId)?.cogsPerUnit ?? currentCost(st);
        addLayer(r.productId, left, unit, r.date, `__unbatched:${r.id}`);
        value += left * unit;
      }
      out.returnRestockValue.set(r.id, value);
    } else if (e.kind === "supplierReturn") {
      const r = e.r;
      const st = state(r.productId);
      let left = r.qty;
      let value = 0;
      const own = byPurchase.get(r.purchaseId);
      if (own && own.row.productId === r.productId) {
        const q = Math.min(own.row.remaining, left);
        own.row.remaining -= q;
        own.row.qtyOther += q;
        value += q * own.cost;
        left -= q;
      }
      if (left > EPS) left = draw(st, left, (l, q) => { l.row.remaining -= q; l.row.qtyOther += q; value += q * l.cost; });
      if (left > EPS) st.deficit += left;
      out.supplierReturnValue.set(r.id, value);
    } else {
      const a = e.a;
      const st = state(a.productId);
      if (a.qty > 0) {
        const unit = currentCost(st);
        addLayer(a.productId, a.qty, unit, a.date, `__unbatched:${a.id}`);
        out.adjustmentValue.set(a.id, a.qty * unit);
      } else {
        // Lost, damaged, used or expired stock: earliest-expiring batch first (what an expiry write-off is).
        let value = 0;
        const unitFallback = currentCost(st);
        let left = draw(st, -a.qty, (l, q) => { l.row.remaining -= q; l.row.qtyOther += q; value += q * l.cost; });
        if (left > EPS) {
          st.deficit += left;
          value += left * unitFallback;
        }
        out.adjustmentValue.set(a.id, -value);
      }
    }
  }
  return out;
}

export function computeBatchLedger(
  products: Pick<Product, "id" | "name" | "type">[],
  purchases: Purchase[],
  sales: Sale[],
  saleReturns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = []
): BatchLedger {
  const goods = new Map(products.filter((p) => p.type !== "service").map((p) => [p.id, p]));
  const events: Event[] = [];
  for (const p of purchases) if (goods.has(p.productId) && p.qty > 0) events.push({ kind: "purchase", date: p.date, at: p.createdAt ?? 0, p });
  for (const s of sales) if (goods.has(s.productId) && !s.isDelivery && s.qty > 0) events.push({ kind: "sale", date: s.date, at: s.createdAt ?? 0, s });
  for (const r of saleReturns) if (goods.has(r.productId) && r.restock && r.qty > 0) events.push({ kind: "return", date: r.date, at: r.createdAt ?? 0, r });
  for (const r of supplierReturns) if (goods.has(r.productId) && r.qty > 0) events.push({ kind: "supplierReturn", date: r.date, at: r.createdAt ?? 0, r });
  for (const a of adjustments) if (goods.has(a.productId) && Math.abs(a.qty) > 0) events.push({ kind: "adjustment", date: a.date, at: a.createdAt ?? 0, a });
  const rp = replay(goods as Map<string, { name: string }>, events);

  const out: ProductBatches[] = [];
  for (const [productId, st] of rp.states) {
    const real = st.layers.filter((l) => !l.unbatched);
    if (real.length === 0) continue; // a product with no delivery on record has nothing to trace
    out.push({
      productId,
      productName: goods.get(productId)!.name,
      batches: real.sort(fefoCompare).map((l) => l.row),
      unmatchedSold: st.deficit,
      unbatchedOnHand: st.layers.filter((l) => l.unbatched).reduce((n, l) => n + l.row.remaining, 0),
    });
  }
  out.sort((a, b) => a.productName.localeCompare(b.productName));
  return { products: out, anyBatchInfo: rp.anyBatchInfo };
}

// Batch costing: the same ledger the average-cost engine returns (lib/calculations.ts computeProductLedger), but each
// sale is costed at the cost of the batch(es) it actually drew from, not at one blended average. Takes ONE product's
// records, exactly like computeProductLedger. Cost is conserved: every unit of purchase value ends up in cost of goods,
// a write-off, goods sent back, or stock still on hand (scripts/verify-batch-costing.ts proves it over thousands of
// random histories). When a sale is bigger than what is on hand (oversold), the missing units are costed at the cost of
// the last batch drawn, and the ledger flags it as oversold exactly as the average-cost engine does.
export function computeProductLedgerByBatch(
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = []
): ProductLedgerResult {
  const id = purchases[0]?.productId ?? sales[0]?.productId ?? returns[0]?.productId ?? adjustments[0]?.productId ?? supplierReturns[0]?.productId ?? "";
  const events: Event[] = [];
  for (const p of purchases) if (p.qty > 0) events.push({ kind: "purchase", date: p.date, at: p.createdAt ?? 0, p });
  for (const s of sales) events.push({ kind: "sale", date: s.date, at: s.createdAt ?? 0, s });
  for (const r of returns) if (r.restock && r.qty > 0) events.push({ kind: "return", date: r.date, at: r.createdAt ?? 0, r });
  for (const r of supplierReturns) if (r.qty > 0) events.push({ kind: "supplierReturn", date: r.date, at: r.createdAt ?? 0, r });
  for (const a of adjustments) if (a.qty !== 0) events.push({ kind: "adjustment", date: a.date, at: a.createdAt ?? 0, a });
  const rp = replay(new Map([[id, { name: "" }]]), events);
  const st = rp.states.get(id) ?? { layers: [], deficit: 0, lastCost: 0 };
  const onHand = sumRemaining(st);
  const qtyOnHand = onHand - st.deficit;
  const value = sumValue(st);
  return {
    qtyOnHand,
    wac: onHand > EPS ? value / onHand : st.lastCost,
    inventoryValue: value,
    saleCogs: rp.saleCogs,
    returnRestockValue: rp.returnRestockValue,
    adjustmentValue: rp.adjustmentValue,
    supplierReturnValue: rp.supplierReturnValue,
  };
}

// Batches of one product that still have units, in the order the shelf should be picked: what the sale form offers.
export function batchesAvailable(ledger: BatchLedger, productId: string): BatchRow[] {
  return (ledger.products.find((p) => p.productId === productId)?.batches ?? []).filter((b) => b.remaining > 1e-6);
}

// The batches a sale of one product can name, shared by the single-sale and multi-item invoice forms (pass 315).
// Only the batches still open, plus the one already picked so an edit never loses it. Empty when no delivery of this
// product carries a batch number or a use-by date, so plain goods never show the picker.
export interface BatchPickData {
  purchases: Purchase[];
  sales: Sale[];
  saleReturns: SaleReturn[];
  stockAdjustments: StockAdjustment[];
  supplierReturns: SupplierReturn[];
}
export function batchPickChoices(productId: string, data: BatchPickData, pickedPurchaseId?: string): BatchRow[] {
  const mine = data.purchases.filter((p) => p.productId === productId);
  if (!mine.some((p) => p.batchRef || p.expiryDate)) return [];
  const ledger = computeBatchLedger(
    [{ id: productId, name: "", type: "product" }],
    mine,
    data.sales.filter((s) => s.productId === productId),
    data.saleReturns.filter((r) => r.productId === productId),
    data.stockAdjustments.filter((a) => a.productId === productId),
    data.supplierReturns.filter((r) => r.productId === productId)
  );
  const open = batchesAvailable(ledger, productId);
  const picked = pickedPurchaseId ? ledger.products[0]?.batches.find((b) => b.purchaseId === pickedPurchaseId) : undefined;
  return picked && !open.includes(picked) ? [...open, picked] : open;
}

// The reverse lookup a recall needs: everyone who received units of this batch.
export function batchRecipients(row: BatchRow): { customer: string; contact?: string; qty: number; lastDate: string; sales: number; recorded: boolean }[] {
  const by = new Map<string, { customer: string; contact?: string; qty: number; lastDate: string; sales: number; recorded: boolean }>();
  for (const s of row.sales) {
    const key = (s.customer ?? "").trim().toLowerCase() || "(walk-in / no name)";
    const cur = by.get(key) ?? { customer: s.customer?.trim() || "(walk-in / no name)", contact: s.customerContact, qty: 0, lastDate: s.date, sales: 0, recorded: true };
    cur.qty += s.qty;
    cur.sales += 1;
    if (s.date > cur.lastDate) cur.lastDate = s.date;
    if (!cur.contact && s.customerContact) cur.contact = s.customerContact;
    if (!s.recorded) cur.recorded = false;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.qty - a.qty);
}
