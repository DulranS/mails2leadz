// What would taking `qty` units of a product out of stock cost RIGHT NOW, under the business's costing method?
// Used by the sale form's cost preview and by production runs (which take component stock out and put the finished
// good in at exactly that cost, so the books cannot drift).
//
//   average - the product's current weighted average cost, exactly what the app always used.
//   batch   - what the batch ledger would book for a sale of that size on that date: the picked batch first, then the
//             batch expiring soonest, then the oldest delivery. Found by running the real engine with one extra,
//             not-yet-saved sale at the end of that day, so the preview can never disagree with what gets booked.
import type { CostingMethod, Purchase, Sale, SaleReturn, StockAdjustment, SupplierReturn } from "./types";
import { computeProductLedgerByBatch } from "./batchLedger";

export interface CostingContext {
  purchases: Purchase[];
  sales: Sale[];
  saleReturns: SaleReturn[];
  stockAdjustments: StockAdjustment[];
  supplierReturns: SupplierReturn[];
}

export const PROBE_ID = "__probe__";

export function consumptionUnitCost(
  method: CostingMethod,
  averageCost: number, // the product's current ledger wac (what "average" uses, and the answer when nothing else can be said)
  productId: string,
  qty: number,
  date: string,
  ctx: CostingContext,
  opts: { batchPurchaseId?: string; excludeSaleId?: string } = {}
): number {
  if (method !== "batch" || !(qty > 0)) return averageCost;
  const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => x.productId === productId);
  const probe = { id: PROBE_ID, productId, qty, unitPrice: 0, date, createdAt: Number.MAX_SAFE_INTEGER, batchPurchaseId: opts.batchPurchaseId } as Sale;
  const ledger = computeProductLedgerByBatch(
    mine(ctx.purchases),
    [...mine(ctx.sales).filter((s) => s.id !== opts.excludeSaleId), probe],
    mine(ctx.saleReturns),
    mine(ctx.stockAdjustments),
    mine(ctx.supplierReturns)
  );
  return ledger.saleCogs.get(PROBE_ID)?.cogsPerUnit ?? averageCost;
}
