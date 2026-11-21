// Selling something before you have bought it: dropshipping, made-to-order, pre-orders, a supplier shipping straight to
// the customer. The stock ledger replays events in date order, and a sale logged before its purchase is costed at the
// average cost at that moment, which is zero when the item was never bought: the sale shows 100% margin and the cost
// is lost for good. The fix is order, not new maths: record the purchase of the missing units FIRST, then the sale,
// so the ledger sees the stock arrive and leave and books the true cost. This works out that purchase.

export interface BuyToOrderPlan {
  qty: number; // units to buy: exactly what the sale is short by, in base units
  unitCost: number; // what the supplier charges per base unit
}

export type BuyToOrderResult = { ok: true; plan: BuyToOrderPlan } | { ok: false; error: string };

export function buyToOrderPlan(shortBase: number, unitCostText: string): BuyToOrderResult {
  if (!Number.isFinite(shortBase) || shortBase <= 0) return { ok: false, error: "Nothing is missing: this sale is covered by stock on hand." };
  const t = (unitCostText ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, error: "Enter what the supplier charges per unit (a number above 0)." };
  const unitCost = Number(t);
  if (!(unitCost > 0)) return { ok: false, error: "Enter what the supplier charges per unit (a number above 0)." };
  return { ok: true, plan: { qty: Math.round(shortBase * 10000) / 10000, unitCost: Math.round(unitCost * 100) / 100 } };
}
