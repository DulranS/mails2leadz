// Stock level tracking and low stock alerts
import type { Location, Product, Purchase, Sale, SaleReturn, StockAdjustment, StockTransfer, SupplierReturn } from "./types";

/**
 * Resolve which Location a record belongs to. A record with no locationId
 * predates multi-location and belongs to the default Location — this is the
 * one place that rule lives, so every per-location computation stays
 * consistent without every caller having to know it.
 */
export function resolveLocationId(recordLocationId: string | undefined, locations: Location[]): string {
  if (recordLocationId) return recordLocationId;
  return locations.find((l) => l.isDefault)?.id ?? "";
}

export interface StockLevel {
  productId: string;
  productName: string;
  currentStock: number;
  minStockLevel?: number;
  isLowStock: boolean;
  lastPurchaseDate?: string;
  lastSaleDate?: string;
}

export interface LowStockAlert {
  productId: string;
  productName: string;
  currentStock: number;
  minStockLevel: number;
  shortfall: number;
  suggestedOrderQty: number;
}

/**
 * Compute current stock level for a product from purchase, sale, restocked
 * return, and stock adjustment history.
 * Stock = purchases - sales + restocked returns + adjustments (signed) - goods sent back to suppliers
 *
 * `returns`/`adjustments` default to empty arrays so existing callers keep
 * compiling unchanged; pass them in for an accurate count once a business
 * has any returns or stock adjustments on record.
 */
export function computeStockLevel(
  product: Product,
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = []
): StockLevel {
  const productPurchases = purchases.filter(p => p.productId === product.id);
  const productSales = sales.filter(s => s.productId === product.id);
  const productReturns = returns.filter(r => r.productId === product.id && r.restock);
  const productAdjustments = adjustments.filter(a => a.productId === product.id);
  const productSupplierReturns = supplierReturns.filter(r => r.productId === product.id);

  const totalPurchased = productPurchases.reduce((sum, p) => sum + p.qty, 0);
  const totalSold = productSales.reduce((sum, s) => sum + s.qty, 0);
  const totalRestocked = productReturns.reduce((sum, r) => sum + r.qty, 0);
  const totalAdjusted = productAdjustments.reduce((sum, a) => sum + a.qty, 0);
  const totalSentBack = productSupplierReturns.reduce((sum, r) => sum + r.qty, 0);
  const currentStock = totalPurchased - totalSold + totalRestocked + totalAdjusted - totalSentBack;

  const lastPurchase = productPurchases.sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastSale = productSales.sort((a, b) => b.date.localeCompare(a.date))[0];

  const isLowStock = product.minStockLevel !== undefined && currentStock < product.minStockLevel;

  return {
    productId: product.id,
    productName: product.name,
    currentStock,
    minStockLevel: product.minStockLevel,
    isLowStock,
    lastPurchaseDate: lastPurchase?.date,
    lastSaleDate: lastSale?.date,
  };
}

/**
 * Compute stock levels for all products
 */
export function computeAllStockLevels(
  products: Product[],
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = []
): StockLevel[] {
  return products
    .filter(p => p.type === "product" && p.active)
    .map(p => computeStockLevel(p, purchases, sales, returns, adjustments, supplierReturns));
}

/**
 * Generate low stock alerts for products below their minimum level
 */
export function generateLowStockAlerts(
  stockLevels: StockLevel[]
): LowStockAlert[] {
  return stockLevels
    .filter(sl => sl.isLowStock && sl.minStockLevel !== undefined)
    .map(sl => ({
      productId: sl.productId,
      productName: sl.productName,
      currentStock: sl.currentStock,
      minStockLevel: sl.minStockLevel!,
      shortfall: sl.minStockLevel! - sl.currentStock,
      suggestedOrderQty: Math.max(sl.minStockLevel! * 2, sl.minStockLevel! - sl.currentStock + 10), // Suggest ordering enough to reach 2x min level or cover shortfall + buffer
    }));
}

export interface LocationStockLevel {
  productId: string;
  productName: string;
  locationId: string;
  qtyOnHand: number;
}

/**
 * Physical qty-on-hand for every product at every active Location.
 * Deliberately quantity-only — never touches WAC/COGS/value, which stay
 * computed consolidated across all locations by computeProductLedger in
 * lib/calculations.ts. A record with no locationId (pre-multi-location
 * data) resolves to the default Location via resolveLocationId, so this
 * works unchanged on a business that just turned locations on.
 */
export function computeLocationStockLevels(
  products: Product[],
  locations: Location[],
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  transfers: StockTransfer[] = [],
  supplierReturns: SupplierReturn[] = []
): LocationStockLevel[] {
  const activeLocations = locations.filter((l) => l.active);
  const result: LocationStockLevel[] = [];

  // One pass over each list, summed per product + location, instead of re-scanning every list once per product x
  // location (that was products x locations x transactions: 1.2s at 500 products / 100k sales, re-run on every
  // snapshot). Each total is accumulated in input order, exactly as the old filter().reduce() did, so every quantity
  // is identical. Records that resolve to an inactive location are simply never read, as before.
  const key = (productId: string, locationId: string) => `${productId}\u0000${locationId}`;
  const sumBy = <T extends { productId: string; qty: number }>(list: T[], locOf: (x: T) => string, include?: (x: T) => boolean) => {
    const m = new Map<string, number>();
    for (const x of list) {
      if (include && !include(x)) continue;
      const k = key(x.productId, locOf(x));
      m.set(k, (m.get(k) ?? 0) + x.qty);
    }
    return m;
  };
  const resolved = (x: { locationId?: string }) => resolveLocationId(x.locationId, locations);
  const purchasedBy = sumBy(purchases, resolved);
  const soldBy = sumBy(sales, resolved);
  const restockedBy = sumBy(returns, resolved, (r) => !!r.restock);
  const adjustedBy = sumBy(adjustments, resolved);
  const sentBackBy = sumBy(supplierReturns, resolved);
  const transferredInBy = sumBy(transfers, (t) => t.toLocationId);
  const transferredOutBy = sumBy(transfers, (t) => t.fromLocationId);

  for (const product of products.filter((p) => p.type === "product" && p.active)) {
    for (const location of activeLocations) {
      const k = key(product.id, location.id);
      const purchased = purchasedBy.get(k) ?? 0;
      const sold = soldBy.get(k) ?? 0;
      const restocked = restockedBy.get(k) ?? 0;
      const adjusted = adjustedBy.get(k) ?? 0;
      const sentBack = sentBackBy.get(k) ?? 0;
      const transferredIn = transferredInBy.get(k) ?? 0;
      const transferredOut = transferredOutBy.get(k) ?? 0;

      result.push({
        productId: product.id,
        productName: product.name,
        locationId: location.id,
        qtyOnHand: purchased - sold + restocked + adjusted + transferredIn - transferredOut - sentBack,
      });
    }
  }

  return result;
}

/**
 * Update product stock level in Firestore (to be called from a scheduled job)
 */
export function updateProductStockLevels(
  db: any,
  businessId: string,
  stockLevels: StockLevel[]
): Promise<void> {
  const batch = db.batch();
  
  stockLevels.forEach(sl => {
    const ref = db.doc(`users/${businessId}/products/${sl.productId}`);
    batch.update(ref, { currentStock: sl.currentStock });
  });

  return batch.commit();
}
