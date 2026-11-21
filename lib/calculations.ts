import { refOperatingCashFlowRatio, refCashFlowToNetProfit, refCashReturnOnAssetsPct, refInterestBurdenPct, refCashInterestCoverage, refEbitdaCoverage, refRetainedEarningsPct, refFixedAssetTurnover, refPayablesTurnover, refCapitalGearing } from "./ratios-reference";
import { altmanZPrivate, type AltmanZone } from "./altman";
import { creditAppliedByBill, monthlyCreditCash } from "./supplierCredit";
import { accrualAsExpenses, accruedLiabilityAsOf } from "./accruals";
import { depositApplications, monthlyDepositCash } from "./customerDeposits";
import { localIsoDate } from "./localDate";
import { isPoolEntry } from "./investorPool";
import { computeProductLedgerByBatch } from "./batchLedger";
import type {
  CostingMethod,
  AuditLogEntry,
  BankStatementLine,
  CapitalEntry,
  Customer,
  Discount,
  Employee,
  Expense,
  FixedAsset,
  Lead,
  Loan,
  Location,
  OfferCostLine,
  OpeningBalance,
  OfferingType,
  Product,
  Project,
  ProjectCostSegment,
  ProjectMilestone,
  ProjectStatus,
  Purchase,
  PurchaseOrder,
  Recurrence,
  ReceivablePayment,
  ReceivableWriteOff,
  PayablePayment,
  BillPayment,
  Sale,
  SaleReturn,
  Settings,
  StockAdjustment,
  SupplierReturn,
  TaxPayment,
  TimeEntry,
  VariableCost,
  SupplierCreditEntry,
  CustomerDepositEntry,
} from "./types";
import { PRODUCTION_SUPPLIER_LABEL, type Accrual } from "./types";
import { resolveLocationId } from "./stockTracking";
import { sgaSplit } from "./sga";

// ---------------------------------------------------------------------------
// Inventory costing: Weighted Average Cost (WAC).
//
// Why WAC and not FIFO/LIFO: FIFO/LIFO need lot-level tracking (which physical
// batch a sale draws down), which is real bookkeeping overhead for a solo
// operator hand-entering purchases and sales. WAC keeps one rolling cost per
// product, recalculated on every purchase, and is what most small-business
// accounting tools default to for exactly this reason. It's auditable from a
// flat purchases+sales list, which is what we store.
// ---------------------------------------------------------------------------

export interface LedgerEvent {
  date: string;
  createdAt: number;
  type: "purchase" | "sale";
  qty: number;
  unitValue: number; // unitCost for purchase, unitPrice for sale
  refId: string;
}

// Internal, discriminated event stream used by computeProductLedger below.
// Purchase/sale mirror LedgerEvent above; "return" and "adjustment" are the
// two extra event kinds a restocked SaleReturn / a StockAdjustment inject
// into the same chronological replay — see the function doc comment for why
// they're folded into one pass instead of computed separately.
type InternalLedgerEvent =
  | { date: string; createdAt: number; kind: "purchase"; qty: number; unitCost: number; refId: string }
  | { date: string; createdAt: number; kind: "sale"; qty: number; unitPrice: number; refId: string }
  | { date: string; createdAt: number; kind: "return"; qty: number; saleId: string; refId: string }
  | { date: string; createdAt: number; kind: "adjustment"; qty: number; refId: string }
  | { date: string; createdAt: number; kind: "supplierReturn"; qty: number; unitCost: number; refId: string };

export interface SaleCogsResult {
  saleId: string;
  cogsPerUnit: number;
  cogsTotal: number;
  oversold: boolean; // sold more than was on hand at that point
}

export interface ProductLedgerResult {
  qtyOnHand: number;
  wac: number; // current weighted average cost
  inventoryValue: number;
  saleCogs: Map<string, SaleCogsResult>;
  // $ value each restocked SaleReturn added back to inventory (0 for a
  // non-restocked return, and absent for a return not passed in at all).
  // Keyed by SaleReturn.id. See computeSaleEconomics for how this same
  // per-unit cost is used to reverse COGS on the original sale.
  returnRestockValue: Map<string, number>;
  // Signed $ impact of each StockAdjustment on inventory value (qty × the
  // WAC at the moment it was logged) — negative for a loss, positive for
  // found stock. Keyed by StockAdjustment.id. Informational only: this
  // never flows into COGS/P&L (see the StockAdjustment doc comment in
  // lib/types.ts) — it's exposed so a write-off's dollar value can be
  // shown on the stock-adjustments log.
  adjustmentValue: Map<string, number>;
  // $ of inventory value each SupplierReturn actually took out of stock —
  // read off the ledger's own before/after value rather than assumed to be
  // qty × unitCost, so that the profit effect of a return (credit minus this)
  // is by construction exactly what the balance sheet's inventory line lost,
  // even for a return that overshoots what is on hand. Keyed by
  // SupplierReturn.id. Equal to qty × unitCost in the normal case.
  supplierReturnValue: Map<string, number>;
}


// Weighted-average-cost replay for one product's stock ledger. Four event
// kinds, replayed in one chronological pass:
//   - purchase   — qty in at unitCost; recomputes WAC.
//   - sale       — qty out at the CURRENT wac (that's COGS); never touches
//                  WAC itself. Allowed to oversell (qtyOnHand can go
//                  negative — surfaced via `oversold` for the UI).
//   - return     — a RESTOCKED SaleReturn only (non-restocked returns never
//                  appear in `returns` passed in below — see
//                  computeAllLedgers). Adds qty back at the cost it left
//                  at: the referenced sale's cogsPerUnit. Because events
//                  are replayed in date order and a return's date is never
//                  earlier than its sale's, the sale's cogsPerUnit is
//                  already sitting in `saleCogs` by the time its return is
//                  reached in this same pass — no second pass needed. Folds
//                  into WAC exactly like a purchase would (falls back to
//                  the current WAC if the original sale can't be found,
//                  e.g. it was since deleted).
//   - adjustment — a StockAdjustment. Moves qtyOnHand by its signed qty
//                  (loss or found-stock) valued at the CURRENT wac, same as
//                  a sale in that it never moves WAC itself.
//   - supplierReturn — a SupplierReturn: goods sent back to the supplier.
//                  Takes qty out at the cost it came in at (the return's
//                  unitCost snapshot) and re-derives WAC from what is left,
//                  so value removed = qty × unitCost exactly and the cost of
//                  the units you keep is not disturbed. Never touches
//                  saleCogs: past sales keep the cost they were booked at.
export function computeProductLedger(
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = [],
  method: CostingMethod = "average"
): ProductLedgerResult {
  // Batch costing is the same ledger shape, costed off each batch instead of one average (lib/batchLedger.ts).
  if (method === "batch") return computeProductLedgerByBatch(purchases, sales, returns, adjustments, supplierReturns);
  const events: InternalLedgerEvent[] = [
    ...purchases.map((p) => ({
      date: p.date, createdAt: p.createdAt, kind: "purchase" as const, qty: p.qty, unitCost: p.unitCost, refId: p.id,
    })),
    ...sales.map((s) => ({
      date: s.date, createdAt: s.createdAt, kind: "sale" as const, qty: s.qty, unitPrice: s.unitPrice, refId: s.id,
    })),
    ...returns.filter((r) => r.restock).map((r) => ({
      date: r.date, createdAt: r.createdAt, kind: "return" as const, qty: r.qty, saleId: r.saleId, refId: r.id,
    })),
    ...adjustments.map((a) => ({
      date: a.date, createdAt: a.createdAt, kind: "adjustment" as const, qty: a.qty, refId: a.id,
    })),
    ...supplierReturns.map((r) => ({
      date: r.date, createdAt: r.createdAt, kind: "supplierReturn" as const, qty: r.qty, unitCost: r.unitCost, refId: r.id,
    })),
  ];

  const ordered = [...events].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.createdAt - b.createdAt;
  });

  let qtyOnHand = 0;
  let wac = 0;
  const saleCogs = new Map<string, SaleCogsResult>();
  const returnRestockValue = new Map<string, number>();
  const adjustmentValue = new Map<string, number>();
  const supplierReturnValue = new Map<string, number>();

  // Units sold before they were bought (oldest first). They are costed at the average cost of the moment, a provisional
  // figure (zero if the item was never bought). When the purchase that covers them arrives, those units are re-costed
  // at what that purchase really cost, so the sale's profit is true and the cost is not lost. Only ever filled when a
  // sale oversells, so a business that buys before it sells never touches this.
  type OwedUnits = { saleId: string; saleQty: number; units: number; provisionalPerUnit: number };
  let owed: OwedUnits[] = [];
  const settleOwed = (units: number, actualUnitCost: number) => {
    let left = units;
    while (left > 1e-9 && owed.length > 0) {
      const o = owed[0];
      const take = Math.min(left, o.units);
      const r = saleCogs.get(o.saleId);
      if (r && o.saleQty > 0) {
        r.cogsTotal += take * (actualUnitCost - o.provisionalPerUnit);
        r.cogsPerUnit = r.cogsTotal / o.saleQty;
      }
      o.units -= take;
      left -= take;
      if (o.units <= 1e-9) owed.shift();
    }
  };
  // Stock restored some other way (a customer return, a count correction): units that were owed are now covered at
  // their provisional cost, so stop waiting for a purchase to re-cost them.
  const trimOwed = () => {
    let deficit = Math.max(-qtyOnHand, 0);
    let total = owed.reduce((n, o) => n + o.units, 0);
    while (total > deficit + 1e-9 && owed.length > 0) {
      const excess = total - deficit;
      const o = owed[0];
      const cut = Math.min(excess, o.units);
      o.units -= cut;
      total -= cut;
      if (o.units <= 1e-9) owed.shift();
    }
  };

  for (const ev of ordered) {
    if (ev.kind === "purchase") {
      // Units this purchase covers that were already sold (negative stock) are costed at THIS cost, not blended into
      // the average of the stock that is left. With no shortfall this is exactly the plain weighted average.
      const deficit = Math.max(-qtyOnHand, 0);
      const absorb = Math.min(ev.qty, deficit);
      if (absorb > 0) settleOwed(absorb, ev.unitCost);
      const newQty = qtyOnHand + ev.qty;
      wac = newQty > 0 ? (Math.max(qtyOnHand, 0) * wac + (ev.qty - absorb) * ev.unitCost) / newQty : absorb > 0 ? ev.unitCost : 0;
      qtyOnHand = newQty;
    } else if (ev.kind === "sale") {
      const oversold = ev.qty > qtyOnHand;
      const cogsPerUnit = wac;
      const cogsTotal = cogsPerUnit * ev.qty;
      saleCogs.set(ev.refId, { saleId: ev.refId, cogsPerUnit, cogsTotal, oversold });
      const uncovered = ev.qty - Math.max(qtyOnHand, 0);
      if (uncovered > 1e-9) owed.push({ saleId: ev.refId, saleQty: ev.qty, units: uncovered, provisionalPerUnit: wac });
      qtyOnHand = qtyOnHand - ev.qty; // allowed to go negative -> surfaced as "oversold" in UI
    } else if (ev.kind === "return") {
      const unitValue = saleCogs.get(ev.saleId)?.cogsPerUnit ?? wac;
      const newQty = qtyOnHand + ev.qty;
      wac = newQty > 0 ? (qtyOnHand * wac + ev.qty * unitValue) / newQty : 0;
      qtyOnHand = newQty;
      trimOwed();
      returnRestockValue.set(ev.refId, unitValue * ev.qty);
    } else if (ev.kind === "supplierReturn") {
      const valueBefore = Math.max(qtyOnHand, 0) * wac;
      const newQty = qtyOnHand - ev.qty;
      if (newQty > 0) {
        // What is left is what was there minus what went back, at the cost it
        // came in at. Floored at 0: returning units that cost more than the
        // blended average can't leave stock worth less than nothing.
        wac = Math.max(0, (qtyOnHand * wac - ev.qty * ev.unitCost) / newQty);
      }
      // newQty <= 0: nothing sellable is left, so WAC is left as it was (a
      // later sale still has a cost to book against) and the stock value is 0.
      qtyOnHand = newQty;
      supplierReturnValue.set(ev.refId, valueBefore - Math.max(qtyOnHand, 0) * wac);
    } else {
      adjustmentValue.set(ev.refId, ev.qty * wac);
      qtyOnHand = qtyOnHand + ev.qty;
      trimOwed();
    }
  }

  return {
    qtyOnHand,
    wac,
    inventoryValue: Math.max(qtyOnHand, 0) * wac,
    saleCogs,
    returnRestockValue,
    adjustmentValue,
    supplierReturnValue,
  };
}

export function computeAllLedgers(
  products: Product[],
  purchases: Purchase[],
  sales: Sale[],
  returns: SaleReturn[] = [],
  adjustments: StockAdjustment[] = [],
  supplierReturns: SupplierReturn[] = [],
  method: CostingMethod = "average"
): Map<string, ProductLedgerResult> {
  // One pass over each list, grouped by product, instead of re-filtering every list once per product (that cost
  // products x transactions: ~1s at 500 products / 100k sales, and it re-runs on every snapshot). Each group keeps
  // the input order, exactly what filter() gave, so every ledger comes out identical.
  const group = <T extends { productId: string }>(list: T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const g = m.get(x.productId);
      if (g) g.push(x);
      else m.set(x.productId, [x]);
    }
    return m;
  };
  const purchasesBy = group(purchases);
  const salesBy = group(sales);
  const returnsBy = group(returns);
  const adjustmentsBy = group(adjustments);
  const supplierReturnsBy = group(supplierReturns);
  const none: never[] = [];
  const byProduct = new Map<string, ProductLedgerResult>();
  for (const product of products) {
    byProduct.set(
      product.id,
      computeProductLedger(
        purchasesBy.get(product.id) ?? none,
        salesBy.get(product.id) ?? none,
        returnsBy.get(product.id) ?? none,
        adjustmentsBy.get(product.id) ?? none,
        supplierReturnsBy.get(product.id) ?? none,
        method
      )
    );
  }
  // v273: stock, sales and returns that refer to a product no longer in the products list (deleted, or missing from an export) still count. Without this,
  // their stock vanished from the balance sheet, and the balance sheet stopped balancing. Products that exist are unchanged.
  const known = new Set(products.map((p) => p.id));
  const orphanIds = new Set<string>([...purchasesBy.keys(), ...salesBy.keys(), ...returnsBy.keys(), ...adjustmentsBy.keys(), ...supplierReturnsBy.keys()]);
  for (const id of orphanIds) {
    if (known.has(id)) continue;
    byProduct.set(
      id,
      computeProductLedger(
        purchasesBy.get(id) ?? none,
        salesBy.get(id) ?? none,
        returnsBy.get(id) ?? none,
        adjustmentsBy.get(id) ?? none,
        supplierReturnsBy.get(id) ?? none,
        method
      )
    );
  }
  return byProduct;
}

// ---------------------------------------------------------------------------
// Unit economics for a single sale.
// ---------------------------------------------------------------------------

function sumVariableCosts(sale: Sale, costs: VariableCost[]): number {
  let total = 0;
  for (const vc of costs) {
    if (vc.type === "per_unit") {
      total += vc.amount * sale.qty;
    } else {
      total += (vc.amount / 100) * sale.unitPrice * sale.qty;
    }
  }
  return total;
}

export function variableCostForSale(
  sale: Sale,
  variableCosts: VariableCost[]
): number {
  const applicable = variableCosts.filter(
    (vc) => !vc.productId || vc.productId === sale.productId
  );
  return sumVariableCosts(sale, applicable);
}

export interface SaleEconomics {
  saleId: string;
  revenue: number; // NET of returns/discounts against this sale — see below
  grossRevenue: number; // qty × unitPrice, before any return/discount
  refundedAmount: number; // sum of SaleReturn.refundAmount against this sale
  discountedAmount: number; // sum of Discount.amount against this sale
  returnedQty: number; // total qty returned against this sale (restocked or not)
  cogs: number; // WAC-based inventory cost, net of restocked-return reversal
  // The slice of variableCost tagged VariableCost.includeInCogs=true (e.g.
  // outbound shipping) — counted toward Gross Profit, not just Contribution
  // Margin. Zero for every sale as long as no variable cost is tagged that
  // way, which is exactly today's behavior for all pre-existing data.
  cogsVariableCost: number;
  variableCost: number; // ALL applicable variable costs, tagged or not
  grossProfit: number; // revenue - cogs - cogsVariableCost (true Gross Margin)
  contributionMargin: number; // grossProfit - (variableCost - cogsVariableCost) === revenue - cogs - variableCost
  contributionMarginPerUnit: number;
  oversold: boolean;
}

// Nets SaleReturn/Discount records into the sale they're against, so every
// downstream consumer of SaleEconomics (monthly P&L, receivables aging,
// product profitability, the balance sheet) picks up returns/discounts
// automatically just by reading `.revenue`/`.cogs` — nothing else in
// lib/calculations.ts has to know these record types exist. See the
// SaleReturn/Discount doc comments in lib/types.ts for exactly what each
// nets out.
//
// Both are attributed to the ORIGINAL sale's own date/month, not the
// return/discount's own date — i.e. "how did this sale actually net out",
// not a separate contra-revenue line in the period the return happened.
// That's a deliberate simplification (real period-by-period accrual would
// restate the return's own period instead) consistent with how the rest of
// this app favors one auditable number over multi-period restatement — see
// the WAC-not-FIFO comment above for the same tradeoff made elsewhere.
export function computeSaleEconomics(
  sales: Sale[],
  ledgers: Map<string, ProductLedgerResult>,
  variableCosts: VariableCost[],
  returns: SaleReturn[] = [],
  discounts: Discount[] = []
): SaleEconomics[] {
  const returnsBySale = new Map<string, SaleReturn[]>();
  for (const r of returns) {
    const arr = returnsBySale.get(r.saleId);
    if (arr) arr.push(r);
    else returnsBySale.set(r.saleId, [r]);
  }
  const discountsBySale = new Map<string, Discount[]>();
  for (const d of discounts) {
    const arr = discountsBySale.get(d.saleId);
    if (arr) arr.push(d);
    else discountsBySale.set(d.saleId, [d]);
  }

  return sales.map((sale) => {
    const ledger = ledgers.get(sale.productId);
    const cogsResult = ledger?.saleCogs.get(sale.id);
    const grossCogs = cogsResult?.cogsTotal ?? 0;
    const grossRevenue = sale.unitPrice * sale.qty;

    const saleReturns = returnsBySale.get(sale.id) ?? [];
    const refundedAmount = saleReturns.reduce((sum, r) => sum + r.refundAmount, 0);
    const returnedQty = saleReturns.reduce((sum, r) => sum + r.qty, 0);
    const restockedQty = saleReturns.filter((r) => r.restock).reduce((sum, r) => sum + r.qty, 0);
    // Reverse COGS only for the restocked portion, at this sale's own
    // cogsPerUnit — see the SaleReturn doc comment for why a non-restocked
    // return leaves COGS untouched.
    const cogsReversal = (cogsResult?.cogsPerUnit ?? 0) * restockedQty;

    const saleDiscounts = discountsBySale.get(sale.id) ?? [];
    const discountedAmount = saleDiscounts.reduce((sum, d) => sum + d.amount, 0);

    const revenue = grossRevenue - refundedAmount - discountedAmount;
    const cogs = grossCogs - cogsReversal;

    const applicable = variableCosts.filter(
      (vc) => !vc.productId || vc.productId === sale.productId
    );
    const varCost = sumVariableCosts(sale, applicable);
    const cogsVarCost = sumVariableCosts(sale, applicable.filter((vc) => vc.includeInCogs));
    const grossProfit = revenue - cogs - cogsVarCost;
    const contributionMargin = grossProfit - (varCost - cogsVarCost);
    return {
      saleId: sale.id,
      revenue,
      grossRevenue,
      refundedAmount,
      discountedAmount,
      returnedQty,
      cogs,
      cogsVariableCost: cogsVarCost,
      variableCost: varCost,
      grossProfit,
      contributionMargin,
      contributionMarginPerUnit: sale.qty > 0 ? contributionMargin / sale.qty : 0,
      oversold: cogsResult?.oversold ?? false,
    };
  });
}

// ---------------------------------------------------------------------------
// Productized offers — repeatable, fixed-price, fixed-recipe work (see the
// Product.recipeLines doc comment in lib/types.ts). No new ledger math is
// needed here: fulfilling an offer creates an ordinary Purchase (the
// recipe's total cost, logged as one cost entry) and an ordinary Sale (at
// the offer's fixed price) against that Product, so computeAllLedgers and
// computeSaleEconomics above already carry the correct WAC/COGS and margin
// for every offer for free. This just rolls those per-sale numbers up into
// one "how is this offer doing" summary per offer.
// ---------------------------------------------------------------------------

export function sumRecipeCost(lines: OfferCostLine[] | undefined): number {
  return (lines ?? []).reduce((sum, l) => sum + l.amount, 0);
}

export interface OfferStats {
  productId: string;
  timesSold: number; // total units delivered (sum of qty across every Sale of this offer)
  revenue: number;
  cost: number; // actual COGS incurred (from the ledger, not just the recipe total — catches stale recipes)
  margin: number;
  marginPct: number; // 0–100, 0 when revenue is 0
  capacityUsed: number | null; // timesSold * capacityPerDelivery, null when capacityPerDelivery isn't set
}

export function computeOfferStats(
  offerProducts: Product[],
  sales: Sale[],
  saleEconomics: SaleEconomics[]
): Map<string, OfferStats> {
  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const result = new Map<string, OfferStats>();
  for (const product of offerProducts) {
    let timesSold = 0;
    let revenue = 0;
    let cost = 0;
    for (const sale of sales) {
      if (sale.productId !== product.id) continue;
      timesSold += sale.qty;
      // NET of returns/discounts (the same figure the P&L books), so margin = what was actually kept, not
      // list price less cost. Falls back to the billed amount only if a sale has no economics row yet.
      revenue += economicsBySaleId.get(sale.id)?.revenue ?? sale.qty * sale.unitPrice;
      cost += economicsBySaleId.get(sale.id)?.cogs ?? 0;
    }
    const margin = revenue - cost;
    result.set(product.id, {
      productId: product.id,
      timesSold,
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
      capacityUsed: product.capacityPerDelivery ? timesSold * product.capacityPerDelivery : null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Recurring items normalized to a monthly figure (MRR-style), and expanded
// into the specific months they're active in for period P&L.
// ---------------------------------------------------------------------------

export function monthlyNormalizedAmount(amount: number, recurrence: Recurrence): number {
  switch (recurrence) {
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
    default:
      return 0;
  }
}

// Returns the total recurring monthly run-rate active as of `asOfISO`.
// Deliberately does NOT include RecurringExpenseTemplate/Operations-style
// itemized costs — those don't have a stable run-rate to project by
// design (that's the whole reason they're not a flat isRecurring Expense
// in the first place), so a posted occurrence is a real, one-off-shaped
// Expense here. It still lands correctly in the actual month it happened
// via expenseTotalsForMonth below — it's just excluded from this specific
// forward-looking projection.
export function computeMRR(expenses: Expense[], asOfISO: string): { mrrRevenue: number; mrrExpense: number } {
  let mrrRevenue = 0;
  let mrrExpense = 0;
  for (const e of expenses) {
    if (!e.isRecurring) continue;
    const started = e.startDate <= asOfISO;
    const notEnded = !e.endDate || e.endDate >= asOfISO;
    if (started && notEnded) {
      const monthly = monthlyNormalizedAmount(e.amount, e.recurrence);
      if (e.kind === "revenue") mrrRevenue += monthly;
      else mrrExpense += monthly;
    }
  }
  return { mrrRevenue, mrrExpense };
}

// Expands expenses/recurring-revenue into a per-month total for a given
// month key ("YYYY-MM"). One-off items land only in their startDate's month.
export function expenseTotalsForMonth(
  expenses: Expense[],
  monthKey: string
): { expenseTotal: number; recurringRevenueTotal: number; sellingExpenses: number; adminExpenses: number } {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  let expenseTotal = 0;
  let recurringRevenueTotal = 0;
  // v177d: the same expense lines, split into Selling and General & administrative (lib/sga.ts). The two always add to expenseTotal.
  const lines: { category: string; amount: number }[] = [];

  for (const e of expenses) {
    if (e.isRecurring) {
      const started = e.startDate < nextMonth;
      const notEnded = !e.endDate || e.endDate >= monthStart;
      if (started && notEnded) {
        const monthly = monthlyNormalizedAmount(e.amount, e.recurrence);
        if (e.kind === "revenue") recurringRevenueTotal += monthly;
        else {
          expenseTotal += monthly;
          lines.push({ category: e.category, amount: monthly });
        }
      }
    } else {
      if (e.startDate >= monthStart && e.startDate < nextMonth) {
        if (e.kind === "revenue") recurringRevenueTotal += e.amount;
        else {
          expenseTotal += e.amount;
          lines.push({ category: e.category, amount: e.amount });
        }
      }
    }
  }
  const split = sgaSplit(lines);
  return { expenseTotal, recurringRevenueTotal, sellingExpenses: split.selling, adminExpenses: split.admin };
}

// Cash counterpart to expenseTotalsForMonth's expenseTotal — same month-
// membership rules (a recurring expense lands in every active month; a
// one-off lands only in its startDate's month), except a one-off expense
// marked paymentStatus "unpaid" contributes 0 here: it's a real accrual
// cost (counted in expenseTotal) but not yet a cash outflow. See
// Expense.paymentStatus and MonthlyPnL.expenseCash for the full reasoning.
export function expenseCashTotalForMonth(expenses: Expense[], monthKey: string): number {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  // Cash out is amount PLUS any reclaimable input tax: Expense.taxAmount is
  // kept out of `amount` (it is added on top of it — see the expense form),
  // and the tax is real money paid to the supplier, exactly like the input
  // tax on a stock purchase (purchaseCash already includes it). Leaving it
  // out overstated cash by the tax while the same tax was already being
  // netted off Sales Tax Payable, which threw the balance sheet out of
  // balance by exactly that amount for any business that flags an expense
  // as carrying reclaimable tax. P&L (expenseTotalsForMonth) still reads
  // `amount` alone — reclaimable tax is not an expense.
  let total = 0;
  for (const e of expenses) {
    if (e.kind !== "expense") continue;
    const gross = e.amount + (e.taxAmount ?? 0);
    if (e.isRecurring) {
      const started = e.startDate < nextMonth;
      const notEnded = !e.endDate || e.endDate >= monthStart;
      if (started && notEnded) total += monthlyNormalizedAmount(gross, e.recurrence);
    } else {
      if (e.startDate >= monthStart && e.startDate < nextMonth && e.paymentStatus !== "unpaid") {
        total += gross;
      }
    }
  }
  return total;
}

// Input tax reclaimable on non-stock expenses (rent, utilities,
// subcontractors, etc.) for one month — the mirror of the Purchase.taxAmount
// side already summed in the Tax summary. Same monthly-bucketing rules as
// expenseTotalsForMonth above: a one-off expense's tax lands in its
// startDate's month; a recurring flat expense's tax is normalized the same
// way its `amount` is (monthlyNormalizedAmount) and counted in every month
// it's active. Only expenses with a taxAmount actually set contribute —
// most won't, since input tax is opt-in per expense (see the doc comment on
// Expense.taxAmount in lib/types.ts).
export function expenseInputTaxForMonth(
  expenses: Expense[],
  monthKey: string
): { amount: number; taxedCount: number } {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  let amount = 0;
  let taxedCount = 0;

  for (const e of expenses) {
    if (e.kind !== "expense" || !e.taxAmount) continue;
    if (e.isRecurring) {
      const started = e.startDate < nextMonth;
      const notEnded = !e.endDate || e.endDate >= monthStart;
      if (started && notEnded) {
        amount += monthlyNormalizedAmount(e.taxAmount, e.recurrence);
        taxedCount += 1;
      }
    } else if (e.startDate >= monthStart && e.startDate < nextMonth) {
      amount += e.taxAmount;
      taxedCount += 1;
    }
  }
  return { amount, taxedCount };
}

// ---------------------------------------------------------------------------
// Period P&L: aggregate sales + expenses into monthly buckets, then compute
// gross profit, net profit (pre/post tax) per month.
// ---------------------------------------------------------------------------

import type { InvestmentMonthly } from "./investments";
import type { LendingMonthly } from "./lending";

// The input tax that goes back with `qty` returned units of `purchase`: its
// pro-rata share of the tax paid on the purchase, to the cent. The return that
// takes the last of the purchase takes whatever is left, so the shares always
// add back to exactly what was paid even when it doesn't divide evenly.
export function supplierReturnTaxFor(
  purchase: Pick<Purchase, "qty" | "taxAmount">,
  qty: number,
  priorReturns: Pick<SupplierReturn, "qty" | "taxAmount">[] = []
): number {
  const total = purchase.taxAmount ?? 0;
  if (!(total > 0) || !(purchase.qty > 0) || !(qty > 0)) return 0;
  const priorQty = priorReturns.reduce((sum, r) => sum + r.qty, 0);
  const priorTax = priorReturns.reduce((sum, r) => sum + (r.taxAmount ?? 0), 0);
  if (priorQty + qty >= purchase.qty - 1e-9) return Math.max(0, Math.round((total - priorTax) * 100) / 100);
  return Math.round(((total * qty) / purchase.qty) * 100) / 100;
}

// The true all-in cost of ONE unit once freight, customs and other delivery costs are spread over the units that
// arrived: the goods price per unit plus (the three TOTALS added up) divided by the quantity. This is the number that
// has to feed WAC/COGS, or margins are overstated by exactly the cost of getting the stock to you. Used by the
// receive-order and quick-buy forms (the full Purchase form does the same sum inline). qty <= 0 adds nothing.
export function landedUnitCost(goodsUnitCost: number, qty: number, freight = 0, customs = 0, other = 0): number {
  const total = Math.max(freight, 0) + Math.max(customs, 0) + Math.max(other, 0);
  return qty > 0 ? goodsUnitCost + total / qty : goodsUnitCost;
}

// Would recording this return leave a sale (dated after it) without the stock to
// cover it? True when it makes MORE sales oversold than there already are. The
// app blocks that at entry: an oversold sale is booked at full cost while stock
// can only fall to zero, which is a known way for the books to stop balancing,
// and a return dated before a later sale is the one way this feature could cause it.
export function supplierReturnCausesOversell(
  purchases: Purchase[],
  sales: Sale[],
  saleReturns: SaleReturn[],
  adjustments: StockAdjustment[],
  existing: SupplierReturn[],
  candidate: SupplierReturn,
  method: CostingMethod = "average"
): boolean {
  const oversoldCount = (ledger: ProductLedgerResult) => [...ledger.saleCogs.values()].filter((c) => c.oversold).length;
  const before = oversoldCount(computeProductLedger(purchases, sales, saleReturns, adjustments, existing, method));
  const after = oversoldCount(computeProductLedger(purchases, sales, saleReturns, adjustments, [...existing, candidate], method));
  return after > before;
}

// What computeMonthlyPnL needs to know about each supplier return — the
// P&L side of the same event the ledger takes out of stock. `inventoryValueOut`
// comes from the ledger (ProductLedgerResult.supplierReturnValue), never
// re-derived, so profit and the balance sheet's inventory line always agree.
export interface SupplierReturnPnLInput {
  date: string;
  inventoryValueOut: number; // inventory value that actually left stock
  creditAmount: number; // goods value the supplier gave back, before tax
  taxAmount: number; // input tax reversed with it
  settlement: SupplierReturn["settlement"];
}

export function computeSupplierReturnPnLInputs(
  returns: SupplierReturn[],
  ledgers: Map<string, ProductLedgerResult>
): SupplierReturnPnLInput[] {
  return returns.map((r) => ({
    date: r.date,
    inventoryValueOut: ledgers.get(r.productId)?.supplierReturnValue.get(r.id) ?? r.qty * r.unitCost,
    creditAmount: r.creditAmount,
    taxAmount: r.taxAmount ?? 0,
    settlement: r.settlement,
  }));
}

export interface MonthlyPnL {
  month: string; // "YYYY-MM"
  salesRevenue: number;
  recurringRevenue: number;
  totalRevenue: number;
  cogs: number;
  // Portion of variableCosts tagged VariableCost.includeInCogs=true (e.g.
  // outbound shipping) — counted toward Gross Profit below, not just
  // Contribution Margin. Zero unless a variable cost is explicitly tagged
  // that way.
  cogsVariableCosts: number;
  variableCosts: number;
  grossProfit: number; // totalRevenue - cogs - cogsVariableCosts — true Gross Margin
  grossMarginPct: number | null; // grossProfit / totalRevenue, null when no revenue
  // grossProfit minus whatever variableCosts weren't already counted toward
  // COGS above (selling fees, fulfillment, variable marketing, etc) — i.e.
  // totalRevenue - cogs - variableCosts. This is the number this app used
  // to call "grossProfit" before Gross Margin and Contribution Margin were
  // split into two distinct figures; the bottom line (netProfitPreTax and
  // everything after) is unaffected by the split.
  contributionMargin: number;
  contributionMarginPct: number | null; // contributionMargin / totalRevenue, null when no revenue
  operatingExpenses: number; // rent, payroll, subscriptions, etc — excludes loan interest
  sellingExpenses: number; // v177d: the Selling part of operatingExpenses (marketing, sales payroll, delivery)
  adminExpenses: number; // v177d: the General & administrative part (everything else in operatingExpenses)
  interestExpense: number; // loan interest for the month
  // Bad debt recognized this month via ReceivableWriteOff — a credit sale's
  // revenue was already booked (accrual basis) when the sale happened; this
  // is what corrects that once the money is known to be uncollectible.
  // Non-cash, like depreciationExpense, and treated the same way: it
  // reduces netProfitPreTax (and is tax-deductible) but never appears in
  // the cash-flow fields below.
  badDebtExpense: number;
  // Net inventory lost (positive) or found (negative) in the month via stock
  // adjustments — damaged, expired, stolen, count corrections — valued at
  // WAC. Non-cash, like depreciation: it reduces netProfitPreTax (inventory
  // on the Balance Sheet already drops by the same amount, so without this
  // the two would drift apart) but never touches the cash-flow fields.
  // "Used in production" is excluded by the caller: those units re-enter
  // stock as the finished good, so there is no loss to book.
  stockShrinkage: number;
  // Profit (positive) or loss (negative) from goods sent back to suppliers
  // this month: what the supplier credited/refunded minus the stock value
  // that left. Zero for a full-price return. Already INSIDE `cogs` above
  // (a gain lowers it, a loss such as a restocking fee raises it), so it is
  // shown for reference and is NOT subtracted again anywhere.
  supplierReturnGainLoss: number;
  netProfitPreTax: number; // contributionMargin - operatingExpenses - interestExpense - depreciationExpense + disposalGainLoss - badDebtExpense - stockShrinkage
  tax: number;
  netProfitAfterTax: number;
  netMarginPct: number | null; // netProfitAfterTax / totalRevenue, null when no revenue
  unitsSold: number;
  // Decision-support only — not a real transaction, never flows into the
  // Income Statement/Balance Sheet/Cash Flow Statement. Nets the owner's
  // imputed monthly labor cost (Settings.monthlyOwnerDraw) out of accounting
  // net profit, so "the business is profitable" isn't quietly built on
  // nobody paying themselves for the hours worked.
  economicProfit: number;
  // Non-cash straight-line depreciation for fixed assets held this month —
  // reduces net profit (and is tax-deductible, matching the pre-tax
  // treatment of every other expense here) but never touches cash.
  depreciationExpense: number;
  // Gain/loss recognized when a fixed asset is disposed this month:
  // disposal proceeds minus its net book value at disposal. Positive =
  // gain, negative = loss. Flows into net profit; the cash side is
  // `fixedAssetDisposalProceeds` below.
  disposalGainLoss: number;
  // Securities (lib/investments.ts). Income and realised gains are profit, below operating profit; cash
  // moves are in investingCashFlow. All zero for a business that holds no investments.
  investmentIncome: number;
  realizedInvestmentGain: number;
  investmentPurchases: number;
  investmentSaleProceeds: number;
  // Money lent out (lib/lending.ts). Interest received is profit (counted when it arrives, never before) and a
  // write-off of principal is a loss, both below operating profit; the cash moves are in investingCashFlow.
  // All zero for a business that lends nothing.
  lendingInterest: number;
  lendingWriteOff: number;
  moneyLent: number;
  loanCollections: number; // principal repaid by borrowers
  // Cash-basis fields, for the Cash Flow Statement / Balance Sheet. These
  // differ from the accrual fields above in a few key ways: inventory
  // purchases and sales hit cash only when actually paid/collected (not
  // when incurred/recognized — see cashSalesRevenue/receivableCollections
  // and purchaseCash/payableSettlements), and fixed-asset purchases/
  // disposals are investing activity, never part of accrual net profit
  // (only depreciation and disposal gain/loss are).
  //
  // FIX: cashSalesRevenue/purchaseCash below now also carry the sales-tax
  // portion of non-credit sales/purchases. Before this fix, a cash sale's
  // tax amount was neither counted as revenue (correct — it isn't) NOR as
  // cash received (wrong — a customer paying $118 for a $100+$18-tax item
  // puts the full $118 in the till, not $100). That silently understated
  // every figure downstream of netCashFlow: Cash on Hand, the Balance
  // Sheet's `cash`, runway, the "Can You Make Rent" projection, and the
  // trailing financial-health ratios — for any business with sales tax
  // turned on, which this app explicitly supports as a first-class
  // feature. Symmetrically for cashPurchasesThisMonth/purchaseCash: input
  // tax paid on a non-credit purchase is real cash out, not just an
  // inventory cost. outputTax/inputTax below are the accrual-basis
  // counterparts (all sales/purchases regardless of payment method,
  // matching the Tax Summary on the Statements page) — computeBalanceSheet
  // accumulates these into a Sales Tax Payable liability, which is what
  // keeps the balance sheet in balance now that cash correctly includes
  // the tax-inclusive amounts: without a matching liability, the extra
  // cash from tax collected would inflate assets with nothing on the
  // other side of the equation.
  cashSalesRevenue: number; // revenue + tax from non-credit sales, collected same month
  receivableCollections: number; // cash collected this month against credit sales (any period)
  purchaseCash: number; // net cash paid for inventory this month: non-credit purchases + tax + payable settlements, minus supplier refunds received
  supplierRefunds: number; // cash received this month from suppliers for returned goods (already netted out of purchaseCash)
  supplierDeposits: number; // cash paid this month to suppliers in advance, held as credit (already inside purchaseCash)
  supplierCreditRefunds: number; // cash received this month when a supplier paid held credit back (already netted out of purchaseCash)
  customerDepositsReceived: number; // cash taken this month from customers in advance, held as a liability (NOT revenue until applied to a sale)
  customerDepositRefunds: number; // cash paid back to customers this month out of what they had on deposit
  payableSettlements: number; // cash paid this month against supplier credit (any period)
  // Same "recognize now, pay later" split as purchaseCash/payableSettlements
  // above, for one-off Expenses marked paymentStatus "unpaid" instead of a
  // credit Purchase. expenseCash is the cash actually paid out this month
  // for expenses (every recurring expense, plus one-off expenses NOT marked
  // unpaid); billSettlements is cash paid this month against a previously
  // unpaid bill, via BillPayment, regardless of which month the bill itself
  // was recorded in. operatingExpenses (below) stays the full accrual
  // total either way — an unpaid bill is still a real cost the month it's
  // incurred, same as a credit purchase still reduces gross profit the
  // month it's made.
  expenseCash: number;
  billSettlements: number; // cash paid this month against unpaid bills (any period)
  loanProceeds: number; // new loan cash received this month
  principalRepayment: number; // loan principal repaid this month
  capitalIn: number; // owner investment/reinvestment this month
  capitalOut: number; // owner withdrawals this month
  fixedAssetPurchases: number; // cash paid to acquire fixed assets this month
  fixedAssetDisposalProceeds: number; // cash received on fixed asset disposals this month
  operatingCashFlow: number;
  financingCashFlow: number;
  investingCashFlow: number; // fixedAssetDisposalProceeds - fixedAssetPurchases
  netCashFlow: number; // operating + financing + investing
  // Sales tax collected on sales this month, and reclaimable input tax paid
  // on stock purchases + flagged expenses this month — accrual basis (all
  // sales/purchases regardless of payment method), same formula as the
  // Statements page's Tax Summary. Exists so computeBalanceSheet can
  // accumulate a running Sales Tax Payable liability without duplicating
  // this arithmetic a third time — see the FIX note above.
  outputTax: number;
  inputTax: number;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

// Every calendar month from the earliest activity to "now", inclusive — not
// just months that happen to contain a sale or a new expense. Without this,
// a recurring expense (rent, a loan payment) silently disappears from the
// P&L / cash flow in any month with no sales activity, which would also
// throw off the Balance Sheet's cumulative cash figure.
function fullMonthRange(startKey: string, endKey: string): string[] {
  const months: string[] = [];
  let [y, m] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function computeMonthlyPnL(
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  expenses: Expense[],
  purchases: Purchase[],
  loans: Loan[],
  capitalEntries: CapitalEntry[],
  taxRatePct: number,
  monthlyOwnerDraw = 0,
  fixedAssets: FixedAsset[] = [],
  receivablePayments: ReceivablePayment[] = [],
  payablePayments: PayablePayment[] = [],
  receivableWriteOffs: ReceivableWriteOff[] = [],
  billPayments: BillPayment[] = [],
  // Signed WAC value of each stock adjustment (negative = stock lost).
  stockAdjustmentValues: { date: string; value: number }[] = [],
  // Monthly investment effects from computeInvestmentPortfolio(...).monthly
  investmentMonthly: InvestmentMonthly[] = [],
  // Monthly effects of money the business has lent out, from computeLendingPortfolio(...).monthly
  lendingMonthly: LendingMonthly[] = [],
  // Goods sent back to suppliers — from computeSupplierReturnPnLInputs(...)
  supplierReturns: SupplierReturnPnLInput[] = [],
  // Supplier credit movements. Only deposits (cash out) and refunds (cash in) move cash; applying credit to a bill and
  // credit from a return move none, so they never reach this function's cash lines.
  supplierCredits: SupplierCreditEntry[] = [],
  // Customer deposits. Only money received (cash in) and refunded (cash out) reach the cash lines; applying a deposit to
  // an invoice moves no cash, and revenue is recognised by the sale itself, never by the deposit.
  customerDeposits: CustomerDepositEntry[] = [],
  // v209: accruals, joined to the monthly profit only (see lib/accruals.ts). Never read for cash.
  accruals: Accrual[] = []
): MonthlyPnL[] {
  const accrualExpenses = accrualAsExpenses(accruals);
  const creditCashByMonth = monthlyCreditCash(supplierCredits);
  const depositCashByMonth = monthlyDepositCash(customerDeposits);
  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const loanMonthlyTotals = computeLoanMonthlyTotals(loans);

  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const candidateKeys: string[] = [nowKey];
  for (const s of sales) candidateKeys.push(monthKey(s.date));
  for (const p of purchases) candidateKeys.push(monthKey(p.date));
  for (const c of supplierCredits) candidateKeys.push(monthKey(c.date));
  for (const d of customerDeposits) candidateKeys.push(monthKey(d.date));
  for (const e of expenses) candidateKeys.push(monthKey(e.startDate));
  // v209: a month that holds only an accrual or its reversal still has to be reported, so its dates count too.
  for (const a of accrualExpenses) candidateKeys.push(monthKey(a.startDate));
  for (const c of capitalEntries) candidateKeys.push(monthKey(c.date));
  for (const key of loanMonthlyTotals.keys()) candidateKeys.push(key);
  for (const a of fixedAssets) {
    candidateKeys.push(monthKey(a.purchaseDate));
    if (a.disposalDate) candidateKeys.push(monthKey(a.disposalDate));
  }
  for (const rp of receivablePayments) candidateKeys.push(monthKey(rp.date));
  for (const pp of payablePayments) candidateKeys.push(monthKey(pp.date));
  for (const wo of receivableWriteOffs) candidateKeys.push(monthKey(wo.date));
  for (const bp of billPayments) candidateKeys.push(monthKey(bp.date));
  for (const a of stockAdjustmentValues) candidateKeys.push(monthKey(a.date));
  for (const im of investmentMonthly) candidateKeys.push(im.month);
  for (const lm of lendingMonthly) candidateKeys.push(lm.month);
  for (const sr of supplierReturns) candidateKeys.push(monthKey(sr.date));

  if (candidateKeys.length === 0) return [];
  candidateKeys.sort();
  // This function reports what actually happened, month by month — never a
  // projection (that's forecastRevenue's job, entirely separately). But a
  // loan's amortization schedule and a recurring expense both generate
  // month keys for their FULL remaining term regardless of whether that
  // time has passed yet, so without capping here, adding any loan or
  // recurring expense silently stretches this array with not-yet-real
  // future months — zero sales, but real-looking interest expense — and
  // every caller that reads the array's tail (Dashboard's "this month"
  // stats, break-even, the trailing-12-months financial health ratios)
  // would silently grab one of those phantom months instead of the actual
  // most recent one. Capping the end at the current month is what keeps
  // this an accrual record of the past, not a forecast wearing its clothes.
  const rangeEnd = candidateKeys[candidateKeys.length - 1] > nowKey ? nowKey : candidateKeys[candidateKeys.length - 1];
  const months = fullMonthRange(candidateKeys[0], rangeEnd);
  const fixedAssetMonthlyTotals = computeFixedAssetMonthlyTotals(fixedAssets, months);
  const result: MonthlyPnL[] = [];

  for (const month of months) {
    const monthSales = sales.filter((s) => monthKey(s.date) === month);
    let salesRevenue = 0;
    let cogs = 0;
    let variableCosts = 0;
    let cogsVariableCosts = 0;
    let unitsSold = 0;
    for (const s of monthSales) {
      const econ = economicsBySaleId.get(s.id);
      salesRevenue += econ?.revenue ?? 0;
      cogs += econ?.cogs ?? 0;
      variableCosts += econ?.variableCost ?? 0;
      cogsVariableCosts += econ?.cogsVariableCost ?? 0;
      if (!s.isDelivery) unitsSold += s.qty; // a delivery charge is revenue, not a unit sold
    }

    // Goods sent back to suppliers: what they gave back minus the stock value
    // that left. A gain lowers cost of goods, a loss (restocking fee, part
    // credit) raises it — so gross profit, net profit and every margin pick
    // it up with no further change. Zero when nothing was returned.
    const monthSupplierReturns = supplierReturns.filter((r) => monthKey(r.date) === month);
    const supplierReturnGainLoss = monthSupplierReturns.reduce((sum, r) => sum + (r.creditAmount - r.inventoryValueOut), 0);
    const supplierRefunds = monthSupplierReturns
      .filter((r) => r.settlement === "refund")
      .reduce((sum, r) => sum + r.creditAmount + r.taxAmount, 0);
    const supplierReturnTax = monthSupplierReturns.reduce((sum, r) => sum + r.taxAmount, 0);
    cogs -= supplierReturnGainLoss;

    const { expenseTotal, recurringRevenueTotal, sellingExpenses, adminExpenses } = expenseTotalsForMonth(accrualExpenses.length ? [...expenses, ...accrualExpenses] : expenses, month);
    const totalRevenue = salesRevenue + recurringRevenueTotal;
    const grossProfit = totalRevenue - cogs - cogsVariableCosts;
    const contributionMargin = grossProfit - (variableCosts - cogsVariableCosts);

    const loanTotals = loanMonthlyTotals.get(month);
    const interestExpense = loanTotals?.interest ?? 0;
    const principalRepayment = loanTotals?.principal ?? 0;
    const loanProceeds = loanTotals?.proceeds ?? 0;

    const faTotals = fixedAssetMonthlyTotals.get(month);
    const depreciationExpense = faTotals?.depreciation ?? 0;
    const disposalGainLoss = faTotals?.disposalGainLoss ?? 0;
    const fixedAssetPurchases = faTotals?.purchaseCash ?? 0;
    const fixedAssetDisposalProceeds = faTotals?.disposalProceeds ?? 0;

    const badDebtExpense = receivableWriteOffs
      .filter((w) => monthKey(w.date) === month)
      .reduce((sum, w) => sum + w.amount, 0);

    const stockShrinkage = -stockAdjustmentValues
      .filter((a) => monthKey(a.date) === month)
      .reduce((sum, a) => sum + a.value, 0);

    const inv = investmentMonthly.find((x) => x.month === month);
    const investmentIncome = inv?.income ?? 0;
    const realizedInvestmentGain = inv?.realizedGain ?? 0;
    const investmentPurchases = inv?.purchases ?? 0;
    const investmentSaleProceeds = inv?.saleProceeds ?? 0;

    const lend = lendingMonthly.find((x) => x.month === month);
    const lendingInterest = lend?.interestReceived ?? 0;
    const lendingWriteOff = lend?.writtenOff ?? 0;
    const moneyLent = lend?.lent ?? 0;
    const loanCollections = lend?.principalCollected ?? 0;

    const netProfitPreTax =
      contributionMargin - expenseTotal - interestExpense - depreciationExpense + disposalGainLoss - badDebtExpense - stockShrinkage +
      investmentIncome + realizedInvestmentGain + lendingInterest - lendingWriteOff;
    const tax = Math.max(netProfitPreTax, 0) * (taxRatePct / 100);
    const netProfitAfterTax = netProfitPreTax - tax;
    const economicProfit = netProfitAfterTax - monthlyOwnerDraw;

    // Cash actually paid/collected this month — not the accrual figures
    // above. A credit sale/purchase only moves cash when it's actually
    // collected/paid (receivablePayments / payablePayments), not in the
    // month it was recognized as revenue/COGS.
    const cashSalesRevenue = monthSales
      .filter((s) => (s.paymentMethod ?? "cash") !== "credit")
      .reduce((sum, s) => sum + (economicsBySaleId.get(s.id)?.revenue ?? 0) + (s.taxAmount ?? 0), 0);

    const receivableCollections = receivablePayments
      .filter((p) => monthKey(p.date) === month)
      .reduce((sum, p) => sum + p.amount, 0);

    const monthPurchases = purchases.filter((p) => monthKey(p.date) === month);
    const cashPurchasesThisMonth = monthPurchases
      .filter((p) => (p.paymentMethod ?? "cash") !== "credit")
      .reduce((sum, p) => sum + p.qty * p.unitCost + (p.taxAmount ?? 0), 0);

    const outputTax = monthSales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
    const inputTaxOnStock = monthPurchases.reduce((sum, p) => sum + (p.taxAmount ?? 0), 0);
    const { amount: inputTaxOnExpenses } = expenseInputTaxForMonth(expenses, month);
    // Tax on returned goods is no longer reclaimable.
    const inputTax = inputTaxOnStock + inputTaxOnExpenses - supplierReturnTax;

    const payableSettlements = payablePayments
      .filter((p) => monthKey(p.date) === month)
      .reduce((sum, p) => sum + p.amount, 0);

    const supplierDeposits = creditCashByMonth.get(month)?.deposits ?? 0;
    const supplierCreditRefunds = creditCashByMonth.get(month)?.refunds ?? 0;
    const purchaseCash = cashPurchasesThisMonth + payableSettlements + supplierDeposits - supplierRefunds - supplierCreditRefunds;

    // Cash actually paid out for expenses this month — mirrors
    // expenseTotalsForMonth's month-membership rules exactly (so a
    // recurring expense lands in every active month, not just its
    // startDate's month), but skips one-off expenses marked "unpaid": that
    // cost is still real and counted in expenseTotal (accrual) above, just
    // not paid in cash yet. billSettlements is cash paid this month against
    // a previously unpaid bill, mirroring payableSettlements for credit
    // purchases.
    const cashExpensesThisMonth = expenseCashTotalForMonth(expenses, month);
    const billSettlements = billPayments
      .filter((bp) => monthKey(bp.date) === month)
      .reduce((sum, bp) => sum + bp.amount, 0);
    const expenseCash = cashExpensesThisMonth + billSettlements;

    const monthCapital = capitalEntries.filter((c) => monthKey(c.date) === month);
    const capitalIn = monthCapital
      .filter((c) => c.kind === "investment" || c.kind === "reinvestment")
      .reduce((s, c) => s + c.amount, 0);
    const capitalOut = monthCapital
      .filter((c) => c.kind === "withdrawal")
      .reduce((s, c) => s + c.amount, 0);

    const customerDepositsReceived = depositCashByMonth.get(month)?.received ?? 0;
    const customerDepositRefunds = depositCashByMonth.get(month)?.refunds ?? 0;
    const operatingCashFlow =
      cashSalesRevenue +
      recurringRevenueTotal +
      receivableCollections +
      customerDepositsReceived -
      customerDepositRefunds -
      purchaseCash -
      variableCosts -
      expenseCash -
      interestExpense -
      tax;
    const financingCashFlow = loanProceeds - principalRepayment + capitalIn - capitalOut;
    const investingCashFlow =
      fixedAssetDisposalProceeds - fixedAssetPurchases + investmentSaleProceeds + investmentIncome - investmentPurchases +
      lendingInterest + loanCollections - moneyLent;

    result.push({
      month,
      salesRevenue,
      recurringRevenue: recurringRevenueTotal,
      totalRevenue,
      cogs,
      cogsVariableCosts,
      variableCosts,
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : null,
      contributionMargin,
      contributionMarginPct: totalRevenue > 0 ? (contributionMargin / totalRevenue) * 100 : null,
      operatingExpenses: expenseTotal,
      sellingExpenses,
      adminExpenses,
      interestExpense,
      badDebtExpense,
      stockShrinkage,
      supplierReturnGainLoss,
      netProfitPreTax,
      tax,
      netProfitAfterTax,
      netMarginPct: totalRevenue > 0 ? (netProfitAfterTax / totalRevenue) * 100 : null,
      unitsSold,
      economicProfit,
      depreciationExpense,
      disposalGainLoss,
      investmentIncome,
      realizedInvestmentGain,
      investmentPurchases,
      investmentSaleProceeds,
      lendingInterest,
      lendingWriteOff,
      moneyLent,
      loanCollections,
      cashSalesRevenue,
      receivableCollections,
      purchaseCash,
      supplierRefunds,
      supplierDeposits,
      supplierCreditRefunds,
      customerDepositsReceived,
      customerDepositRefunds,
      payableSettlements,
      expenseCash,
      billSettlements,
      loanProceeds,
      principalRepayment,
      capitalIn,
      capitalOut,
      fixedAssetPurchases,
      fixedAssetDisposalProceeds,
      operatingCashFlow,
      financingCashFlow,
      investingCashFlow,
      netCashFlow: operatingCashFlow + financingCashFlow + investingCashFlow,
      outputTax,
      inputTax,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Forecasting: simple linear regression (least squares) over monthly revenue
// plus a 3-period moving average, projected forward N months.
//
// Why not ARIMA/Prophet: those need dozens of clean periodic data points to
// beat a trend line. A solo SME ledger has few, noisy months. Linear
// regression + moving average is transparent (you can verify it by hand),
// stable with sparse data, and good enough to spot direction and rough
// magnitude - which is what this is for.
//
// Scenario bands (best/downside): a single trend line is exactly the
// "one optimistic scenario" trap — it invites planning (hiring, a big
// order, a lease) around the expected line with no view of what a bad
// month does to that plan. best/downside widen the *projected* months
// only (historical months are facts, not scenarios) by one standard
// deviation of the trend line's own past residuals — i.e. "how wrong has
// this trend line actually been on the data we already have", not a
// modeled/assumed volatility. Kept deliberately simple and constant-width
// rather than widening further for months deeper into the future (a more
// "correct" random-walk treatment would do that) — with 3-12 noisy
// monthly data points widening bands would mostly add false precision,
// not real information. Downside is floored at 0 (revenue can't go
// negative).
// ---------------------------------------------------------------------------

export interface ForecastPoint {
  month: string;
  actual: number | null;
  trend: number;
  movingAvg: number | null;
  best: number | null; // optimistic scenario — projected months only, null for historical months
  downside: number | null; // conservative scenario — projected months only, null for historical months
}

function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const xs = ys.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

// Population std deviation of the trend line's residuals against actual
// history (0 when there isn't enough history to say anything about the
// line's own error). This is what makes the scenario band data-derived
// rather than an arbitrary "±20%" guess.
function residualStdDev(values: number[], slope: number, intercept: number): number {
  const n = values.length;
  if (n < 2) return 0;
  const residuals = values.map((v, i) => v - (intercept + slope * i));
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function forecastRevenue(
  monthlyPnL: MonthlyPnL[],
  forecastMonths: number,
  metric: (m: MonthlyPnL) => number = (m) => m.totalRevenue
): ForecastPoint[] {
  if (monthlyPnL.length === 0) return [];

  const values = monthlyPnL.map(metric);
  const { slope, intercept } = linearRegression(values);
  const band = residualStdDev(values, slope, intercept);

  const points: ForecastPoint[] = monthlyPnL.map((m, i) => {
    const windowStart = Math.max(0, i - 2);
    const windowVals = values.slice(windowStart, i + 1);
    const movingAvg = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
    return {
      month: m.month,
      actual: values[i],
      trend: intercept + slope * i,
      movingAvg,
      best: null,
      downside: null,
    };
  });

  const lastMonth = monthlyPnL[monthlyPnL.length - 1].month;
  for (let i = 1; i <= forecastMonths; i++) {
    const idx = monthlyPnL.length - 1 + i;
    const trend = intercept + slope * idx;
    points.push({
      month: addMonths(lastMonth, i),
      actual: null,
      trend,
      movingAvg: null,
      best: trend + band,
      downside: Math.max(0, trend - band),
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Dashboard summary helpers
// ---------------------------------------------------------------------------

export function currentInventoryValue(ledgers: Map<string, ProductLedgerResult>): number {
  let total = 0;
  for (const l of ledgers.values()) total += l.inventoryValue;
  return total;
}

export function currentInventoryUnits(ledgers: Map<string, ProductLedgerResult>): number {
  let total = 0;
  for (const l of ledgers.values()) total += Math.max(l.qtyOnHand, 0);
  return total;
}

// ---------------------------------------------------------------------------
// Economic Order Quantity (EOQ) — product-type offerings only. Services have
// no physical stock, so reorder planning doesn't apply to them.
//
// EOQ = sqrt(2 * D * S / H)
//   D = annual demand (units/year)
//   S = fixed cost to place one order
//   H = annual holding cost per unit (derived as holdingCostPct% of unit cost)
//
// Reorder point = average daily demand * lead time (days). When qty on hand
// falls at or below this, it's time to place the next order.
// ---------------------------------------------------------------------------

// Estimates annualized demand from actual sales history. Uses the trailing
// 90 days if there's enough history to be meaningful; otherwise annualizes
// whatever history exists (at least 1 day) so a brand-new product still gets
// a (rough) number instead of zero.
export function estimateAnnualDemand(sales: Sale[], productId: string, asOfISO: string): number {
  const productSales = sales.filter((s) => s.productId === productId);
  if (productSales.length === 0) return 0;

  const asOf = new Date(asOfISO + "T00:00:00Z").getTime();
  const ninetyDaysAgo = asOf - 90 * 24 * 60 * 60 * 1000;
  const recent = productSales.filter((s) => new Date(s.date + "T00:00:00Z").getTime() >= ninetyDaysAgo);

  const useRecent = recent.length > 0 ? recent : productSales;
  const dates = useRecent.map((s) => new Date(s.date + "T00:00:00Z").getTime());
  const spanDays = Math.max(1, (Math.max(...dates, asOf) - Math.min(...dates)) / (24 * 60 * 60 * 1000) + 1);
  const totalQty = useRecent.reduce((sum, s) => sum + s.qty, 0);

  return (totalQty / spanDays) * 365;
}

export interface EoqResult {
  annualDemand: number;
  orderingCost: number;
  holdingCostPerUnit: number;
  eoq: number;
  ordersPerYear: number;
  daysOfSupplyPerOrder: number;
  dailyDemand: number;
  reorderPoint: number;
  totalAnnualCost: number; // ordering + holding cost at EOQ (excludes purchase cost itself)
}

export function computeEOQ(
  product: Product,
  wac: number,
  annualDemand: number,
  settings: Settings
): EoqResult {
  const orderingCost = product.orderingCost ?? settings.defaultOrderingCost;
  const holdingCostPct = product.holdingCostPct ?? settings.defaultHoldingCostPct;
  const leadTimeDays = product.leadTimeDays ?? settings.defaultLeadTimeDays;
  const holdingCostPerUnit = (holdingCostPct / 100) * wac;

  const dailyDemand = annualDemand / 365;
  // Safety cushion is a days-of-demand add-on to the lead time. It moves ONLY the reorder
  // flag: the EOQ (how much to order) is driven by demand, ordering and holding cost alone.
  const safetyDays = Math.max(0, settings.defaultSafetyStockDays ?? 0);
  const reorderPoint = dailyDemand * (leadTimeDays + safetyDays);

  if (annualDemand <= 0 || holdingCostPerUnit <= 0 || orderingCost <= 0) {
    return {
      annualDemand,
      orderingCost,
      holdingCostPerUnit,
      eoq: 0,
      ordersPerYear: 0,
      daysOfSupplyPerOrder: 0,
      dailyDemand,
      reorderPoint,
      totalAnnualCost: 0,
    };
  }

  const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
  const ordersPerYear = annualDemand / eoq;
  const totalAnnualCost = ordersPerYear * orderingCost + (eoq / 2) * holdingCostPerUnit;

  return {
    annualDemand,
    orderingCost,
    holdingCostPerUnit,
    eoq,
    ordersPerYear,
    daysOfSupplyPerOrder: eoq / Math.max(dailyDemand, 0.0001),
    dailyDemand,
    reorderPoint,
    totalAnnualCost,
  };
}

// ---------------------------------------------------------------------------
// Break-even & overhead coverage. Answers "are we actually profitable once
// overhead is accounted for" using a blended contribution margin ratio
// across everything sold (products and services together), applied to
// current fixed operating costs (the recurring + one-off expense run-rate).
// ---------------------------------------------------------------------------

export interface BreakEvenResult {
  contributionMarginRatio: number; // 0..1, blended across all sales in the period
  monthlyFixedCosts: number;
  breakEvenRevenue: number; // revenue needed per month to cover fixed costs
  actualRevenue: number;
  marginOfSafetyPct: number | null; // how far above break-even, as % of actual revenue
  overheadCoverageRatio: number | null; // gross profit / operating expenses; >1 = covering overhead
}

export function computeBreakEven(
  latestMonth: MonthlyPnL | undefined,
  trailingMonths: MonthlyPnL[]
): BreakEvenResult {
  // Blend contribution margin ratio over up to the last 3 months of actual
  // sales, so one unusually cheap/expensive month doesn't skew the picture.
  const window = trailingMonths.slice(-3);
  const revenue = window.reduce((s, m) => s + m.salesRevenue, 0);
  const variableCostTotal = window.reduce((s, m) => s + m.cogs + m.variableCosts, 0);
  const contributionMarginRatio = revenue > 0 ? (revenue - variableCostTotal) / revenue : 0;

  // Depreciation is a real fixed cost (just non-cash), so it belongs in the
  // break-even fixed-cost base alongside rent/payroll/subscriptions —
  // otherwise break-even revenue understates what's actually needed to
  // cover the business's full cost structure.
  const monthlyFixedCosts = (latestMonth?.operatingExpenses ?? 0) + (latestMonth?.depreciationExpense ?? 0);
  const breakEvenRevenue = contributionMarginRatio > 0 ? monthlyFixedCosts / contributionMarginRatio : Infinity;
  const actualRevenue = latestMonth?.totalRevenue ?? 0;

  const marginOfSafetyPct =
    actualRevenue > 0 && Number.isFinite(breakEvenRevenue)
      ? ((actualRevenue - breakEvenRevenue) / actualRevenue) * 100
      : null;

  // Contribution margin, not (the now-distinct) gross profit — "does what's
  // left after ALL variable costs cover fixed overhead" is the question
  // this ratio is answering, matching contributionMarginRatio/
  // breakEvenRevenue above, which also treat COGS + every variable cost as
  // one blended bucket. Using the narrower gross-profit figure here would
  // overstate how much room there actually is to cover overhead.
  const overheadCoverageRatio =
    latestMonth && monthlyFixedCosts > 0 ? latestMonth.contributionMargin / monthlyFixedCosts : null;

  return {
    contributionMarginRatio,
    monthlyFixedCosts,
    breakEvenRevenue,
    actualRevenue,
    marginOfSafetyPct,
    overheadCoverageRatio,
  };
}

// ---------------------------------------------------------------------------
// Capital & ROI — initial investment, reinvestment, and withdrawals tracked
// separately from operating P&L, so payback and net cash position are visible
// alongside month-to-month profit.
// ---------------------------------------------------------------------------

export interface CapitalSummary {
  totalInvested: number; // investment + reinvestment
  totalWithdrawn: number;
  netCapitalIn: number; // totalInvested - totalWithdrawn
  cumulativeNetProfit: number; // sum of net profit after tax across all recorded months
  netPosition: number; // cumulativeNetProfit - netCapitalIn (>0 = paid back and ahead)
  paybackReached: boolean;
  roiPct: number | null; // cumulativeNetProfit / netCapitalIn * 100
}

export function computeCapitalSummary(
  capitalEntries: CapitalEntry[],
  monthlyPnL: MonthlyPnL[]
): CapitalSummary {
  let totalInvested = 0;
  let totalWithdrawn = 0;
  for (const c of capitalEntries) {
    if (c.kind === "investment" || c.kind === "reinvestment") totalInvested += c.amount;
    else totalWithdrawn += c.amount;
  }
  const netCapitalIn = totalInvested - totalWithdrawn;
  const cumulativeNetProfit = monthlyPnL.reduce((s, m) => s + m.netProfitAfterTax, 0);
  const netPosition = cumulativeNetProfit - netCapitalIn;

  return {
    totalInvested,
    totalWithdrawn,
    netCapitalIn,
    cumulativeNetProfit,
    netPosition,
    paybackReached: netCapitalIn <= 0 || cumulativeNetProfit >= netCapitalIn,
    roiPct: netCapitalIn > 0 ? (cumulativeNetProfit / netCapitalIn) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Capital budgeting — NPV, IRR, payback, WACC. A one-off "should I make
// this investment" calculator (buy equipment, expand a product line, add
// a second van), deliberately separate from CapitalEntry/CapitalSummary
// above: those track money that has ALREADY moved in/out of the business;
// this evaluates a hypothetical future decision BEFORE any money moves.
// Cash flows here are user-entered projections, not real ledger data —
// same "transparent, hand-verifiable" philosophy as forecasting above
// rather than a black-box model.
// ---------------------------------------------------------------------------

// Net Present Value: discount every projected cash flow back to today at
// `discountRatePct`. cashFlows[0] is period 0 (conventionally the initial
// outlay, negative), cashFlows[1..n] are the returns in each subsequent
// period (typically years, but any consistent period works).
export function computeNPV(cashFlows: number[], discountRatePct: number): number {
  const r = discountRatePct / 100;
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + r, t), 0);
}

// Internal Rate of Return — the discount rate at which NPV = 0, i.e. the
// investment's own break-even return. Solved by bisection over a wide
// bracket (-99% to +1000%) rather than Newton-Raphson: bisection always
// converges given a bracket that brackets a root and needs no derivative
// or starting guess, which matters since cash flows are hand-entered and
// can have unconventional shapes. Returns null when there's no sign
// change across the bracket — e.g. every cash flow is the same sign, so
// no rate zeroes the sum out (a common, meaningful case: "this never pays
// back at any rate" is itself the answer).
export function computeIRR(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;
  const npvAt = (ratePct: number) => computeNPV(cashFlows, ratePct);
  let lo = -99;
  let hi = 1000;
  let npvLo = npvAt(lo);
  const npvHi = npvAt(hi);
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (npvLo > 0 === npvHi > 0) return null; // same sign at both ends of the bracket — no root in range
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAt(mid);
    if (Math.abs(npvMid) < 1e-6) return mid;
    if (npvMid > 0 === npvLo > 0) {
      lo = mid;
      npvLo = npvMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// Simple (undiscounted) payback period, in periods — the first point at
// which cumulative cash flow turns non-negative, interpolated fractionally
// within the crossing period. This is intentionally the cruder sibling of
// IRR/NPV (ignores the time value of money) because "how many years until
// I've literally gotten my money back" is a different, still-useful
// question from "is this a good return" — an SME owner sizing up survival
// risk on a big purchase often cares about both. Null if it never pays
// back within the cash flows given.
export function computePaybackPeriod(cashFlows: number[]): number | null {
  let cumulative = cashFlows[0] ?? 0;
  if (cumulative >= 0) return 0;
  for (let t = 1; t < cashFlows.length; t++) {
    const prev = cumulative;
    cumulative += cashFlows[t];
    if (cumulative >= 0) {
      const frac = cashFlows[t] !== 0 ? -prev / cashFlows[t] : 0;
      return t - 1 + frac;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Investment stress test — the same NPV / IRR / payback as above, run three
// times: as entered (base), better than planned (strong) and worse than
// planned (downside). "Uncertain profit is not the same as predictable
// profit": a decision that only works in the base case is a bet, and this
// makes that visible before any money moves.
//
// Deliberately plain and hand-checkable — no probabilities (a made-up
// probability would look as precise as a fact). Each year's cash flow is
// nudged by a percentage in the favourable or unfavourable direction: a
// positive year gets bigger/smaller, a loss-making year gets smaller/bigger,
// so "downside" always means worse for every year, never accidentally
// better. The downside case can also carry a cost overrun on the upfront
// outlay, since projects rarely come in under budget.
// ---------------------------------------------------------------------------

export interface InvestmentScenario {
  outlay: number; // upfront cost in this case (positive number)
  cashFlows: number[]; // [-outlay, year1, year2, ...]
  npv: number;
  irr: number | null;
  payback: number | null;
}

export interface InvestmentScenarios {
  base: InvestmentScenario;
  strong: InvestmentScenario;
  downside: InvestmentScenario;
}

// improvePct > 0 moves a cash flow in the favourable direction, < 0 in the
// unfavourable one. Floored so a large percentage can never flip a sign.
function scaleCashFlow(cf: number, improvePct: number): number {
  const f = improvePct / 100;
  return cf >= 0 ? cf * Math.max(0, 1 + f) : cf * Math.max(0, 1 - f);
}

export function computeInvestmentScenarios(input: {
  outlay: number;
  yearlyCashFlows: number[];
  discountRatePct: number;
  strongPct: number; // % better than planned, e.g. 25
  downsidePct: number; // % worse than planned, e.g. 30
  overrunPct: number; // % over budget on the upfront cost in the downside case, e.g. 20
}): InvestmentScenarios {
  const outlay = Math.max(0, input.outlay);
  const strongPct = Math.max(0, input.strongPct);
  const downsidePct = Math.max(0, input.downsidePct);
  const overrunPct = Math.max(0, input.overrunPct);
  const build = (caseOutlay: number, improvePct: number): InvestmentScenario => {
    const cashFlows = [-caseOutlay, ...input.yearlyCashFlows.map((cf) => scaleCashFlow(cf, improvePct))];
    return {
      outlay: caseOutlay,
      cashFlows,
      npv: computeNPV(cashFlows, input.discountRatePct),
      irr: computeIRR(cashFlows),
      payback: computePaybackPeriod(cashFlows),
    };
  };
  return {
    base: build(outlay, 0),
    strong: build(outlay, strongPct),
    downside: build(outlay * (1 + overrunPct / 100), -downsidePct),
  };
}

// ---------------------------------------------------------------------------
// Safe to commit — cash on hand is not the same as cash you can put to work.
// Before funding growth, set aside what the business already owes and a
// buffer for the months ahead; only what is left is allocatable.
//
//   cash on hand
//   − sales tax the books say you still owe
//   − supplier bills and expense bills already owed
//   − buffer (N months of monthly costs + loan repayments)
//   = safe to commit
//
// Conservative on purpose: monthly costs include depreciation (non-cash) and
// a bill already owed may also recur next month, so the figure errs low.
// Receivables are NOT counted — money customers owe you is not cash yet.
// Everything comes from the books; nothing is filed with or checked against
// any tax authority.
// ---------------------------------------------------------------------------

export interface SafeToCommitInput {
  cash: number;
  salesTaxPayable: number;
  accountsPayable: number; // supplier payables outstanding
  billsPayable: number; // expense bills outstanding
  customerDeposits?: number; // money customers paid in advance: in the cash, but not yours until you deliver or refund it
  monthlyFixedCosts: number; // BreakEvenResult.monthlyFixedCosts
  monthlyLoanPayments: number; // LoanPortfolioSummary.totalMonthlyPayment
  bufferMonths: number;
}

export interface SafeToCommit {
  cash: number;
  alreadyOwed: number; // tax + supplier payables + bills + customer deposits
  monthlyObligations: number; // fixed costs + loan repayments
  buffer: number; // monthlyObligations × bufferMonths
  safeToCommit: number; // never negative
  shortfall: number; // how far below "owed + buffer" cash is, 0 when covered
}

export function computeSafeToCommit(input: SafeToCommitInput): SafeToCommit {
  const alreadyOwed =
    Math.max(0, input.salesTaxPayable) + Math.max(0, input.accountsPayable) + Math.max(0, input.billsPayable) + Math.max(0, input.customerDeposits ?? 0);
  const monthlyObligations = Math.max(0, input.monthlyFixedCosts) + Math.max(0, input.monthlyLoanPayments);
  const buffer = monthlyObligations * Math.max(0, input.bufferMonths);
  const free = input.cash - alreadyOwed - buffer;
  return {
    cash: input.cash,
    alreadyOwed,
    monthlyObligations,
    buffer,
    safeToCommit: Math.max(0, free),
    shortfall: free < 0 ? -free : 0,
  };
}

// Opportunity scoring — ranks hypothetical ventures against each other:
//   (Financial Ceiling × Optionality × Longevity)
//   ÷ (Capital Required × Time to Profit × Passport Friction × Risk)
// Every factor is a hand-entered 1-10 self-assessment (see the Opportunity
// doc comment in lib/types.ts for what each one means) — this doesn't
// derive from ledger data, it's a scoring tool for comparing options that
// don't have any ledger history yet. The three upside factors sit on top;
// the four "cost of pursuing it" factors sit on the bottom, so a venture
// that's cheap, fast, low-friction and low-risk scores higher than one
// with the same upside but a harder road to get there. There's no natural
// ceiling on the result — it's only meaningful relative to other scored
// opportunities, not against some absolute scale. Returns null if any
// bottom-side factor is zero or negative (undefined ratio), which
// shouldn't happen with the 1-10 inputs the UI collects but is guarded
// against for hand-edited/imported data.
export function computeOpportunityScore(input: {
  financialCeiling: number;
  optionality: number;
  longevity: number;
  capitalRequired: number;
  timeToProfit: number;
  passportFriction: number;
  risk: number;
}): number | null {
  const { financialCeiling, optionality, longevity, capitalRequired, timeToProfit, passportFriction, risk } = input;
  const denominator = capitalRequired * timeToProfit * passportFriction * risk;
  if (denominator <= 0) return null;
  return (financialCeiling * optionality * longevity) / denominator;
}

// Weighted Average Cost of Capital — the discount rate a real investment
// decision should be evaluated against when it's funded by a mix of
// owner equity and borrowed money, rather than a guessed flat rate.
// WACC = (E/V)×costOfEquity + (D/V)×costOfDebt×(1−tax). The (1−tax) term
// only applies to the debt side because loan interest is tax-deductible
// for a business (a real cash-flow effect) while a return demanded on
// equity is not. Returns null when there's no capital (E+D = 0) to weight.
export function computeWACC(input: {
  equityValue: number;
  debtValue: number;
  costOfEquityPct: number;
  costOfDebtPct: number;
  taxRatePct: number;
}): number | null {
  const { equityValue, debtValue, costOfEquityPct, costOfDebtPct, taxRatePct } = input;
  const total = equityValue + debtValue;
  if (total <= 0) return null;
  const weightEquity = equityValue / total;
  const weightDebt = debtValue / total;
  return weightEquity * costOfEquityPct + weightDebt * costOfDebtPct * (1 - taxRatePct / 100);
}

// Future value — the mirror image of computeNPV above: instead of
// discounting future cash flows back to today, this grows a sum of money
// forward. Answers a different question than the investment-worth-it
// calculator does ("is this purchase worth its cost") — this is "what
// will money set aside now, or saved regularly, be worth later," e.g. an
// SME owner deciding whether to put idle cash into an interest-bearing
// account/fixed deposit rather than let it sit, or projecting a reserve
// fund's growth. FV = PV × (1+r)^n.
export function computeFutureValue(presentValue: number, ratePct: number, periods: number): number {
  const r = ratePct / 100;
  return presentValue * Math.pow(1 + r, periods);
}

// Future value of a series of equal periodic contributions (an "ordinary
// annuity" — each contribution made at the END of its period, the
// standard convention and the simpler one to reason about for "I set
// aside this much every month/year"). FV = C × [((1+r)^n − 1) / r].
// The r=0 case is handled separately since the formula divides by zero
// at r=0, even though the answer there is simple: with no growth at all,
// the total is just every contribution added up (C × n).
export function computeFutureValueOfSeries(periodicContribution: number, ratePct: number, periods: number): number {
  const r = ratePct / 100;
  if (r === 0) return periodicContribution * periods;
  return periodicContribution * ((Math.pow(1 + r, periods) - 1) / r);
}

// Startup capital needed — one-time setup costs plus enough of a buffer
// to cover fixed monthly costs for a stretch of time with no reliable
// revenue yet, a standard rule of thumb being 6-12 months of runway
// before opening. formula: oneTimeCosts + (fixedMonthlyCosts ×
// bufferMonths). Trivial arithmetic on purpose — the two questions this
// answers ("what does launch cost" and "how many months of safety margin
// do I want") are for a human to decide, not for this to guess at.
export function computeStartupCapitalNeeded(oneTimeCosts: number, fixedMonthlyCosts: number, bufferMonths: number): number {
  return oneTimeCosts + fixedMonthlyCosts * bufferMonths;
}

// ---------------------------------------------------------------------------
// Attach rate — of every order containing a chosen "anchor" product, what %
// also contained each other product. The classic "coffee + food attach
// rate" cafe-model question, generalized to any product pair.
//
// An "order" here is one invoiceId group (see Sale.invoiceId — every Sale
// sharing an invoiceId was billed together as a single multi-item
// invoice). A standalone Sale with no invoiceId counts as its own
// one-item order. This deliberately does NOT group by matching
// customer+date: two standalone sales to the same customer on the same
// day are two separate orders unless they were actually entered together
// as one multi-item invoice — guessing they were the same visit would
// silently merge unrelated transactions. That means attach rate can only
// ever be as good as how consistently multi-item purchases are entered
// through MultiItemInvoiceForm rather than as separate quick sales.
// ---------------------------------------------------------------------------

export interface AttachRateRow {
  productId: string;
  productName: string;
  ordersWithBoth: number;
  attachRatePct: number; // ordersWithBoth / ordersWithAnchor * 100
}

export interface AttachRateResult {
  anchorProductId: string;
  ordersWithAnchor: number; // total orders (see above) that included the anchor at all
  rows: AttachRateRow[]; // every other product that co-occurred at least once, ranked by attach rate desc
}

export function computeAttachRates(
  sales: Sale[],
  products: Product[],
  anchorProductId: string,
  dateFrom?: string,
  dateTo?: string
): AttachRateResult {
  const inRange = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  const filtered = sales.filter((s) => inRange(s.date));

  // Group into orders: an invoiceId groups multiple Sale rows into one
  // order; a standalone sale (no invoiceId) is its own order, keyed by its
  // own id so it never collides with another standalone sale.
  const orders = new Map<string, Set<string>>(); // orderKey -> set of productIds in that order
  for (const s of filtered) {
    const key = s.invoiceId ?? `solo_${s.id}`;
    const set = orders.get(key) ?? new Set<string>();
    set.add(s.productId);
    orders.set(key, set);
  }

  let ordersWithAnchor = 0;
  const coOccur = new Map<string, number>();
  for (const productSet of orders.values()) {
    if (!productSet.has(anchorProductId)) continue;
    ordersWithAnchor += 1;
    for (const pid of productSet) {
      if (pid === anchorProductId) continue;
      coOccur.set(pid, (coOccur.get(pid) ?? 0) + 1);
    }
  }

  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const rows: AttachRateRow[] = [...coOccur.entries()]
    .map(([productId, ordersWithBoth]) => ({
      productId,
      productName: productNameById.get(productId) ?? "—",
      ordersWithBoth,
      attachRatePct: ordersWithAnchor > 0 ? (ordersWithBoth / ordersWithAnchor) * 100 : 0,
    }))
    .sort((a, b) => b.attachRatePct - a.attachRatePct);

  return { anchorProductId, ordersWithAnchor, rows };
}

// ---------------------------------------------------------------------------
// Wholesale orders in flight — quantity ordered but not yet received, per
// product. Cancelled and already-received orders don't count. This is what
// makes "on order" visible separately from "on hand" (which only reflects
// stock that has actually arrived, via Purchases/the WAC ledger).
// ---------------------------------------------------------------------------

export function computeOnOrderByProduct(purchaseOrders: PurchaseOrder[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const po of purchaseOrders) {
    if (po.status !== "ordered" && po.status !== "in_transit") continue;
    map.set(po.productId, (map.get(po.productId) ?? 0) + po.qtyOrdered);
  }
  return map;
}

export interface OpenOrderValue {
  openOrderCount: number;
  openOrderUnits: number;
  openOrderValue: number; // committed spend on orders not yet received
}

export function computeOpenOrderValue(purchaseOrders: PurchaseOrder[]): OpenOrderValue {
  let openOrderCount = 0;
  let openOrderUnits = 0;
  let openOrderValue = 0;
  for (const po of purchaseOrders) {
    if (po.status !== "ordered" && po.status !== "in_transit") continue;
    openOrderCount += 1;
    openOrderUnits += po.qtyOrdered;
    openOrderValue += po.qtyOrdered * po.unitCost;
  }
  return { openOrderCount, openOrderUnits, openOrderValue };
}

// ---------------------------------------------------------------------------
// Employees / payroll. The actual cost to the business (gross pay) is booked
// as a normal recurring Expense (see DataContext), so it already flows
// through computeMRR / computeMonthlyPnL / expenseTotalsForMonth untouched.
// This just adds the employee-facing view: estimated take-home after their
// personal tax %, and a total monthly payroll run-rate for active staff.
// ---------------------------------------------------------------------------

// Sri Lanka statutory payroll on-costs (Employees' Provident Fund /
// Employees' Trust Fund). Fixed by law, not a business assumption — unlike
// the VAT/GST rate in Settings, these aren't meant to be edited per
// business. Employer pays 12% (EPF) + 3% (ETF) of gross pay on top of it;
// the employee's own 8% EPF share is deducted from their gross pay, not an
// extra cost to the business.
export const SL_EPF_EMPLOYER_PCT = 12;
export const SL_EPF_EMPLOYEE_PCT = 8;
export const SL_ETF_EMPLOYER_PCT = 3;

// The employer's total on-cost, as a fraction of gross pay: 0.15 when
// EPF/ETF applies, 0 otherwise (owner-operators, family labor, anyone not
// legally an EPF/ETF-covered employee).
export function employerOnCostPct(epfEtfApplicable: boolean): number {
  return epfEtfApplicable ? (SL_EPF_EMPLOYER_PCT + SL_ETF_EMPLOYER_PCT) / 100 : 0;
}

// What one pay period actually costs the business: gross pay plus the
// employer's EPF+ETF contribution on top of it. This — not the raw gross
// pay — is what should be booked as the payroll expense, since it's the
// real cash the business owes.
export function employerCostPerPeriod(payRate: number, epfEtfApplicable: boolean): number {
  return payRate * (1 + employerOnCostPct(epfEtfApplicable));
}

export function estimateNetPay(payRate: number, taxPct: number, epfEtfApplicable = false): number {
  const employeeEpf = epfEtfApplicable ? payRate * (SL_EPF_EMPLOYEE_PCT / 100) : 0;
  return payRate * (1 - taxPct / 100) - employeeEpf;
}

export function monthlyPayrollCost(employees: Employee[]): number {
  let total = 0;
  for (const e of employees) {
    if (!e.active) continue;
    total += monthlyNormalizedAmount(employerCostPerPeriod(e.payRate, e.epfEtfApplicable), e.payFrequency);
  }
  return total;
}

// The employer's EPF+ETF liability alone, monthly — the amount that must
// be remitted to the EPF/ETF funds each month, separate from what's paid
// out to staff. Surfaced on the Employees page so an owner can see the
// obligation, not just the blended payroll total.
export function monthlyEpfEtfLiability(employees: Employee[]): number {
  let total = 0;
  for (const e of employees) {
    if (!e.active || !e.epfEtfApplicable) continue;
    const employerShare = e.payRate * (employerOnCostPct(true));
    const employeeShare = e.payRate * (SL_EPF_EMPLOYEE_PCT / 100);
    total += monthlyNormalizedAmount(employerShare + employeeShare, e.payFrequency);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Loans / debt amortization. Standard fixed-payment monthly amortizing loan
// (the common shape for an SME bank/working-capital loan). First payment
// falls one month after startDate (the disbursement date).
//
// payment = P * r(1+r)^n / ((1+r)^n - 1), r = monthly rate, n = termMonths.
// Falls back to a straight-line split (P/n, no interest) when rate is 0.
// ---------------------------------------------------------------------------

export function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInTargetMonth);
  target.setUTCDate(day);
  return target.toISOString().slice(0, 10);
}

export interface LoanPayment {
  periodIndex: number; // 1-based
  date: string; // ISO date
  monthKey: string; // "YYYY-MM"
  payment: number;
  principal: number;
  interest: number;
  balance: number; // remaining balance after this payment
}

export function computeLoanSchedule(loan: Loan): LoanPayment[] {
  const n = Math.max(0, Math.round(loan.termMonths));
  if (n === 0 || loan.principal <= 0) return [];
  const r = loan.annualInterestRatePct / 100 / 12;

  const payment =
    r === 0
      ? loan.principal / n
      : (loan.principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const schedule: LoanPayment[] = [];
  let balance = loan.principal;
  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    let principal = payment - interest;
    if (i === n || principal > balance) principal = balance; // clear rounding drift on the final payment
    balance = Math.max(0, balance - principal);
    const date = addMonthsIso(loan.startDate, i);
    schedule.push({
      periodIndex: i,
      date,
      monthKey: date.slice(0, 7),
      payment: principal + interest,
      principal,
      interest,
      balance,
    });
  }
  return schedule;
}

export interface LoanSummary {
  monthlyPayment: number;
  totalInterest: number;
  totalPayments: number;
  payoffDate: string | null;
  currentBalance: number;
  principalPaidToDate: number;
  interestPaidToDate: number;
  percentPaid: number; // 0..100, by principal
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
}

export function computeLoanSummary(loan: Loan, asOfISO: string): LoanSummary {
  const schedule = computeLoanSchedule(loan);
  const monthlyPayment = schedule[0]?.payment ?? 0;
  const totalInterest = schedule.reduce((s, p) => s + p.interest, 0);
  const past = schedule.filter((p) => p.date <= asOfISO);
  const future = schedule.filter((p) => p.date > asOfISO);
  const principalPaidToDate = past.reduce((s, p) => s + p.principal, 0);
  const interestPaidToDate = past.reduce((s, p) => s + p.interest, 0);
  const currentBalance = past.length > 0 ? past[past.length - 1].balance : loan.principal;

  return {
    monthlyPayment,
    totalInterest,
    totalPayments: schedule.length,
    payoffDate: schedule.length > 0 ? schedule[schedule.length - 1].date : null,
    currentBalance,
    principalPaidToDate,
    interestPaidToDate,
    percentPaid: loan.principal > 0 ? (principalPaidToDate / loan.principal) * 100 : 0,
    nextPaymentDate: future[0]?.date ?? null,
    nextPaymentAmount: future[0]?.payment ?? null,
  };
}

export interface LoanMonthlyTotals {
  interest: number;
  principal: number;
  proceeds: number; // cash borrowed, booked in the disbursement month
  payment: number;
}

// Aggregates every loan's schedule (plus its disbursement) into per-month
// totals across the whole portfolio — this is what feeds interest expense
// into the Income Statement and principal/proceeds into the Cash Flow
// Statement, month by month.
export function computeLoanMonthlyTotals(loans: Loan[]): Map<string, LoanMonthlyTotals> {
  const map = new Map<string, LoanMonthlyTotals>();
  const bump = (key: string, delta: Partial<LoanMonthlyTotals>) => {
    const cur = map.get(key) ?? { interest: 0, principal: 0, proceeds: 0, payment: 0 };
    map.set(key, {
      interest: cur.interest + (delta.interest ?? 0),
      principal: cur.principal + (delta.principal ?? 0),
      proceeds: cur.proceeds + (delta.proceeds ?? 0),
      payment: cur.payment + (delta.payment ?? 0),
    });
  };
  for (const loan of loans) {
    bump(loan.startDate.slice(0, 7), { proceeds: loan.principal });
    for (const p of computeLoanSchedule(loan)) {
      bump(p.monthKey, { interest: p.interest, principal: p.principal, payment: p.payment });
    }
  }
  return map;
}

export interface LoanPortfolioSummary {
  loanCount: number;
  totalOutstanding: number; // sum of current balances, active loans only
  totalMonthlyPayment: number; // sum of monthly payment for loans not yet paid off
  totalPrincipalPaidToDate: number;
  totalInterestPaidToDate: number;
  totalOriginalPrincipal: number;
}

export function computeLoanPortfolio(loans: Loan[], asOfISO: string): LoanPortfolioSummary {
  let totalOutstanding = 0;
  let totalMonthlyPayment = 0;
  let totalPrincipalPaidToDate = 0;
  let totalInterestPaidToDate = 0;
  let totalOriginalPrincipal = 0;

  for (const loan of loans) {
    if (!loan.active) continue;
    const summary = computeLoanSummary(loan, asOfISO);
    totalOutstanding += summary.currentBalance;
    if (summary.currentBalance > 0) totalMonthlyPayment += summary.monthlyPayment;
    totalPrincipalPaidToDate += summary.principalPaidToDate;
    totalInterestPaidToDate += summary.interestPaidToDate;
    totalOriginalPrincipal += loan.principal;
  }

  return {
    loanCount: loans.filter((l) => l.active).length,
    totalOutstanding,
    totalMonthlyPayment,
    totalPrincipalPaidToDate,
    totalInterestPaidToDate,
    totalOriginalPrincipal,
  };
}

// The current (within-12-months) portion of loan principal — what standard
// accounting calls "current portion of long-term debt". A loan's full
// remaining balance sits in totalLiabilities on the Balance Sheet (correct:
// the business really does owe all of it), but only the slice actually
// due in the next 12 months belongs in "current liabilities" for a
// liquidity ratio — the rest is a longer-term obligation that doesn't
// compete with this year's cash. Computed off the same amortization
// schedule that drives interestExpense/principal in computeLoanMonthlyTotals,
// so it can't drift from what the rest of the app already shows for a loan.
export function computeCurrentPortionOfLoans(loans: Loan[], asOfISO: string): number {
  const twelveMonthsOut = addMonthsIso(asOfISO, 12);
  let total = 0;
  for (const loan of loans) {
    if (!loan.active) continue;
    for (const p of computeLoanSchedule(loan)) {
      if (p.date > asOfISO && p.date <= twelveMonthsOut) total += p.principal;
    }
  }
  return total;
}


// by product over an optional date range: units sold, revenue, cost behavior
// (COGS driven by what was actually paid to the supplier per WAC, vs. the
// selling price), gross/contribution margin, and what's still tied up as
// inventory. This is the "is THIS item actually worth selling" view, as
// opposed to the business-wide P&L.
// ---------------------------------------------------------------------------

export interface ProductProfitability {
  productId: string;
  name: string;
  sku: string;
  type: OfferingType;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null; // null when no revenue in range
  // Margin (profit ÷ price) and markup (profit ÷ cost) answer different
  // pricing questions and are easy to conflate — a 50% markup is only a
  // 33% margin, a mix-up that quietly erodes profit if someone prices off
  // the wrong one. Kept side by side rather than replacing margin with it.
  markupPct: number | null; // null when cogs is 0 (nothing to compute a markup against)
  avgSellingPrice: number;
  avgUnitCost: number;
  variableCost: number;
  contributionMargin: number;
  contributionMarginPct: number | null;
  qtyOnHand: number;
  inventoryValue: number;
  wac: number;
  // A rough pricing-power signal, not a rigorous market-structure model:
  // thin margins tend to mean a commoditized/price-competitive item (many
  // substitutes, buyers price-shop), fat margins tend to mean real
  // differentiation or low buyer price-sensitivity. Useful as a prompt to
  // ask "why", not a verdict.
  marginBand: "thin" | "moderate" | "healthy" | "strong" | "n/a";
  // Fully-loaded view: COGS plus the labor that went into delivering each
  // unit (Product.laborCostPerUnit), for offerings — usually services —
  // where the person doing the work is an employee whose pay already sits
  // in operating expenses rather than in a logged Purchase. Without this,
  // a service's COGS-only margin can look much better than it really is.
  laborCost: number;
  fullyLoadedCost: number; // avgUnitCost + laborCostPerUnit
  fullyLoadedGrossProfit: number; // grossProfit - laborCost
  fullyLoadedMarginPct: number | null;
  // Inventory aging — always computed off the FULL sales history for this
  // product, regardless of whatever dateFrom/dateTo range the rest of this
  // row is scoped to. Staleness is about "when did this last move", not
  // "did it move within whatever period I happen to be looking at" — a
  // product with zero sales in the selected 30-day window but a sale last
  // week isn't stale, so this deliberately ignores the range filter.
  lastSaleDate: string | null; // ISO date, null if never sold
  daysSinceLastSale: number | null; // null if never sold or no stock on hand
  agingValue: number; // inventoryValue if daysSinceLastSale >= 60 (or never sold with stock on hand), else 0
}

export function computeProductProfitability(
  products: Product[],
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  ledgers: Map<string, ProductLedgerResult>,
  dateFrom?: string,
  dateTo?: string
): ProductProfitability[] {
  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const inRange = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const todayIso = localIsoDate();
  const daysBetween = (from: string, to: string) =>
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000));

  return products.map((p) => {
    const productSales = sales.filter((s) => s.productId === p.id && inRange(s.date));

    // Full history, not range-scoped — see lastSaleDate/daysSinceLastSale comment.
    let lastSaleDate: string | null = null;
    for (const s of sales) {
      if (s.productId === p.id && (lastSaleDate === null || s.date > lastSaleDate)) lastSaleDate = s.date;
    }

    let revenue = 0;
    let cogs = 0;
    let variableCost = 0;
    let unitsSold = 0;
    for (const s of productSales) {
      const econ = economicsBySaleId.get(s.id);
      revenue += econ?.revenue ?? 0;
      cogs += econ?.cogs ?? 0;
      variableCost += econ?.variableCost ?? 0;
      unitsSold += s.qty;
    }
    const grossProfit = revenue - cogs;
    const contributionMargin = grossProfit - variableCost;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null;

    let marginBand: ProductProfitability["marginBand"] = "n/a";
    if (grossMarginPct !== null) {
      if (grossMarginPct < 10) marginBand = "thin";
      else if (grossMarginPct < 25) marginBand = "moderate";
      else if (grossMarginPct < 45) marginBand = "healthy";
      else marginBand = "strong";
    }

    const ledger = ledgers.get(p.id);
    const laborCost = (p.laborCostPerUnit ?? 0) * unitsSold;
    const fullyLoadedCost = (unitsSold > 0 ? cogs / unitsSold : ledger?.wac ?? 0) + (p.laborCostPerUnit ?? 0);
    const fullyLoadedGrossProfit = grossProfit - laborCost;
    const fullyLoadedMarginPct = revenue > 0 ? (fullyLoadedGrossProfit / revenue) * 100 : null;

    const qtyOnHand = ledger?.qtyOnHand ?? 0;
    const inventoryValue = ledger?.inventoryValue ?? 0;
    // Only meaningful for physical stock actually sitting on the shelf —
    // a service or a fully sold-through item has nothing "aging".
    const daysSinceLastSale =
      p.type === "product" && qtyOnHand > 0 ? (lastSaleDate ? daysBetween(lastSaleDate, todayIso) : null) : null;
    // Never sold at all but stock is on hand: treat as maximally stale, not
    // "no data" — that's the case most worth flagging, not the one to hide.
    const isStale =
      p.type === "product" && qtyOnHand > 0 && (lastSaleDate === null || (daysSinceLastSale ?? 0) >= 60);
    const agingValue = isStale ? inventoryValue : 0;

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      type: p.type,
      unitsSold,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct,
      markupPct: cogs > 0 ? (grossProfit / cogs) * 100 : null,
      avgSellingPrice: unitsSold > 0 ? revenue / unitsSold : 0,
      avgUnitCost: unitsSold > 0 ? cogs / unitsSold : ledger?.wac ?? 0,
      variableCost,
      contributionMargin,
      contributionMarginPct: revenue > 0 ? (contributionMargin / revenue) * 100 : null,
      qtyOnHand,
      inventoryValue,
      wac: ledger?.wac ?? 0,
      marginBand,
      laborCost,
      fullyLoadedCost,
      fullyLoadedGrossProfit,
      fullyLoadedMarginPct,
      lastSaleDate,
      daysSinceLastSale,
      agingValue,
    };
  });
}

// ---------------------------------------------------------------------------
// Customer-level profitability. Same idea as product profitability, grouped
// by customer instead: which customers are actually worth the volume, since
// a customer with huge revenue can easily be thinner-margin than one buying
// far less (bulk buyers negotiate price down; small recurring buyers often
// don't). Sales with no customer name (walk-in/unspecified) are pooled
// together rather than dropped, so the totals still reconcile against the
// product-level view.
// ---------------------------------------------------------------------------

export interface CustomerProfitability {
  customer: string; // "Walk-in / unspecified" when the sale had no customer name
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  variableCost: number;
  contributionMargin: number;
  contributionMarginPct: number | null;
  avgOrderValue: number;
  lastSaleDate: string | null;
}

const UNSPECIFIED_CUSTOMER = "Walk-in / unspecified";

export function computeCustomerProfitability(
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  dateFrom?: string,
  dateTo?: string
): CustomerProfitability[] {
  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const inRange = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  type Acc = {
    ordersCount: number;
    unitsSold: number;
    revenue: number;
    cogs: number;
    variableCost: number;
    lastSaleDate: string | null;
  };
  const byCustomer = new Map<string, Acc>();

  for (const s of sales) {
    if (!inRange(s.date)) continue;
    const name = s.customer?.trim() || UNSPECIFIED_CUSTOMER;
    const econ = economicsBySaleId.get(s.id);
    const acc = byCustomer.get(name) ?? {
      ordersCount: 0,
      unitsSold: 0,
      revenue: 0,
      cogs: 0,
      variableCost: 0,
      lastSaleDate: null,
    };
    acc.ordersCount += 1;
    acc.unitsSold += s.qty;
    acc.revenue += econ?.revenue ?? 0;
    acc.cogs += econ?.cogs ?? 0;
    acc.variableCost += econ?.variableCost ?? 0;
    if (acc.lastSaleDate === null || s.date > acc.lastSaleDate) acc.lastSaleDate = s.date;
    byCustomer.set(name, acc);
  }

  return Array.from(byCustomer.entries()).map(([customer, acc]) => {
    const grossProfit = acc.revenue - acc.cogs;
    const contributionMargin = grossProfit - acc.variableCost;
    return {
      customer,
      ordersCount: acc.ordersCount,
      unitsSold: acc.unitsSold,
      revenue: acc.revenue,
      cogs: acc.cogs,
      grossProfit,
      grossMarginPct: acc.revenue > 0 ? (grossProfit / acc.revenue) * 100 : null,
      variableCost: acc.variableCost,
      contributionMargin,
      contributionMarginPct: acc.revenue > 0 ? (contributionMargin / acc.revenue) * 100 : null,
      avgOrderValue: acc.ordersCount > 0 ? acc.revenue / acc.ordersCount : 0,
      lastSaleDate: acc.lastSaleDate,
    };
  });
}

// ---------------------------------------------------------------------------
// Survival number: break-even that also pays the owner. computeBreakEven
// above covers the business's own costs, but an owner-run SME also has to
// fund the owner's living costs, and those never appear as an expense (money
// taken out is a withdrawal, not a cost of doing business). So this adds
// what the owner has ACTUALLY been taking out — the average of recorded
// "withdrawal" capital entries over the trailing window — rather than asking
// for a made-up "personal costs" figure. Returns null when no withdrawals
// were recorded in the window, so the UI can stay silent for anyone who
// doesn't track them instead of showing a survival number equal to break-even.
// ---------------------------------------------------------------------------

export interface SurvivalNumber {
  monthlyFixedCosts: number;
  avgMonthlyWithdrawals: number;
  survivalNumber: number; // monthly cash needed: business costs + owner's take
  survivalRevenue: number; // monthly sales needed to fund that at the current margin (Infinity if margin <= 0)
  windowMonths: number;
}

export function computeSurvivalNumber(
  breakEven: BreakEvenResult,
  capitalEntries: CapitalEntry[],
  asOfISO: string,
  windowMonths = 3
): SurvivalNumber | null {
  const end = new Date(asOfISO + "T00:00:00Z");
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - windowMonths);
  const startISO = start.toISOString().slice(0, 10);
  const total = capitalEntries
    .filter((c) => c.kind === "withdrawal" && !isPoolEntry(c) && c.date > startISO && c.date <= asOfISO)
    .reduce((sum, c) => sum + c.amount, 0);
  if (total <= 0) return null;
  const avgMonthlyWithdrawals = total / windowMonths;
  const survivalNumber = breakEven.monthlyFixedCosts + avgMonthlyWithdrawals;
  const survivalRevenue =
    breakEven.contributionMarginRatio > 0 ? survivalNumber / breakEven.contributionMarginRatio : Infinity;
  return { monthlyFixedCosts: breakEven.monthlyFixedCosts, avgMonthlyWithdrawals, survivalNumber, survivalRevenue, windowMonths };
}

// ---------------------------------------------------------------------------
// Profitability by Location — same shape as computeCustomerProfitability
// just above, grouped by branch instead of customer. Revenue/COGS/margin
// come straight from the existing per-sale SaleEconomics, which is itself
// costed off one business-wide WAC per product (see computeProductLedger's
// doc comment) — there's no separate per-location costing engine here, just
// a different grouping key on numbers that already exist. A record with no
// locationId (pre-multi-location data) resolves to the default Location via
// resolveLocationId, the same rule computeLocationStockLevels uses, so this
// reads correctly for a business that only just turned Locations on.
//
// Every ACTIVE location is included even with zero activity in range (a
// branch that sold nothing this period is real information, not something
// to hide by omission) — the one deliberate difference from
// computeCustomerProfitability, where the customer list is unbounded so
// can't be pre-seeded the same way.
//
// directOneOffCosts and recurringMonthlyCosts are kept separate from
// contributionMargin rather than netted into one "location profit" number:
// directOneOffCosts is a real date-ranged sum (same basis as revenue/COGS,
// safe to combine — see contributionAfterDirectCosts), but
// recurringMonthlyCosts is a normalized MONTHLY run-rate snapshot (same
// idea as computeMRR above, "active as of" rather than "summed over the
// range"). Subtracting a monthly snapshot from a 90-day or all-time total
// would silently misstate the result for any period that isn't exactly one
// month, so it's surfaced as its own number instead. Shared/untagged
// overhead (rent with no Location set, a generic subscription, the owner's
// own costs) is never allocated across locations by guesswork — same
// principle as the deliberately-not-built statistical/allocation features
// noted in CHANGELOG.md: a wrong allocation would look exactly as
// confident as a right one.
// ---------------------------------------------------------------------------

export interface LocationProfitability {
  locationId: string;
  locationName: string;
  isDefault: boolean;
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  variableCost: number;
  contributionMargin: number;
  contributionMarginPct: number | null;
  avgOrderValue: number;
  // $ of inventory received into this location in range (qty × unitCost of
  // Purchases resolved here) — context on cash/stock movement, never
  // subtracted from anything above (COGS already comes from the sale side).
  purchasesValue: number;
  // One-off Expenses (kind "expense", isRecurring false) explicitly tagged
  // Expense.locationId to this location, dated in range.
  directOneOffCosts: number;
  contributionAfterDirectCosts: number;
  // Normalized monthly total of active recurring Expenses tagged to this
  // location, as of dateTo (or today if dateTo is unset) — a run-rate
  // snapshot, not part of the ranged total above. See doc comment.
  recurringMonthlyCosts: number;
  lastSaleDate: string | null;
}

export function computeLocationProfitability(
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  purchases: Purchase[],
  expenses: Expense[],
  locations: Location[],
  dateFrom?: string,
  dateTo?: string
): LocationProfitability[] {
  const activeLocations = locations.filter((l) => l.active);
  if (activeLocations.length === 0) return [];

  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const inRange = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  const asOf = dateTo ?? localIsoDate();

  type Acc = {
    ordersCount: number;
    unitsSold: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    variableCost: number;
    contributionMargin: number;
    purchasesValue: number;
    directOneOffCosts: number;
    lastSaleDate: string | null;
  };
  const blank = (): Acc => ({
    ordersCount: 0,
    unitsSold: 0,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    variableCost: 0,
    contributionMargin: 0,
    purchasesValue: 0,
    directOneOffCosts: 0,
    lastSaleDate: null,
  });

  const byLocation = new Map<string, Acc>();
  for (const l of activeLocations) byLocation.set(l.id, blank());
  const accFor = (locId: string): Acc => {
    const existing = byLocation.get(locId);
    if (existing) return existing;
    const fresh = blank();
    byLocation.set(locId, fresh);
    return fresh;
  };

  for (const s of sales) {
    if (!inRange(s.date)) continue;
    const acc = accFor(resolveLocationId(s.locationId, locations));
    const econ = economicsBySaleId.get(s.id);
    acc.ordersCount += 1;
    acc.unitsSold += s.qty;
    acc.revenue += econ?.revenue ?? 0;
    acc.cogs += econ?.cogs ?? 0;
    // Summed from the per-sale figures rather than re-derived as
    // revenue - cogs, so a variable cost tagged includeInCogs (outbound
    // shipping) lands in Gross Profit here exactly as it does on the P&L —
    // this section then ties out to the business-wide numbers.
    acc.grossProfit += econ?.grossProfit ?? 0;
    acc.variableCost += econ?.variableCost ?? 0;
    acc.contributionMargin += econ?.contributionMargin ?? 0;
    if (acc.lastSaleDate === null || s.date > acc.lastSaleDate) acc.lastSaleDate = s.date;
  }

  for (const p of purchases) {
    if (!inRange(p.date)) continue;
    accFor(resolveLocationId(p.locationId, locations)).purchasesValue += p.qty * p.unitCost;
  }

  const recurringByLocation = new Map<string, number>();
  for (const e of expenses) {
    if (e.kind !== "expense" || !e.locationId) continue; // untagged = shared overhead, never allocated
    if (e.isRecurring) {
      const started = e.startDate <= asOf;
      const notEnded = !e.endDate || e.endDate >= asOf;
      if (started && notEnded) {
        const locId = resolveLocationId(e.locationId, locations);
        recurringByLocation.set(locId, (recurringByLocation.get(locId) ?? 0) + monthlyNormalizedAmount(e.amount, e.recurrence));
      }
    } else if (inRange(e.startDate)) {
      accFor(resolveLocationId(e.locationId, locations)).directOneOffCosts += e.amount;
    }
  }

  return Array.from(byLocation.entries()).map(([locationId, acc]) => {
    const loc = locations.find((l) => l.id === locationId);
    const { grossProfit, contributionMargin } = acc;
    return {
      locationId,
      locationName: loc?.name ?? "Unassigned",
      isDefault: !!loc?.isDefault,
      ordersCount: acc.ordersCount,
      unitsSold: acc.unitsSold,
      revenue: acc.revenue,
      cogs: acc.cogs,
      grossProfit,
      grossMarginPct: acc.revenue > 0 ? (grossProfit / acc.revenue) * 100 : null,
      variableCost: acc.variableCost,
      contributionMargin,
      contributionMarginPct: acc.revenue > 0 ? (contributionMargin / acc.revenue) * 100 : null,
      avgOrderValue: acc.ordersCount > 0 ? acc.revenue / acc.ordersCount : 0,
      purchasesValue: acc.purchasesValue,
      directOneOffCosts: acc.directOneOffCosts,
      contributionAfterDirectCosts: contributionMargin - acc.directOneOffCosts,
      recurringMonthlyCosts: recurringByLocation.get(locationId) ?? 0,
      lastSaleDate: acc.lastSaleDate,
    };
  });
}

// ---------------------------------------------------------------------------
// Balance Sheet, as of a given date (defaults to today — this build doesn't
// reconstruct historical inventory/cash snapshots for a past date, since
// that needs full point-in-time WAC replay; "as of today" is what an SME
// actually checks day to day).
//
// Cash is derived, not stored: it's the cumulative net cash flow (operating
// + financing) across every month up to `asOf`, using the same cash-basis
// fields computeMonthlyPnL already produces. This keeps Assets = Liabilities
// + Equity true by construction — nothing here is separately hand-entered.
// ---------------------------------------------------------------------------

export interface BalanceSheet {
  asOf: string;
  cash: number;
  accountsReceivable: number; // outstanding credit sales not yet collected — a real asset, omitted before this fix
  inventoryValue: number;
  fixedAssetsNetBookValue: number;
  investmentsValue: number; // securities at market value (cost until priced)
  loansLentValue: number; // money lent out that borrowers still owe: principal only, interest counts once received
  supplierCredit: number; // credit suppliers hold for you (returns kept as credit, deposits), not yet used or refunded
  totalAssets: number;
  customerDeposits: number; // liability: money customers paid in advance that you have not yet delivered against or refunded
  loansPayable: number;
  accountsPayable: number; // outstanding credit purchases not yet paid — a real liability, omitted before this fix
  accruedLiabilities: number; // v209: costs incurred and not yet billed (lib/accruals.ts)
  // Cumulative sales tax collected (output tax) minus reclaimable tax paid
  // (input tax) since inception — see the FIX note on MonthlyPnL's
  // cashSalesRevenue/outputTax/inputTax for why this exists: once cash
  // correctly includes the tax-inclusive amount a customer actually pays,
  // something has to sit on the other side of the balance sheet for that
  // extra cash, since it was never revenue. This is that liability.
  // Net of taxRemittedToDate below (self-reported TaxPayment records), so
  // this is now a real "what the ledger thinks you currently owe" figure
  // for a business that logs its remittances here — not just cumulative
  // activity since inception. It's still only as accurate as those entries:
  // this app doesn't file anything with, or verify anything against, any
  // tax authority — a missed or late-entered remittance will make this
  // line run ahead of what's actually still owed until it's logged.
  salesTaxPayable: number;
  // Cumulative TaxPayment amount recorded on or before `asOf` — the actual
  // deduction that turns raw output-minus-input tax activity into the
  // salesTaxPayable figure above. Surfaced separately so the Statements
  // page can show "activity" vs. "remitted" vs. "still owed" as three
  // distinct numbers instead of collapsing straight to one.
  taxRemittedToDate: number;
  totalLiabilities: number;
  ownersCapital: number; // net capital contributed (investment + reinvestment - withdrawals)
  retainedEarnings: number; // cumulative net profit after tax, all time
  unrealizedInvestmentGain: number; // market value of securities minus their cost: equity until sold
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balances: boolean; // sanity check — should always be true within rounding
}

// Net owner's capital represented by opening balances: what customers already
// owed the business minus what it already owed suppliers, at the original
// amounts. Feeds computeBalanceSheet's `openingEquity`.
export function computeOpeningEquity(openingBalances: OpeningBalance[]): number {
  let total = 0;
  for (const ob of openingBalances) total += ob.kind === "receivable" ? ob.amount : -ob.amount;
  return total;
}

export function computeBalanceSheet(
  monthlyPnL: MonthlyPnL[],
  inventoryValue: number,
  loans: Loan[],
  capitalSummary: CapitalSummary,
  asOfISO: string,
  fixedAssets: FixedAsset[] = [],
  // Outstanding accounts receivable / payable as of asOfISO (pass
  // receivablesAging.totalOutstanding / payablesAging.totalOutstanding).
  // FIX: a credit sale immediately recognizes revenue into retainedEarnings
  // (via monthlyPnL's accrual salesRevenue) but only moves `cash` once it's
  // actually collected — so until it's collected, the asset side of the
  // balance sheet was missing the receivable entirely, understating total
  // assets relative to equity. Symmetrically, a credit purchase adds to
  // inventoryValue immediately (goods received) but was never recorded as a
  // liability, overstating assets relative to liabilities+equity. Any
  // business using credit sales or credit purchases — a first-class,
  // explicitly supported feature of this app (dueDate, creditTermDays,
  // aging reports) — would see `balances: false` and materially wrong
  // asset/liability totals without these two lines.
  accountsReceivable = 0,
  accountsPayable = 0,
  // Self-reported payments to the tax authority (see the TaxPayment doc
  // comment in lib/types.ts). Filtered to on-or-before `asOfISO` here, the
  // same "as of this date" treatment every other liability on this
  // statement gets.
  taxPayments: TaxPayment[] = [],
  // Owner's capital that came in as receivables/payables rather than cash: the
  // sum of opening receivables minus the sum of opening payables (ORIGINAL
  // amounts, not what is still outstanding — collecting one later moves value
  // from receivables to cash, it never changes equity). See
  // computeOpeningEquity and OpeningBalance in lib/types.ts.
  openingEquity = 0,
  // Securities held at asOfISO: cost basis and market value from computeInvestmentPortfolio. The cost
  // side is already in cash and retained earnings through the monthly P&L; the market-value side is
  // the asset, and the gap between them is the unrealised gain in equity.
  investments: { costBasis: number; marketValue: number } = { costBasis: 0, marketValue: 0 },
  // Principal still owed to the business on money it has lent out (computeLendingPortfolio(...).principalOutstanding).
  // Lending out moved cash into this asset and collections move it back, so cash and retained earnings already
  // carry the other side through the monthly P&L.
  loansLentValue = 0,
  // Credit suppliers hold for the business (computeSupplierCredit(...).total): returns kept as credit and deposits, less
  // what has been used on bills or refunded. An asset. The other side is already in the books: stock that left on the
  // return, or cash that went out as the deposit, and a credit used on a bill came off accounts payable.
  supplierCredit = 0,
  // Money customers paid in advance and have not yet used or had refunded (computeCustomerDeposits(...).total). A
  // liability: the cash is already in `cash` through the monthly cash flow, and revenue is not booked until a sale
  // is made and the deposit applied to it, so this is the other side of that cash.
  customerDeposits = 0,
  // v209: accrued liabilities as of asOfISO (accruedLiabilityAsOf): costs owed for months already incurred, not yet billed
  accruedLiabilities = 0
): BalanceSheet {
  const toDate = monthlyPnL.filter((m) => m.month <= asOfISO.slice(0, 7));
  const retainedEarnings = toDate.reduce((s, m) => s + m.netProfitAfterTax, 0);
  const taxRemittedToDate = taxPayments
    .filter((t) => t.date <= asOfISO)
    .reduce((s, t) => s + t.amount, 0);
  // A tax remittance is real cash out (asset down) against the same-sized
  // reduction in salesTaxPayable (liability down) below — equity untouched.
  // Netting it out of `cash` here, rather than leaving it only in the
  // liability, is what keeps `balances` holding once remittances are
  // logged, instead of quietly reintroducing the exact mismatch this
  // feature was built to close.
  const cash = toDate.reduce((s, m) => s + m.netCashFlow, 0) - taxRemittedToDate;
  const salesTaxPayable = toDate.reduce((s, m) => s + m.outputTax - m.inputTax, 0) - taxRemittedToDate;

  const loansPayable = loans
    .filter((l) => l.active)
    .reduce((s, l) => s + computeLoanSummary(l, asOfISO).currentBalance, 0);

  // Only assets still held as of this date — a disposed asset's book value
  // left the books (and its cash/gain-loss are already folded into `cash`
  // and `retainedEarnings` above via investingCashFlow/disposalGainLoss).
  const fixedAssetsNetBookValue = fixedAssets
    .filter((a) => !a.disposalDate || a.disposalDate > asOfISO)
    .reduce((s, a) => s + computeFixedAssetStatus(a, asOfISO).netBookValue, 0);

  const investmentsValue = investments.marketValue;
  const unrealizedInvestmentGain = investments.marketValue - investments.costBasis;
  const totalAssets = cash + accountsReceivable + inventoryValue + fixedAssetsNetBookValue + investmentsValue + loansLentValue + supplierCredit;
  const totalLiabilities = loansPayable + accountsPayable + salesTaxPayable + customerDeposits + accruedLiabilities;
  const ownersCapital = capitalSummary.netCapitalIn + openingEquity;
  const totalEquity = ownersCapital + retainedEarnings + unrealizedInvestmentGain;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    asOf: asOfISO,
    cash,
    accountsReceivable,
    inventoryValue,
    fixedAssetsNetBookValue,
    investmentsValue,
    loansLentValue,
    supplierCredit,
    totalAssets,
    customerDeposits,
    loansPayable,
    accountsPayable,
    accruedLiabilities,
    salesTaxPayable,
    taxRemittedToDate,
    totalLiabilities,
    ownersCapital,
    retainedEarnings,
    unrealizedInvestmentGain,
    totalEquity,
    totalLiabilitiesAndEquity,
    balances: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1,
  };
}

// ---------------------------------------------------------------------------
// Accounts receivable aging. A credit sale is money you've already booked as
// revenue but haven't actually collected — this buckets every still-open
// credit sale by how overdue it is, which is what "90-day receivables" in
// the Sri Lankan SME sense actually means day to day: not a policy, a list
// of specific customers who owe specific amounts, some of them for longer
// than they should.
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

export type ReceivableBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

// One underlying Sale within a ReceivableLine. A standalone credit sale
// produces a ReceivableLine with exactly one of these; a multi-item invoice
// (several Sale rows sharing Sale.invoiceId) produces one per line item, so
// printing and payment allocation can still see/settle each product line.
export interface ReceivableLineItem {
  saleId: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  taxAmount: number; // sales tax on this line, base currency — 0 when untaxed (see Sale.taxAmount)
  amountDue: number; // what's actually owed for this line, TAX INCLUDED
  amountPaid: number;
  amountWrittenOff: number; // bad debt recognized against this line — see ReceivableWriteOff
  amountOutstanding: number; // amountDue - amountPaid - amountWrittenOff
}

export interface ReceivableLine {
  // Kept as the single representative id (first underlying sale) so every
  // existing consumer that keys off `saleId` — payment forms, print
  // handlers, React list keys — keeps working unchanged for the common
  // one-line case. Use `saleIds`/`items` for anything that needs to see or
  // settle every underlying line of a grouped invoice.
  saleId: string;
  saleIds: string[];
  invoiceId?: string; // set only when this line groups multiple Sale rows
  invoiceNo?: string; // the sequential invoice number from the primary sale, when it has one (v321)
  supplyDate?: string; // the date of supply from the primary sale, when set (v326)
  items: ReceivableLineItem[];
  productId: string; // first line item's product — kept for backward compat
  productName: string; // product name, or "N items" once grouped
  customer: string;
  customerContact?: string;
  date: string; // sale date (earliest, for a group)
  dueDate: string; // due date (earliest, for a group)
  amountDue: number; // full invoice value, TAX INCLUDED
  taxAmount: number; // sales tax portion of amountDue, base currency — 0 when untaxed
  amountPaid: number;
  amountWrittenOff: number; // bad debt recognized against this invoice — see ReceivableWriteOff
  amountOutstanding: number; // amountDue - amountPaid - amountWrittenOff
  daysOverdue: number; // negative = not yet due
  bucket: ReceivableBucket;
  createdByName?: string;
  isOpeningBalance?: boolean; // true for a line built from an OpeningBalance, not a Sale
}

export interface ReceivablesAging {
  asOf: string;
  totalOutstanding: number;
  byBucket: Record<ReceivableBucket, number>;
  lines: ReceivableLine[];
}

// Groups a list of Sales by shared Sale.invoiceId — a sale with no
// invoiceId is its own singleton group. Used anywhere a page needs to
// display/print "one invoice" rather than "one sale row", independent of
// whether that invoice still has a balance owing (computeReceivablesAging
// only ever returns outstanding ones).
export interface SaleInvoiceGroup {
  invoiceId?: string;
  primary: Sale; // earliest-created sale in the group — carries customer/date/etc for the group
  sales: Sale[]; // every sale in the group, earliest first
}

export function groupSalesByInvoice(sales: Sale[]): SaleInvoiceGroup[] {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const key = s.invoiceId ?? s.id;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    return { invoiceId: sorted[0].invoiceId, primary: sorted[0], sales: sorted };
  });
}

export function computeReceivablesAging(
  products: Product[],
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  payments: ReceivablePayment[],
  asOfISO: string,
  writeOffs: ReceivableWriteOff[] = [],
  // Money customers already owed on the day the owner started using the app
  // (see OpeningBalance in lib/types.ts). Each becomes its own single-item
  // line, keyed by the opening balance's id in the `saleId` slot so the
  // existing payment / write-off / reminder paths work on it unchanged.
  openingBalances: OpeningBalance[] = [],
  // Customer deposits (lib/customerDeposits.ts). Only the "applied" rows matter here: each settles part of an
  // invoice line like a payment would, but no cash moves (it came in when the deposit was received).
  customerDeposits: CustomerDepositEntry[] = []
): ReceivablesAging {
  const productById = new Map(products.map((p) => [p.id, p]));
  const econBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const paidBySale = new Map<string, number>();
  for (const p of payments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) ?? 0) + p.amount);
  for (const a of depositApplications(customerDeposits)) paidBySale.set(a.saleId, (paidBySale.get(a.saleId) ?? 0) + a.amount);
  const writtenOffBySale = new Map<string, number>();
  for (const w of writeOffs) writtenOffBySale.set(w.saleId, (writtenOffBySale.get(w.saleId) ?? 0) + w.amount);

  // Group credit sales by invoiceId — a sale without one is its own
  // singleton group (keyed by its own id), so an ordinary one-line sale
  // produces exactly the same ReceivableLine it always has.
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    if (s.paymentMethod !== "credit") continue;
    const key = s.invoiceId ?? s.id;
    const group = groups.get(key);
    if (group) group.push(s);
    else groups.set(key, [s]);
  }

  const lines: ReceivableLine[] = [];
  for (const group of groups.values()) {
    // Earliest-created sale first, so `saleId`/date/customer for the group
    // consistently reflect how the invoice was originally entered.
    const groupSales = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const items: ReceivableLineItem[] = groupSales.map((s) => {
      const subtotal = econBySaleId.get(s.id)?.revenue ?? s.qty * s.unitPrice;
      const taxAmount = s.taxAmount ?? 0;
      const amountDue = subtotal + taxAmount; // tax is money owed too, not just revenue
      const amountPaid = paidBySale.get(s.id) ?? 0;
      const amountWrittenOff = writtenOffBySale.get(s.id) ?? 0;
      return {
        saleId: s.id,
        productId: s.productId,
        productName: productById.get(s.productId)?.name ?? "—",
        qty: s.qty,
        unitPrice: s.unitPrice,
        taxAmount,
        amountDue,
        amountPaid,
        amountWrittenOff,
        amountOutstanding: amountDue - amountPaid - amountWrittenOff,
      };
    });
    const amountDue = items.reduce((sum, i) => sum + i.amountDue, 0);
    const taxAmount = items.reduce((sum, i) => sum + i.taxAmount, 0);
    const amountPaid = items.reduce((sum, i) => sum + i.amountPaid, 0);
    const amountWrittenOff = items.reduce((sum, i) => sum + i.amountWrittenOff, 0);
    const amountOutstanding = amountDue - amountPaid - amountWrittenOff;
    if (amountOutstanding <= 0.005) continue; // fully collected and/or written off

    const primary = groupSales[0];
    const dueDate = groupSales.map((s) => s.dueDate ?? s.date).sort()[0];
    const daysOverdue = daysBetween(dueDate, asOfISO);
    let bucket: ReceivableBucket = "current";
    if (daysOverdue > 90) bucket = "90+";
    else if (daysOverdue > 60) bucket = "61-90";
    else if (daysOverdue > 30) bucket = "31-60";
    else if (daysOverdue > 0) bucket = "1-30";

    lines.push({
      saleId: primary.id,
      saleIds: groupSales.map((s) => s.id),
      invoiceId: primary.invoiceId,
      invoiceNo: primary.invoiceNo,
      supplyDate: primary.supplyDate,
      items,
      productId: primary.productId,
      productName: items.length > 1 ? `${items.length} items` : items[0].productName,
      customer: primary.customer ?? "Unnamed customer",
      customerContact: primary.customerContact,
      date: groupSales.map((s) => s.date).sort()[0],
      dueDate,
      amountDue,
      taxAmount,
      amountPaid,
      amountWrittenOff,
      amountOutstanding,
      daysOverdue,
      bucket,
      createdByName: primary.createdByName,
    });
  }
  for (const ob of openingBalances) {
    if (ob.kind !== "receivable") continue;
    const amountPaid = paidBySale.get(ob.id) ?? 0;
    const amountWrittenOff = writtenOffBySale.get(ob.id) ?? 0;
    const amountOutstanding = ob.amount - amountPaid - amountWrittenOff;
    if (amountOutstanding <= 0.005) continue; // fully collected and/or written off
    const dueDate = ob.dueDate || ob.date;
    const daysOverdue = daysBetween(dueDate, asOfISO);
    let bucket: ReceivableBucket = "current";
    if (daysOverdue > 90) bucket = "90+";
    else if (daysOverdue > 60) bucket = "61-90";
    else if (daysOverdue > 30) bucket = "31-60";
    else if (daysOverdue > 0) bucket = "1-30";
    lines.push({
      saleId: ob.id,
      saleIds: [ob.id],
      items: [
        {
          saleId: ob.id,
          productId: "",
          productName: "Opening balance",
          qty: 1,
          unitPrice: ob.amount,
          taxAmount: 0,
          amountDue: ob.amount,
          amountPaid,
          amountWrittenOff,
          amountOutstanding,
        },
      ],
      productId: "",
      productName: ob.note?.trim() ? `Opening balance · ${ob.note.trim()}` : "Opening balance",
      customer: ob.party || "Unnamed customer",
      customerContact: ob.contact,
      date: ob.date,
      dueDate,
      amountDue: ob.amount,
      taxAmount: 0,
      amountPaid,
      amountWrittenOff,
      amountOutstanding,
      daysOverdue,
      bucket,
      createdByName: ob.createdByName,
      isOpeningBalance: true,
    });
  }
  lines.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const byBucket: Record<ReceivableBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let totalOutstanding = 0;
  for (const l of lines) {
    byBucket[l.bucket] += l.amountOutstanding;
    totalOutstanding += l.amountOutstanding;
  }

  return { asOf: asOfISO, totalOutstanding, byBucket, lines };
}

// Customer credit-limit check — advisory only (see Customer.creditLimit).
// Keyed by lowercased/trimmed customer name, the same name-matching pattern
// used everywhere else a Customer directory entry is tied to Sale.customer
// (a free-text field, not a foreign key). Only customers with a limit set
// appear in the map at all, so callers can treat "not in the map" as "no
// limit tracked" without a separate null check.
export interface CustomerCreditStatus {
  creditLimit: number;
  outstanding: number; // from receivablesAging — what they currently owe, across all open credit sales
  overBy: number; // max(0, outstanding - creditLimit)
}

export function computeCustomerCreditStatus(
  customers: Customer[],
  receivablesAging: ReceivablesAging
): Map<string, CustomerCreditStatus> {
  const key = (name: string) => name.trim().toLowerCase();
  const outstandingByName = new Map<string, number>();
  for (const line of receivablesAging.lines) {
    const k = key(line.customer);
    outstandingByName.set(k, (outstandingByName.get(k) ?? 0) + line.amountOutstanding);
  }
  const result = new Map<string, CustomerCreditStatus>();
  for (const c of customers) {
    if (!c.creditLimit || c.creditLimit <= 0) continue;
    const outstanding = outstandingByName.get(key(c.name)) ?? 0;
    // Two directory entries can share a name (the sale form's auto-add and a
    // manual add can both create one). Sales match customers by name, so they
    // are one customer here: the stricter limit wins, not whichever loads last.
    const existing = result.get(key(c.name));
    const creditLimit = existing ? Math.min(existing.creditLimit, c.creditLimit) : c.creditLimit;
    result.set(key(c.name), {
      creditLimit,
      outstanding,
      overBy: Math.max(0, outstanding - creditLimit),
    });
  }
  return result;
}

// A customer's credit limit looked up straight from the directory, with no
// balance attached. For Staff, whose own data can't show what a customer owes
// across everyone's sales, so all they can honestly be told is that a limit
// exists. Same name matching (and stricter-limit rule) as the status map.
export function creditLimitFor(customers: Customer[], name: string): number | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  const limits = customers
    .filter((c) => c.name.trim().toLowerCase() === key && c.creditLimit && c.creditLimit > 0)
    .map((c) => c.creditLimit as number);
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

// What a customer's balance would be if `newTotal` (tax included) were added
// on credit — the number every credit-limit warning is built from.
//
// When an EXISTING credit sale is being edited, that sale's own unpaid balance
// is already inside `status.outstanding`, so adding the full new total on top
// would count it twice (a false "over limit"). `existing` describes the sale
// being replaced: what it still owes now, how much of it is already settled
// (paid + written off), and whether the customer name is unchanged (if the
// name was changed, its old balance was never in this customer's total).
export function projectCreditExposure(
  status: CustomerCreditStatus | undefined,
  newTotal: number,
  existing?: { outstandingNow: number; settled: number; sameCustomer: boolean }
): { projectedOutstanding: number; overBy: number } | null {
  if (!status) return null;
  const base = Math.max(0, status.outstanding - (existing?.sameCustomer ? existing.outstandingNow : 0));
  const addition = Math.max(0, newTotal - (existing?.settled ?? 0));
  const projectedOutstanding = base + addition;
  return { projectedOutstanding, overBy: Math.max(0, projectedOutstanding - status.creditLimit) };
}

// Where an existing sale currently stands in the receivables book — the
// `existing` argument for projectCreditExposure. A fully-collected sale has no
// aging line (outstandingNow 0) but may still have settled money against it.
export function existingSaleCreditPosition(
  saleId: string,
  aging: ReceivablesAging,
  payments: ReceivablePayment[],
  writeOffs: ReceivableWriteOff[] = []
): { outstandingNow: number; settled: number } {
  let outstandingNow = 0;
  for (const line of aging.lines) {
    const item = line.items.find((i) => i.saleId === saleId);
    if (item) {
      outstandingNow = item.amountOutstanding;
      break;
    }
  }
  const settled =
    payments.filter((p) => p.saleId === saleId).reduce((s, p) => s + p.amount, 0) +
    writeOffs.filter((w) => w.saleId === saleId).reduce((s, w) => s + w.amount, 0);
  return { outstandingNow, settled };
}

// Payable aging — mirrors receivables aging but for supplier credit purchases
export type PayableBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface PayableLine {
  purchaseId: string;
  productId: string;
  productName: string;
  supplier: string;
  date: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  // Knocked off this bill by goods sent back (SupplierReturn with settlement
  // "reduce_payable"), tax included. Not cash — nothing was paid — but it is
  // no longer owed, so amountOutstanding = amountDue - amountPaid - amountCredited.
  amountCredited: number;
  amountOutstanding: number;
  daysOverdue: number;
  bucket: PayableBucket;
  isOpeningBalance?: boolean; // true for a line built from an OpeningBalance, not a Purchase
}

export interface PayablesAging {
  asOf: string;
  totalOutstanding: number;
  byBucket: Record<PayableBucket, number>;
  lines: PayableLine[];
}

export function computePayablesAging(
  products: Product[],
  purchases: Purchase[],
  payments: PayablePayment[],
  asOfISO: string,
  // What the business already owed suppliers on the day it started using the
  // app (see OpeningBalance in lib/types.ts). Keyed by the opening balance's
  // id in the `purchaseId` slot, so RecordPayablePaymentForm works unchanged.
  openingBalances: OpeningBalance[] = [],
  // Goods sent back to suppliers. Only the ones settled as "reduce_payable"
  // matter here; a "refund" is cash coming in and leaves the bill as it was.
  supplierReturns: SupplierReturn[] = [],
  // Supplier credit used against bills ("applied" entries). Like a reduce_payable return it is not cash, but the
  // amount is no longer owed. Other entry kinds are ignored here.
  supplierCredits: SupplierCreditEntry[] = []
): PayablesAging {
  const productById = new Map(products.map((p) => [p.id, p]));
  const paidByPurchase = new Map<string, number>();
  for (const p of payments) paidByPurchase.set(p.purchaseId, (paidByPurchase.get(p.purchaseId) ?? 0) + p.amount);
  const creditedByPurchase = new Map<string, number>();
  for (const r of supplierReturns) {
    if (r.settlement !== "reduce_payable") continue;
    creditedByPurchase.set(r.purchaseId, (creditedByPurchase.get(r.purchaseId) ?? 0) + r.creditAmount + (r.taxAmount ?? 0));
  }
  for (const [billId, amt] of creditAppliedByBill(supplierCredits)) {
    creditedByPurchase.set(billId, (creditedByPurchase.get(billId) ?? 0) + amt);
  }

  const lines: PayableLine[] = [];
  for (const pur of purchases) {
    if (pur.paymentMethod !== "credit") continue;
    // Tax is money owed to the supplier too, not just the goods cost —
    // mirrors the amountDue treatment in computeReceivablesAging above.
    // Omitting it understated every credit purchase's payable by its input
    // tax, which flowed straight into totalOutstanding, the Balance Sheet's
    // accountsPayable, and RecordPayablePaymentForm's suggested amount.
    const amountDue = pur.qty * pur.unitCost + (pur.taxAmount ?? 0);
    const amountPaid = paidByPurchase.get(pur.id) ?? 0;
    const amountCredited = creditedByPurchase.get(pur.id) ?? 0;
    const amountOutstanding = amountDue - amountPaid - amountCredited;
    if (amountOutstanding <= 0.005) continue; // fully paid / fully credited

    const dueDate = pur.dueDate ?? pur.date;
    const daysOverdue = daysBetween(dueDate, asOfISO);
    let bucket: PayableBucket = "current";
    if (daysOverdue > 90) bucket = "90+";
    else if (daysOverdue > 60) bucket = "61-90";
    else if (daysOverdue > 30) bucket = "31-60";
    else if (daysOverdue > 0) bucket = "1-30";

    lines.push({
      purchaseId: pur.id,
      productId: pur.productId,
      productName: productById.get(pur.productId)?.name ?? "—",
      supplier: pur.supplier ?? "Unnamed supplier",
      date: pur.date,
      dueDate,
      amountDue,
      amountPaid,
      amountCredited,
      amountOutstanding,
      daysOverdue,
      bucket,
    });
  }
  for (const ob of openingBalances) {
    if (ob.kind !== "payable") continue;
    const amountPaid = paidByPurchase.get(ob.id) ?? 0;
    const amountCredited = creditedByPurchase.get(ob.id) ?? 0; // supplier credit used on it
    const amountOutstanding = ob.amount - amountPaid - amountCredited;
    if (amountOutstanding <= 0.005) continue; // fully paid
    const dueDate = ob.dueDate || ob.date;
    const daysOverdue = daysBetween(dueDate, asOfISO);
    let bucket: PayableBucket = "current";
    if (daysOverdue > 90) bucket = "90+";
    else if (daysOverdue > 60) bucket = "61-90";
    else if (daysOverdue > 30) bucket = "31-60";
    else if (daysOverdue > 0) bucket = "1-30";
    lines.push({
      purchaseId: ob.id,
      productId: "",
      productName: ob.note?.trim() ? `Opening balance · ${ob.note.trim()}` : "Opening balance",
      supplier: ob.party || "Unnamed supplier",
      date: ob.date,
      dueDate,
      amountDue: ob.amount,
      amountPaid,
      amountCredited,
      amountOutstanding,
      daysOverdue,
      bucket,
      isOpeningBalance: true,
    });
  }
  lines.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const byBucket: Record<PayableBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let totalOutstanding = 0;
  for (const l of lines) {
    byBucket[l.bucket] += l.amountOutstanding;
    totalOutstanding += l.amountOutstanding;
  }

  return { asOf: asOfISO, totalOutstanding, byBucket, lines };
}

// ---------------------------------------------------------------------------
// Bills payable — the general-purpose counterpart to computePayablesAging
// above, for money owed on a one-off Expense (kind: "expense", isRecurring:
// false) rather than an inventory Purchase: rent, utilities, contractor
// invoices, an employee's pay entered as its own dated bill. Only expenses
// explicitly marked paymentStatus "unpaid" ever produce a line here — every
// expense recorded before this field existed, and every expense recorded
// without touching the new "unpaid" option, has paymentStatus undefined and
// is silently excluded, exactly as if it had been marked "paid" (which is
// what it was, implicitly, before this feature existed).
// ---------------------------------------------------------------------------
export interface BillPayableLine {
  expenseId: string;
  payee: string;
  category: string;
  date: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  amountOutstanding: number;
  daysOverdue: number;
  bucket: PayableBucket;
}

export interface BillsPayablesAging {
  asOf: string;
  totalOutstanding: number;
  byBucket: Record<PayableBucket, number>;
  lines: BillPayableLine[];
}

export function computeBillsPayable(
  expenses: Expense[],
  billPayments: BillPayment[],
  asOfISO: string
): BillsPayablesAging {
  const paidByExpense = new Map<string, number>();
  for (const p of billPayments) paidByExpense.set(p.expenseId, (paidByExpense.get(p.expenseId) ?? 0) + p.amount);

  const lines: BillPayableLine[] = [];
  for (const e of expenses) {
    if (e.kind !== "expense" || e.isRecurring || e.paymentStatus !== "unpaid") continue;
    // What is owed to the payee is the gross bill: amount plus any
    // reclaimable input tax (see expenseCashTotalForMonth for why the tax
    // sits on top of `amount`). Payments against it are recorded gross too.
    const amountDue = e.amount + (e.taxAmount ?? 0);
    const amountPaid = paidByExpense.get(e.id) ?? 0;
    const amountOutstanding = amountDue - amountPaid;
    if (amountOutstanding <= 0.005) continue; // fully paid

    const dueDate = e.dueDate ?? e.startDate;
    const daysOverdue = daysBetween(dueDate, asOfISO);
    let bucket: PayableBucket = "current";
    if (daysOverdue > 90) bucket = "90+";
    else if (daysOverdue > 60) bucket = "61-90";
    else if (daysOverdue > 30) bucket = "31-60";
    else if (daysOverdue > 0) bucket = "1-30";

    lines.push({
      expenseId: e.id,
      payee: e.payee?.trim() || e.name,
      category: e.category || "Uncategorized",
      date: e.startDate,
      dueDate,
      amountDue,
      amountPaid,
      amountOutstanding,
      daysOverdue,
      bucket,
    });
  }
  lines.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const byBucket: Record<PayableBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let totalOutstanding = 0;
  for (const l of lines) {
    byBucket[l.bucket] += l.amountOutstanding;
    totalOutstanding += l.amountOutstanding;
  }

  return { asOf: asOfISO, totalOutstanding, byBucket, lines };
}

// ---------------------------------------------------------------------------
// Financial health ratios — the standard liquidity / profitability /
// efficiency / leverage set, computed off numbers this file already
// produces (Balance Sheet, Monthly P&L). Nothing here is hand-entered, so
// it stays consistent with the statements by construction, same as the
// Balance Sheet itself.
//
// "Current liabilities" for the liquidity ratios is accounts payable plus
// the current (within-12-months) portion of loan principal — see
// computeCurrentPortionOfLoans below computeLoanPortfolio. The full
// remaining loan balance still counts in totalLiabilities for
// debtToEquity/debtRatio further down; only the near-term slice belongs
// here.
// ---------------------------------------------------------------------------

export interface FinancialHealthRatios {
  // The reference's cash-flow and cover ratios (pass 308); formulas in lib/ratios-reference.ts.
  operatingCashFlowRatio: number | null;
  cashFlowToNetProfit: number | null;
  cashReturnOnAssetsPct: number | null;
  interestBurdenPct: number | null;
  cashInterestCoverage: number | null;
  ebitdaCoverage: number | null;
  retainedEarningsPct: number | null;
  fixedAssetTurnover: number | null;
  payablesTurnover: number | null; // pass 314
  capitalGearing: number | null; // pass 314
  altmanZ: number | null; // pass 314: Altman Z'' (private firms)
  altmanZone: AltmanZone | null; // pass 314
  asOf: string;
  trailingMonths: number; // how many months of activity the profitability/efficiency ratios are drawn from

  // Liquidity — can the business cover near-term obligations?
  currentRatio: number | null; // (cash + AR + inventory) / (accounts payable + current portion of loans)
  cashRatio: number | null; // cash ÷ (accounts payable + current portion of loans) — the strictest liquidity test: could you settle everything due soon from cash alone, without collecting a single receivable or selling any stock
  quickRatio: number | null; // (cash + AR) / (accounts payable + current portion of loans) — excludes inventory, which isn't instantly spendable

  // Profitability — trailing-window margins and return on the owner's stake
  grossMarginPct: number | null;
  // Gross profit minus additional variable costs (selling fees, fulfillment,
  // payment processing, variable marketing — anything logged as a
  // VariableCost that isn't tagged includeInCogs) as a % of revenue. Sits
  // between gross and operating margin in the waterfall: gross margin only
  // backs out COGS, operating margin also absorbs fixed overhead —
  // contribution margin is the number that answers "after everything that
  // scales with volume, before fixed costs, what's left".
  contributionMarginPct: number | null;
  // Revenue minus COGS and operating costs (including depreciation) before
  // interest and tax — i.e. EBIT margin. Distinct from netMarginPct below:
  // net margin also absorbs interest, tax, and one-off disposal gain/loss,
  // so a business can have a healthy operating margin while net margin
  // looks weak because of a big loan or a bad tax quarter. This is the
  // number that isolates "is the core business itself profitable".
  operatingMarginPct: number | null;
  netMarginPct: number | null;
  returnOnEquityPct: number | null; // trailing net profit / current total equity

  // Efficiency — how fast cash moves through the business
  daysSalesOutstanding: number | null; // avg days to collect a sale
  daysPayableOutstanding: number | null; // avg days taken to pay a supplier
  daysInventoryOutstanding: number | null; // avg days stock sits before selling
  cashConversionCycleDays: number | null; // DIO + DSO - DPO — days cash is tied up in the operating cycle
  inventoryTurnoverAnnualized: number | null; // times inventory is sold through per year
  gmroiAnnualized: number | null; // gross profit (trailing, annualized) ÷ inventory at cost today — gross profit earned per 1 of stock held; margin and turnover in one number, for choosing where stock money works hardest. Null when there is no stock or no sales

  // Leverage — how much of the business is financed by debt
  debtToEquity: number | null;
  interestBearingDebtToEquity: number | null; // loans on the books ÷ owners' equity: the standard debt-to-equity (pass 304)
  debtRatio: number | null; // total liabilities / total assets

  // Added alongside ROE/current ratio — the same "how healthy is this
  // business" question lenders and owners ask next, using data this app
  // already has (no new inputs required):
  assetTurnoverAnnualized: number | null; // trailing revenue ÷ current total assets, annualized — revenue generated per unit of everything the business owns; low means assets are sitting idle relative to sales
  returnOnAssetsPct: number | null; // trailing net profit / current total assets — profit per dollar of everything the business owns, not just the owner's stake
  workingCapital: number | null; // currentAssets - currentLiabilities, in currency — the dollar-amount companion to currentRatio; a business can have a "fine" ratio on a tiny base or a "thin" ratio on a large one, and this is what tells them apart
  debtServiceCoverageRatio: number | null; // trailing operating cash flow / trailing total loan payments (principal+interest) — can the business's actual cash from operations cover what it owes lenders each month; null when there's no debt to service
  payrollToRevenuePct: number | null; // today's committed monthly payroll ÷ trailing average monthly revenue — the classic "is labor cost eating the business" check, especially for service/retail SMEs; null when there's no active payroll

  // Capital stewardship — is the owner actually leaving enough cash in the
  // business to fund the eventual repair/replacement of its equipment, or
  // withdrawing it all (or more) as profit? Depreciation already lowers
  // netProfitAfterTax as a non-cash expense, but that's an accounting
  // signal, not a cash one: the cash it represents only stays reserved if
  // it isn't also drawn out. This makes that check explicit and
  // hand-verifiable, the same way debtServiceCoverageRatio does for loans.
  monthlyMaintenanceReserve: number | null; // today's combined monthly depreciation across active (not fully-depreciated, not disposed) fixed assets — what should be set aside each month toward eventual repair/replacement; null when there are no such assets to reserve for
  maintenanceReserveCoverage: number | null; // (avg monthly net profit − avg monthly owner withdrawals) ÷ monthlyMaintenanceReserve, over the same trailing window as the other ratios — 1× means retained cash exactly covers the equipment wearing out, below 1× means withdrawals are eating into that reserve, negative means withdrawals exceed profit entirely; null when monthlyMaintenanceReserve is null

  // Standard lender/analyst indicator set that wasn't otherwise covered
  // above — most of this app's existing ratios already answer the same
  // questions under different names (e.g. "return on sales" is netMarginPct
  // or operatingMarginPct depending which convention you use, so it isn't
  // duplicated here), but these five have no existing equivalent.
  ebit: number | null; // trailing operating profit in currency — same number operatingMarginPct is a % of; null only when there's no P&L history yet
  ebitda: number | null; // ebit + trailing depreciation (this app has no amortization to add back) — the "before financing and non-cash wear" figure lenders ask for
  interestCoverageRatio: number | null; // ebit ÷ trailing interest expense — distinct from debtServiceCoverageRatio, which divides actual cash by principal+interest; this is the accrual-basis, interest-only version lenders usually mean by the name. Null when there's no interest expense to cover
  freeCashFlow: number | null; // trailing operating cash flow − trailing capital expenditure (fixed asset purchases) — the cash actually free after keeping the equipment base up, before any financing activity
  operatingCashFlowTrailing: number | null; // trailing operating cash flow in currency — the same figure debtServiceCoverageRatio already divides by, exposed directly since "Operating Cash Flow" is its own standard indicator, not just an input to a ratio
  returnOnCapitalEmployedPct: number | null; // trailing ebit ÷ (total assets − current liabilities) — profit per dollar of capital actually employed in the business (debt + equity), the metric lenders use instead of ROE when they don't care how it's financed. Null when capital employed isn't positive
  netDebt: number; // loansPayable − cash, from today's Balance Sheet — negative means the business holds more cash than it owes lenders (a net cash position), not a lending risk; always computable, never null
}

export function computeFinancialHealthRatios(
  monthlyPnL: MonthlyPnL[],
  balanceSheet: BalanceSheet,
  windowMonths = 12,
  // Current combined monthly loan payment across all active loans
  // (LoanPortfolioSummary.totalMonthlyPayment) — passed in rather than
  // recomputed here since DataContext already has it via
  // computeLoanPortfolio, and debt service coverage should reflect
  // TODAY's loan book, not a trailing-window average of it.
  monthlyDebtService = 0,
  // Same reasoning as monthlyDebtService above: today's committed monthly
  // payroll (monthlyPayrollCost(employees)), not a trailing average —
  // reflects who's actually on payroll right now.
  monthlyPayroll = 0,
  // computeCurrentPortionOfLoans(loans, asOf) — the slice of loan principal
  // actually due within the next 12 months. Included in "current
  // liabilities" below alongside accounts payable, which is the standard
  // textbook current-ratio treatment (accounts payable + current portion
  // of long-term debt); the previous accounts-payable-only version
  // understated what a business with an active loan actually owes in the
  // near term. Still doesn't require anything this app doesn't already
  // compute — see computeCurrentPortionOfLoans's own comment.
  currentPortionOfLoans = 0,
  // Active fixed assets, for monthlyMaintenanceReserve — pass the same
  // `fixedAssets` array DataContext already loads. Optional/defaulted like
  // the other add-on params above, so existing callers keep compiling.
  fixedAssets: FixedAsset[] = [],
  // Owner capital movements, for maintenanceReserveCoverage's withdrawal
  // side. Only CapitalEntry.kind === "withdrawal" within the same trailing
  // window as the rest of this function's ratios is used.
  capitalEntries: CapitalEntry[] = []
): FinancialHealthRatios {
  const window = monthlyPnL.slice(-Math.max(1, windowMonths));
  const trailingMonths = window.length;
  const days = trailingMonths * 30; // approximate — matches this app's existing "30 days/month" convention elsewhere

  const revenue = window.reduce((s, m) => s + m.totalRevenue, 0);
  const cogs = window.reduce((s, m) => s + m.cogs, 0);
  const grossProfit = window.reduce((s, m) => s + m.grossProfit, 0);
  const netProfit = window.reduce((s, m) => s + m.netProfitAfterTax, 0);
  const operatingProfit = window.reduce(
    (s, m) => s + (m.contributionMargin - m.operatingExpenses - m.depreciationExpense),
    0
  );

  const { cash, accountsReceivable, inventoryValue, accountsPayable, totalLiabilities, totalAssets, totalEquity } =
    balanceSheet;

  // "Current liabilities" = accounts payable + the current portion of
  // loans — everything actually due within about a year. The rest of a
  // loan's balance still counts in totalLiabilities for debtToEquity/
  // debtRatio below (correct — it's still owed), just not here.
  // Customer deposits are settled by delivering within the year, so they count as current liabilities too.
  const currentLiabilities = accountsPayable + currentPortionOfLoans + (balanceSheet.customerDeposits ?? 0);
  // Credit a supplier holds for you is spent against their bills within the year, so it counts as a current asset
  // (not a quick one: it can't be turned into cash on demand).
  const currentAssets = cash + accountsReceivable + inventoryValue + (balanceSheet.supplierCredit ?? 0);
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const quickRatio = currentLiabilities > 0 ? (cash + accountsReceivable) / currentLiabilities : null;
  const cashRatio = currentLiabilities > 0 ? cash / currentLiabilities : null;

  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const contributionMarginTotal = window.reduce((s, m) => s + m.contributionMargin, 0);
  const contributionMarginPct = revenue > 0 ? (contributionMarginTotal / revenue) * 100 : null;
  const operatingMarginPct = revenue > 0 ? (operatingProfit / revenue) * 100 : null;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : null;
  const returnOnEquityPct = totalEquity > 0 ? (netProfit / totalEquity) * 100 : null;

  const daysSalesOutstanding = revenue > 0 ? (accountsReceivable / revenue) * days : null;
  const daysPayableOutstanding = cogs > 0 ? (accountsPayable / cogs) * days : null;
  const daysInventoryOutstanding = cogs > 0 ? (inventoryValue / cogs) * days : null;
  const cashConversionCycleDays =
    daysInventoryOutstanding !== null && daysSalesOutstanding !== null && daysPayableOutstanding !== null
      ? daysInventoryOutstanding + daysSalesOutstanding - daysPayableOutstanding
      : null;
  const inventoryTurnoverAnnualized =
    cogs > 0 && inventoryValue > 0 ? (cogs / inventoryValue) * (365 / days) : null;
  // GMROI = gross profit ÷ inventory at cost, annualized the same way as turnover so the two reconcile
  // (GMROI = turnover × grossProfit ÷ COGS). Needs sales and stock on hand; a negative value means stock is losing money.
  const gmroiAnnualized =
    revenue > 0 && inventoryValue > 0 ? (grossProfit / inventoryValue) * (365 / days) : null;

  const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : null;
  const interestBearingDebtToEquity = totalEquity > 0 ? balanceSheet.loansPayable / totalEquity : null;
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : null;

  const returnOnAssetsPct = totalAssets > 0 ? (netProfit / totalAssets) * 100 : null;
  const assetTurnoverAnnualized =
    revenue > 0 && totalAssets > 0 ? (revenue / totalAssets) * (365 / days) : null;
  const workingCapital = currentAssets - currentLiabilities;
  const trailingOperatingCashFlow = window.reduce((s, m) => s + m.operatingCashFlow, 0);
  const debtServiceCoverageRatio =
    monthlyDebtService > 0 && trailingMonths > 0
      ? trailingOperatingCashFlow / (monthlyDebtService * trailingMonths)
      : null;

  const avgMonthlyRevenue = trailingMonths > 0 ? window.reduce((s, m) => s + m.totalRevenue, 0) / trailingMonths : 0;
  const payrollToRevenuePct =
    monthlyPayroll > 0 && avgMonthlyRevenue > 0 ? (monthlyPayroll / avgMonthlyRevenue) * 100 : null;

  // Today's committed monthly depreciation across assets still actively
  // wearing out — same "as of today" treatment as monthlyPayroll/
  // monthlyDebtService above, not a trailing average of a portfolio that
  // may have since grown, shrunk, or fully depreciated.
  const activeMonthlyDepreciation = fixedAssets
    .filter((a) => !a.disposalDate)
    .map((a) => computeFixedAssetStatus(a, balanceSheet.asOf))
    .filter((s) => !s.fullyDepreciated)
    .reduce((s, status) => s + status.monthlyDepreciation, 0);
  const monthlyMaintenanceReserve = activeMonthlyDepreciation > 0 ? activeMonthlyDepreciation : null;

  const windowMonthKeys = new Set(window.map((m) => m.month));
  const trailingWithdrawals = capitalEntries
    .filter((c) => c.kind === "withdrawal" && !isPoolEntry(c) && windowMonthKeys.has(c.date.slice(0, 7)))
    .reduce((s, c) => s + c.amount, 0);
  const avgMonthlyWithdrawal = trailingMonths > 0 ? trailingWithdrawals / trailingMonths : 0;
  const avgMonthlyNetProfit = trailingMonths > 0 ? netProfit / trailingMonths : 0;
  const maintenanceReserveCoverage =
    monthlyMaintenanceReserve !== null
      ? (avgMonthlyNetProfit - avgMonthlyWithdrawal) / monthlyMaintenanceReserve
      : null;

  // ebit is the same accrual figure operatingMarginPct is already a % of —
  // exposed here as a currency amount for the standard lender/analyst
  // indicator set. depreciation/interestExpense/fixedAssetPurchases are
  // already per-month fields on MonthlyPnL, so these are pure trailing-sum
  // derivations, nothing new to compute per month.
  const ebit = trailingMonths > 0 ? operatingProfit : null;
  const trailingDepreciation = window.reduce((s, m) => s + m.depreciationExpense, 0);
  const ebitda = ebit !== null ? ebit + trailingDepreciation : null;
  const trailingInterestExpense = window.reduce((s, m) => s + m.interestExpense, 0);
  const interestCoverageRatio = ebit !== null && trailingInterestExpense > 0 ? ebit / trailingInterestExpense : null;
  const trailingCapex = window.reduce((s, m) => s + m.fixedAssetPurchases, 0);
  const freeCashFlow = trailingMonths > 0 ? trailingOperatingCashFlow - trailingCapex : null;
  const operatingCashFlowTrailing = trailingMonths > 0 ? trailingOperatingCashFlow : null;
  const capitalEmployed = totalAssets - currentLiabilities;
  const refRevenue = window.reduce((s, m) => s + m.totalRevenue, 0);
  const returnOnCapitalEmployedPct = ebit !== null && capitalEmployed > 0 ? (ebit / capitalEmployed) * 100 : null;
  const netDebt = balanceSheet.loansPayable - cash;

  // Altman Z'' for private firms (pass 314): needs a trailing EBIT and a positive asset and liability base.
  const altmanResult = ebit === null ? null : altmanZPrivate({ workingCapital, retainedEarnings: balanceSheet.retainedEarnings, ebit, bookEquity: totalEquity, totalAssets, totalLiabilities });
  return {
    asOf: balanceSheet.asOf,
    trailingMonths,
    currentRatio,
    quickRatio,
    cashRatio,
    grossMarginPct,
    contributionMarginPct,
    operatingMarginPct,
    netMarginPct,
    returnOnEquityPct,
    daysSalesOutstanding,
    daysPayableOutstanding,
    daysInventoryOutstanding,
    cashConversionCycleDays,
    inventoryTurnoverAnnualized,
    gmroiAnnualized,
    debtToEquity,
    interestBearingDebtToEquity,
    debtRatio,
    assetTurnoverAnnualized,
    returnOnAssetsPct,
    workingCapital,
    debtServiceCoverageRatio,
    payrollToRevenuePct,
    monthlyMaintenanceReserve,
    maintenanceReserveCoverage,
    ebit,
    ebitda,
    interestCoverageRatio,
    freeCashFlow,
    operatingCashFlowTrailing,
    operatingCashFlowRatio: refOperatingCashFlowRatio(operatingCashFlowTrailing, currentLiabilities),
    cashFlowToNetProfit: refCashFlowToNetProfit(operatingCashFlowTrailing, netProfit),
    cashReturnOnAssetsPct: refCashReturnOnAssetsPct(operatingCashFlowTrailing, totalAssets),
    interestBurdenPct: refInterestBurdenPct(trailingInterestExpense, ebit),
    cashInterestCoverage: refCashInterestCoverage(operatingCashFlowTrailing, trailingInterestExpense),
    ebitdaCoverage: refEbitdaCoverage(ebitda, trailingInterestExpense),
    retainedEarningsPct: refRetainedEarningsPct(balanceSheet.retainedEarnings, netProfit),
    fixedAssetTurnover: refFixedAssetTurnover(refRevenue, balanceSheet.fixedAssetsNetBookValue),
    payablesTurnover: refPayablesTurnover(cogs, accountsPayable),
    capitalGearing: refCapitalGearing(totalEquity, balanceSheet.loansPayable),
    altmanZ: altmanResult?.z ?? null,
    altmanZone: altmanResult?.zone ?? null,
    returnOnCapitalEmployedPct,
    netDebt,
  };
}

// ---------------------------------------------------------------------------
// Growth, order size, staff productivity, and cash runway — the other
// standard SME dashboard numbers, built the same way as everything above:
// derived entirely from data already collected (monthlyPnL, Sales,
// Employees, the Balance Sheet's cash figure), each null exactly when
// there isn't enough history to say something real rather than showing a
// misleading 0% or 0-month figure.
// ---------------------------------------------------------------------------

export interface GrowthMetrics {
  asOf: string; // the latest month included
  revenueMoMPct: number | null; // vs. the immediately preceding month
  revenueYoYPct: number | null; // vs. the same calendar month last year
  netProfitMoMPct: number | null;
  netProfitYoYPct: number | null;
}

export function computeGrowthMetrics(monthlyPnL: MonthlyPnL[]): GrowthMetrics {
  if (monthlyPnL.length === 0) {
    return { asOf: "", revenueMoMPct: null, revenueYoYPct: null, netProfitMoMPct: null, netProfitYoYPct: null };
  }
  const byMonth = new Map(monthlyPnL.map((m) => [m.month, m]));
  const latest = monthlyPnL[monthlyPnL.length - 1];

  const pctChange = (curr: number, prev: number | undefined): number | null => {
    // A prior period of exactly 0 has no meaningful "% change" (division by
    // zero) — treated as no comparison available rather than an infinite
    // or fabricated percentage.
    if (prev === undefined || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const [y, m] = latest.month.split("-").map(Number);
  const prevMonthKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prevYearKey = `${y - 1}-${String(m).padStart(2, "0")}`;
  const prevMonth = byMonth.get(prevMonthKey);
  const prevYear = byMonth.get(prevYearKey);

  return {
    asOf: latest.month,
    revenueMoMPct: pctChange(latest.totalRevenue, prevMonth?.totalRevenue),
    revenueYoYPct: pctChange(latest.totalRevenue, prevYear?.totalRevenue),
    netProfitMoMPct: pctChange(latest.netProfitAfterTax, prevMonth?.netProfitAfterTax),
    netProfitYoYPct: pctChange(latest.netProfitAfterTax, prevYear?.netProfitAfterTax),
  };
}

export interface AverageOrderValue {
  trailingMonths: number;
  orderCount: number; // distinct invoices/orders — multi-line sales on one invoice count once
  totalRevenue: number;
  averageOrderValue: number | null; // null when orderCount is 0, rather than showing 0
}

export function computeAverageOrderValue(sales: Sale[], windowMonths = 3): AverageOrderValue {
  const todayIso = localIsoDate();
  const windowStart = addDaysIso(todayIso, -windowMonths * 30);
  const inWindow = sales.filter((s) => s.date >= windowStart && s.date <= todayIso);
  const orders = groupSalesByInvoice(inWindow);
  const totalRevenue = inWindow.reduce((sum, s) => sum + s.qty * s.unitPrice, 0);
  return {
    trailingMonths: windowMonths,
    orderCount: orders.length,
    totalRevenue,
    averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : null,
  };
}

// ---------------------------------------------------------------------------
// Growth levers: the four standard "make more profit" dials — cut what it
// costs to deliver (COGS), cut what it costs to run the place (opex), sell
// bigger baskets (AOV), and charge more per unit (avg selling price). Built
// the same way as GrowthMetrics above: trailing window vs. the window
// immediately before it, from data already collected, null wherever there
// isn't enough history to say something real.
// ---------------------------------------------------------------------------

export interface GrowthLeverComparison {
  current: number | null;
  prior: number | null;
  changePct: number | null; // null when prior is null, 0, or current is null
}

export interface GrowthLevers {
  windowMonths: number;
  currentMonths: string[];
  priorMonths: string[];
  // Lower is better: what it costs to make/acquire what was sold, as a share
  // of revenue.
  cogsPctOfRevenue: GrowthLeverComparison;
  // Lower is better: rent, payroll, subscriptions, etc — the cost of running
  // the business regardless of sales volume.
  operatingExpenses: GrowthLeverComparison; // absolute $
  operatingExpensesPctOfRevenue: GrowthLeverComparison;
  // Higher is better: revenue per unit sold — moves when prices change or
  // the sales mix shifts toward pricier items.
  avgSellingPrice: GrowthLeverComparison;
  // Higher is better: revenue per order/invoice — moves when customers buy
  // more per visit (upsells, bundles, minimums).
  averageOrderValue: GrowthLeverComparison & { currentOrderCount: number; priorOrderCount: number };
}

export function computeGrowthLevers(monthlyPnL: MonthlyPnL[], sales: Sale[], windowMonths = 3): GrowthLevers {
  const pctChange = (curr: number | null, prev: number | null): number | null => {
    if (curr === null || prev === null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const sorted = [...monthlyPnL].sort((a, b) => a.month.localeCompare(b.month));
  const currentSlice = sorted.slice(-windowMonths);
  const priorSlice = sorted.slice(-windowMonths * 2, -windowMonths);
  const currentMonths = currentSlice.map((m) => m.month);
  const priorMonths = priorSlice.map((m) => m.month);

  const sum = (arr: MonthlyPnL[], key: "totalRevenue" | "cogs" | "operatingExpenses" | "unitsSold") =>
    arr.reduce((s, m) => s + m[key], 0);

  const currRevenue = sum(currentSlice, "totalRevenue");
  const priorRevenue = sum(priorSlice, "totalRevenue");
  const currCogs = sum(currentSlice, "cogs");
  const priorCogs = sum(priorSlice, "cogs");
  const currOpex = sum(currentSlice, "operatingExpenses");
  const priorOpex = sum(priorSlice, "operatingExpenses");
  const currUnits = sum(currentSlice, "unitsSold");
  const priorUnits = sum(priorSlice, "unitsSold");

  const cogsPctCurrent = currRevenue > 0 ? (currCogs / currRevenue) * 100 : null;
  const cogsPctPrior = priorSlice.length > 0 && priorRevenue > 0 ? (priorCogs / priorRevenue) * 100 : null;
  const opexPctCurrent = currRevenue > 0 ? (currOpex / currRevenue) * 100 : null;
  const opexPctPrior = priorSlice.length > 0 && priorRevenue > 0 ? (priorOpex / priorRevenue) * 100 : null;
  const priceCurrent = currUnits > 0 ? currRevenue / currUnits : null;
  const pricePrior = priorSlice.length > 0 && priorUnits > 0 ? priorRevenue / priorUnits : null;

  // AOV over the same calendar months as the P&L windows above, so all four
  // levers describe the same stretch of time.
  const currentSet = new Set(currentMonths);
  const priorSet = new Set(priorMonths);
  const currentSales = sales.filter((s) => currentSet.has(s.date.slice(0, 7)));
  const priorSales = sales.filter((s) => priorSet.has(s.date.slice(0, 7)));
  const currentOrders = groupSalesByInvoice(currentSales);
  const priorOrders = groupSalesByInvoice(priorSales);
  const currentOrderRevenue = currentSales.reduce((s, sale) => s + sale.qty * sale.unitPrice, 0);
  const priorOrderRevenue = priorSales.reduce((s, sale) => s + sale.qty * sale.unitPrice, 0);
  const aovCurrent = currentOrders.length > 0 ? currentOrderRevenue / currentOrders.length : null;
  const aovPrior = priorSlice.length > 0 && priorOrders.length > 0 ? priorOrderRevenue / priorOrders.length : null;

  return {
    windowMonths,
    currentMonths,
    priorMonths,
    cogsPctOfRevenue: { current: cogsPctCurrent, prior: cogsPctPrior, changePct: pctChange(cogsPctCurrent, cogsPctPrior) },
    operatingExpenses: { current: currOpex, prior: priorSlice.length > 0 ? priorOpex : null, changePct: pctChange(currOpex, priorSlice.length > 0 ? priorOpex : null) },
    operatingExpensesPctOfRevenue: { current: opexPctCurrent, prior: opexPctPrior, changePct: pctChange(opexPctCurrent, opexPctPrior) },
    avgSellingPrice: { current: priceCurrent, prior: pricePrior, changePct: pctChange(priceCurrent, pricePrior) },
    averageOrderValue: {
      current: aovCurrent,
      prior: aovPrior,
      changePct: pctChange(aovCurrent, aovPrior),
      currentOrderCount: currentOrders.length,
      priorOrderCount: priorOrders.length,
    },
  };
}

export interface RevenuePerEmployee {
  trailingMonths: number;
  trailingRevenue: number;
  activeEmployeeCount: number;
  revenuePerEmployee: number | null; // null when there are no active employees to divide by
}

export function computeRevenuePerEmployee(
  monthlyPnL: MonthlyPnL[],
  employees: Employee[],
  windowMonths = 12
): RevenuePerEmployee {
  const window = monthlyPnL.slice(-Math.max(1, windowMonths));
  const trailingRevenue = window.reduce((s, m) => s + m.totalRevenue, 0);
  const activeEmployeeCount = employees.filter((e) => e.active).length;
  return {
    trailingMonths: window.length,
    trailingRevenue,
    activeEmployeeCount,
    revenuePerEmployee: activeEmployeeCount > 0 ? trailingRevenue / activeEmployeeCount : null,
  };
}

// ---------------------------------------------------------------------------
// Staff utilization — of the hours actually clocked, what share were
// billable. Built entirely off TimeEntry (clock in/out) — the same record
// project labor costing already reads — so there's no new data entry and
// no assumption about "expected"/"scheduled" hours (this app has no
// shift/roster feature to compare against). This reports what actually got
// logged: a classic service-business health check, since a team that's
// clocking in consistently but spending most of that time on non-billable
// work is a margin problem a busy-looking calendar can otherwise hide.
// ---------------------------------------------------------------------------

export interface StaffUtilization {
  memberUid: string;
  memberName: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  utilizationPct: number | null; // billableHours / totalHours * 100, null when totalHours is 0
  // Sum of hours × hourlyRate for billable entries that have a rate — the
  // same per-entry math computeProjectFinancials' laborCost uses, rolled up
  // per person instead of per project. Not necessarily what was actually
  // invoiced (that depends on whether the work was billed at all).
  billableValue: number;
}

export function computeStaffUtilization(timeEntries: TimeEntry[], windowMonths = 1): StaffUtilization[] {
  const todayIsoDate = localIsoDate();
  const windowStart = addDaysIso(todayIsoDate, -windowMonths * 30);

  type Acc = { memberName: string; totalHours: number; billableHours: number; billableValue: number };
  const byMember = new Map<string, Acc>();

  for (const t of timeEntries) {
    if (!t.clockOut) continue; // still running — no settled duration to count yet
    const entryDate = localIsoDate(new Date(t.clockIn));
    if (entryDate < windowStart) continue;

    const hours = (t.clockOut - t.clockIn) / 3600000;
    const acc = byMember.get(t.memberUid) ?? { memberName: t.memberName, totalHours: 0, billableHours: 0, billableValue: 0 };
    acc.memberName = t.memberName; // keep the most recently seen name, in case it changed
    acc.totalHours += hours;
    if (t.billable) {
      acc.billableHours += hours;
      if (t.hourlyRate) acc.billableValue += hours * t.hourlyRate;
    }
    byMember.set(t.memberUid, acc);
  }

  return Array.from(byMember.entries())
    .map(([memberUid, acc]) => ({
      memberUid,
      memberName: acc.memberName,
      totalHours: acc.totalHours,
      billableHours: acc.billableHours,
      nonBillableHours: acc.totalHours - acc.billableHours,
      utilizationPct: acc.totalHours > 0 ? (acc.billableHours / acc.totalHours) * 100 : null,
      billableValue: acc.billableValue,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

export interface CashRunway {
  asOf: string;
  cash: number;
  trailingMonths: number; // months of actual history averaged to get the burn rate below
  avgMonthlyNetCashFlow: number; // trailing average of MonthlyPnL.netCashFlow — negative means burning cash
  runwayMonths: number | null; // cash / |avgMonthlyNetCashFlow|, only when burning; null (i.e. not running out) when cash flow is break-even or positive
}

// Distinct from the "Can You Make Rent?" tool on the Cash Flow page: that
// tool projects specific dated obligations (rent, payroll, loan payments)
// day-by-day against one specific bill. This is the other standard SME
// number — "at our average recent burn rate, how many months of cash do
// we have left" — using the same monthly net cash flow already computed
// for the Cash Flow Statement, just averaged and compared against cash on
// hand today.
export function computeCashRunwayMonths(
  cash: number,
  monthlyPnL: MonthlyPnL[],
  asOfISO: string,
  windowMonths = 3
): CashRunway {
  const window = monthlyPnL.slice(-Math.max(1, windowMonths));
  const trailingMonths = window.length;
  const avgMonthlyNetCashFlow =
    trailingMonths > 0 ? window.reduce((s, m) => s + m.netCashFlow, 0) / trailingMonths : 0;
  const runwayMonths =
    trailingMonths > 0 && avgMonthlyNetCashFlow < 0 ? cash / Math.abs(avgMonthlyNetCashFlow) : null;
  return { asOf: asOfISO, cash, trailingMonths, avgMonthlyNetCashFlow, runwayMonths };
}

// ---------------------------------------------------------------------------
// Profit First-style target allocation — see the Settings.profitFirst*
// doc comments in lib/types.ts for the method itself. This is purely a
// percentage split of one month's REAL revenue (cash actually collected —
// cashSalesRevenue + recurringRevenue + receivableCollections, the same
// figure operatingCashFlow above is built from) into what should be set
// aside for Profit, Owner's Pay, and Tax, with Opex as whatever's left.
// It never touches capitalEntries, never creates a transaction, and
// doesn't require (or assume) that the money is actually sitting in
// separate bank accounts — it's a target to compare reality against, not
// a transfer.
//
// Deliberately keyed off cash collected, not accrual revenue or gross
// sales: a credit sale that hasn't been paid yet isn't cash you can set
// anything aside from, and the method itself (as described in the notes
// this was built from) is explicitly about what's actually landed in the
// bank, not what's been invoiced.
// ---------------------------------------------------------------------------

export interface ProfitFirstAllocation {
  month: string;
  realRevenue: number; // cash collected this month — the base every percentage below applies to
  profitPct: number;
  ownerPayPct: number;
  taxPct: number;
  opexPct: number; // 100 - the three above, floored at 0 — see doc comment above
  profitTarget: number;
  ownerPayTarget: number;
  taxTarget: number;
  opexTarget: number;
  // True when the three configured percentages already add up to 100 or
  // more (a business set Profit + Owner's Pay + Tax to consume the whole
  // month, whether on purpose or from an unvalidated edit) — the targets
  // above are still computed and still sum to realRevenue exactly (Opex
  // is just floored at 0 rather than going negative), but they're no
  // longer all simultaneously achievable, which the UI surfaces this flag
  // to explain rather than silently showing an Opex target of 0.
  overCommitted: boolean;
}

export function computeProfitFirstAllocation(
  monthlyPnL: MonthlyPnL[],
  month: string,
  settings: Pick<Settings, "profitFirstProfitPct" | "profitFirstOwnerPayPct" | "profitFirstTaxPct">
): ProfitFirstAllocation | null {
  const m = monthlyPnL.find((p) => p.month === month);
  if (!m) return null;

  const clampPct = (v: number | undefined, fallback: number) => Math.min(100, Math.max(0, v ?? fallback));
  const profitPct = clampPct(settings.profitFirstProfitPct, 5);
  const ownerPayPct = clampPct(settings.profitFirstOwnerPayPct, 50);
  const taxPct = clampPct(settings.profitFirstTaxPct, 15);
  const opexPct = Math.max(0, 100 - profitPct - ownerPayPct - taxPct);

  const realRevenue = m.cashSalesRevenue + m.recurringRevenue + m.receivableCollections;

  return {
    month,
    realRevenue,
    profitPct,
    ownerPayPct,
    taxPct,
    opexPct,
    profitTarget: (realRevenue * profitPct) / 100,
    ownerPayTarget: (realRevenue * ownerPayPct) / 100,
    taxTarget: (realRevenue * taxPct) / 100,
    opexTarget: (realRevenue * opexPct) / 100,
    overCommitted: profitPct + ownerPayPct + taxPct >= 100,
  };
}


// entirely off data this app already collects — no leads, no ad-platform
// integration, nothing external:
//   - marketing spend = Expenses already logged under the existing
//     "Marketing" category (see EXPENSE_CATEGORIES), using the same
//     monthly-equivalent normalization the Expenses page already shows for
//     its "spend by category" card, so this figure always agrees with that
//     one rather than becoming a second, disagreeing calculation.
//   - new customers = distinct Sale.customer names whose EARLIEST sale ever
//     (not just earliest in-window) falls inside the trailing window — a
//     returning customer buying again this month doesn't count as newly
//     acquired.
// A lead-to-customer conversion rate isn't computed here — Leads (see
// lib/types.ts) are a separate pre-sale pipeline with their own stage and
// no revenue/COGS impact, so mixing them into a revenue-based function
// would blur what each is measuring. See computeLeadConversion below,
// built off Lead data directly, for that number.
// ---------------------------------------------------------------------------

export interface MarketingMetrics {
  trailingMonths: number;
  marketingSpend: number; // trailing-window total, from the "Marketing" expense category
  newCustomers: number; // distinct customers whose first-ever sale falls in this window
  returningCustomers: number; // distinct customers who bought in this window but first bought earlier
  customerAcquisitionCost: number | null; // marketingSpend / newCustomers, null when newCustomers is 0
  averageCustomerValue: number; // total revenue in window / distinct customers who bought in window
}

export function computeMarketingMetrics(
  sales: Sale[],
  expenses: Expense[],
  windowMonths = 12
): MarketingMetrics {
  const todayIso = localIsoDate();
  const windowStart = addDaysIso(todayIso, -windowMonths * 30);

  const marketingSpend = expenses
    .filter((e) => e.kind === "expense" && e.category === "Marketing")
    .reduce((sum, e) => {
      if (e.isRecurring) {
        // Only count it if it's actually active at some point in the window.
        const activeInWindow = e.startDate <= todayIso && (!e.endDate || e.endDate >= windowStart);
        return activeInWindow ? sum + monthlyNormalizedAmount(e.amount, e.recurrence) * windowMonths : sum;
      }
      return e.startDate >= windowStart && e.startDate <= todayIso ? sum + e.amount : sum;
    }, 0);

  const key = (name: string) => name.trim().toLowerCase();
  const firstSaleByCustomer = new Map<string, string>(); // key -> earliest date, across ALL sales
  for (const s of sales) {
    if (!s.customer) continue;
    const k = key(s.customer);
    const existing = firstSaleByCustomer.get(k);
    if (!existing || s.date < existing) firstSaleByCustomer.set(k, s.date);
  }

  const buyersInWindow = new Map<string, number>(); // key -> revenue in window
  for (const s of sales) {
    if (!s.customer || s.date < windowStart || s.date > todayIso) continue;
    const k = key(s.customer);
    buyersInWindow.set(k, (buyersInWindow.get(k) ?? 0) + s.unitPrice * s.qty);
  }

  let newCustomers = 0;
  let returningCustomers = 0;
  let revenueInWindow = 0;
  for (const [k, revenue] of buyersInWindow) {
    revenueInWindow += revenue;
    const firstSale = firstSaleByCustomer.get(k);
    if (firstSale && firstSale >= windowStart) newCustomers += 1;
    else returningCustomers += 1;
  }

  return {
    trailingMonths: windowMonths,
    marketingSpend,
    newCustomers,
    returningCustomers,
    customerAcquisitionCost: newCustomers > 0 ? marketingSpend / newCustomers : null,
    averageCustomerValue: buyersInWindow.size > 0 ? revenueInWindow / buyersInWindow.size : 0,
  };
}

// ---------------------------------------------------------------------------
// Customer retention & churn — of the customers who were actively buying in
// one window, how many kept buying in the next one. The one customer-side
// KPI the app computed pieces of (new vs. returning, in MarketingMetrics
// above) without ever turning into a churn number: "new vs. returning"
// looks at whether THIS purchase is someone's first ever; retention looks
// at whether someone who was active last period is still active now,
// which is what actually catches a customer quietly drifting away.
//
// Two adjacent windows of `windowMonths` each, both ending at asOfISO:
// the "current" window and the one immediately before it. A customer
// counts as "active" in a window if they have at least one Sale dated
// inside it (matched on Sale.customer the same case-insensitive,
// trimmed way MarketingMetrics does, since that free-text field is the
// only customer identity a Sale carries). Retained = active in both;
// churned = active in the previous window only; new = active in the
// current window only. Defaults to a 3-month window — quarterly is
// usually the shortest period with enough repeat-purchase signal for an
// SME to act on, while trailing-12-month (used elsewhere for CAC, order
// value, etc.) would smooth a real drop-off away for months before it
// showed up here.
// ---------------------------------------------------------------------------

export interface CustomerRetention {
  windowMonths: number;
  currentWindowStart: string; // ISO date
  previousWindowStart: string; // ISO date
  previousActiveCustomers: number;
  currentActiveCustomers: number;
  retainedCustomers: number; // active in both windows
  churnedCustomers: number; // active in the previous window, not in this one
  newCustomers: number; // active in this window, not in the previous one
  retentionRatePct: number | null; // retained / previousActiveCustomers; null when previousActiveCustomers is 0
  churnRatePct: number | null; // churned / previousActiveCustomers; null when previousActiveCustomers is 0
}

export function computeCustomerRetention(sales: Sale[], asOfISO: string, windowMonths = 3): CustomerRetention {
  const currentWindowStart = addDaysIso(asOfISO, -windowMonths * 30);
  const previousWindowStart = addDaysIso(currentWindowStart, -windowMonths * 30);

  const key = (name: string) => name.trim().toLowerCase();
  const currentActive = new Set<string>();
  const previousActive = new Set<string>();
  for (const s of sales) {
    if (!s.customer) continue;
    const k = key(s.customer);
    if (s.date >= currentWindowStart && s.date <= asOfISO) currentActive.add(k);
    else if (s.date >= previousWindowStart && s.date < currentWindowStart) previousActive.add(k);
  }

  let retainedCustomers = 0;
  for (const k of previousActive) {
    if (currentActive.has(k)) retainedCustomers += 1;
  }
  const churnedCustomers = previousActive.size - retainedCustomers;
  let newCustomers = 0;
  for (const k of currentActive) {
    if (!previousActive.has(k)) newCustomers += 1;
  }

  return {
    windowMonths,
    currentWindowStart,
    previousWindowStart,
    previousActiveCustomers: previousActive.size,
    currentActiveCustomers: currentActive.size,
    retainedCustomers,
    churnedCustomers,
    newCustomers,
    retentionRatePct: previousActive.size > 0 ? (retainedCustomers / previousActive.size) * 100 : null,
    churnRatePct: previousActive.size > 0 ? (churnedCustomers / previousActive.size) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Lead conversion — of the leads that came in, how many actually turned into
// paying customers. MarketingMetrics above notes it deliberately doesn't
// compute this (Leads are a separate pipeline, not revenue data); this is
// that number, built directly off Lead.stage and Lead.createdAt instead.
//
// Windowed by Lead.createdAt — the only timestamp a Lead actually carries.
// There's no per-stage-change date, so "decided in the last N months" can't
// be asked, only "created in the last N months, and where does it stand
// today" — same convention as MarketingMetrics' newCustomers and
// ManualOpsSignals' action window above.
//
// Two rates, not one, because they answer different questions:
//   - winRatePct: of leads that have actually been decided (won or lost),
//     what share were won. Ignores still-open leads, so a batch of
//     brand-new leads doesn't drag this down before anyone's had a chance
//     to close them.
//   - conversionRatePct: of every lead that came in, what share became a
//     customer. Includes still-open leads as not-yet-won, so this is the
//     honest "how much of the top of the funnel actually pays" number — it
//     reads low for a fast-growing pipeline full of leads still in
//     progress, which is expected, not a problem.
// Both are null (not 0%) when there's nothing to divide by yet, matching
// this app's convention elsewhere of never showing a misleading 0%.
//
// bySource breaks the same two counts down by Lead.source, falling back to
// "Not recorded" — the same free-text field Customer.leadSource carries
// over once a Lead converts (see Lead.source's doc comment). This sits
// upstream of the "Customers by how they found you" card on the Customers
// page: that one only ever sees leads that already won, so a channel that
// generates plenty of leads but rarely closes them looks fine there and
// only shows up here.
// ---------------------------------------------------------------------------

export interface LeadConversion {
  windowMonths: number;
  windowStart: string; // ISO date
  totalLeads: number; // created within the window, any stage
  wonLeads: number;
  lostLeads: number;
  openLeads: number; // still new/contacted/follow_up/proposal_sent
  winRatePct: number | null; // wonLeads / (wonLeads + lostLeads); null until something's been decided
  conversionRatePct: number | null; // wonLeads / totalLeads; null when totalLeads is 0
  bySource: {
    source: string;
    totalLeads: number;
    wonLeads: number;
    lostLeads: number;
    winRatePct: number | null;
  }[]; // sorted by totalLeads, highest first
}

export function computeLeadConversion(leads: Lead[], asOfISO: string, windowMonths = 6): LeadConversion {
  const windowStart = addDaysIso(asOfISO, -windowMonths * 30);
  const windowStartMs = new Date(windowStart).getTime();
  const inWindow = leads.filter((l) => l.createdAt >= windowStartMs);

  const wonLeads = inWindow.filter((l) => l.stage === "won").length;
  const lostLeads = inWindow.filter((l) => l.stage === "lost").length;
  const decided = wonLeads + lostLeads;

  const bySourceMap = new Map<string, { totalLeads: number; wonLeads: number; lostLeads: number }>();
  for (const l of inWindow) {
    const label = l.source || "Not recorded";
    const entry = bySourceMap.get(label) ?? { totalLeads: 0, wonLeads: 0, lostLeads: 0 };
    entry.totalLeads += 1;
    if (l.stage === "won") entry.wonLeads += 1;
    else if (l.stage === "lost") entry.lostLeads += 1;
    bySourceMap.set(label, entry);
  }
  const bySource = [...bySourceMap.entries()]
    .map(([source, v]) => ({
      source,
      ...v,
      winRatePct: v.wonLeads + v.lostLeads > 0 ? (v.wonLeads / (v.wonLeads + v.lostLeads)) * 100 : null,
    }))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  return {
    windowMonths,
    windowStart,
    totalLeads: inWindow.length,
    wonLeads,
    lostLeads,
    openLeads: inWindow.length - decided,
    winRatePct: decided > 0 ? (wonLeads / decided) * 100 : null,
    conversionRatePct: inWindow.length > 0 ? (wonLeads / inWindow.length) * 100 : null,
    bySource,
  };
}

// ---------------------------------------------------------------------------
// Manual-ops / correction rate — how much of what's happening in the
// business is a normal forward entry versus a manual fix-up after the fact
// (an edited/deleted record, a stock count correction, a bad-debt write-off,
// a customer return). None of these are wrong to have — corrections happen
// in any real business — but a rising share of them is a useful early
// signal: it can mean data entry is sloppy, stock control is leaking, sales
// are being promised that don't hold up, or someone is covering something
// up. This is a signal to look into, not a verdict on its own.
//
// Two separate numbers rather than one blended score, deliberately: a
// correction to the LOG (editing/deleting a record — could be a fraud/error
// signal) is a different kind of thing from an OVERRIDE in the business
// itself (a stock count adjustment, a written-off debt, a customer return —
// normal operational friction). Conflating them into one "manual ops score"
// would hide which of the two is actually happening.
//
// auditLog is capped to the most recent 1000 entries in DataContext (see
// the listener there) — for a very high-volume business the correction
// rate below may undercount the true window if more than 1000 actions of
// ANY kind happened since the window start; fine for the SME volumes this
// app targets, but worth knowing if this ever gets revisited.
export interface ManualOpsSignals {
  windowMonths: number;
  // Log corrections: edits/deletes as a share of all logged actions.
  totalActions: number;
  correctionActions: number; // action === "update" || "delete"
  correctionRatePct: number | null; // null when totalActions is 0
  // Operational overrides: events that are inherently manual fix-ups,
  // regardless of how they were logged.
  stockAdjustmentCount: number;
  writeOffCount: number;
  returnCount: number;
  overrideCount: number; // sum of the three above
}

export function computeManualOpsSignals(
  auditLog: AuditLogEntry[],
  stockAdjustments: StockAdjustment[],
  receivableWriteOffs: ReceivableWriteOff[],
  saleReturns: SaleReturn[],
  asOfISO: string,
  windowMonths = 3
): ManualOpsSignals {
  const windowStart = addDaysIso(asOfISO, -windowMonths * 30);
  const windowStartMs = new Date(windowStart).getTime();

  const actionsInWindow = auditLog.filter((a) => a.at >= windowStartMs);
  const correctionActions = actionsInWindow.filter((a) => a.action === "update" || a.action === "delete").length;

  const inDateWindow = (dateIso: string) => dateIso >= windowStart && dateIso <= asOfISO;
  // "production_use" adjustments (see BomComponent in lib/types.ts) are
  // routine manufacturing activity, not a correction/anomaly — excluded so
  // a manufacturing business's normal production runs don't inflate this
  // risk signal the same way damage/theft/count corrections rightly do.
  const stockAdjustmentCount = stockAdjustments.filter((a) => inDateWindow(a.date) && a.reason !== "production_use").length;
  const writeOffCount = receivableWriteOffs.filter((w) => inDateWindow(w.date)).length;
  const returnCount = saleReturns.filter((r) => inDateWindow(r.date)).length;

  return {
    windowMonths,
    totalActions: actionsInWindow.length,
    correctionActions,
    correctionRatePct: actionsInWindow.length > 0 ? (correctionActions / actionsInWindow.length) * 100 : null,
    stockAdjustmentCount,
    writeOffCount,
    returnCount,
    overrideCount: stockAdjustmentCount + writeOffCount + returnCount,
  };
}

// ---------------------------------------------------------------------------
// Supplier concentration — what share of purchasing is riding on your
// top supplier(s). Built off Purchase.supplier (free text, same field the
// Purchases page already collects), so no new data entry needed. A pure
// risk signal: high concentration isn't wrong, it's just worth knowing
// deliberately rather than discovering it the day that supplier vanishes.
// ---------------------------------------------------------------------------

export interface SupplierConcentration {
  trailingMonths: number;
  totalSpend: number;
  suppliers: { supplier: string; spend: number; sharePct: number }[]; // sorted, highest spend first
  topSupplierSharePct: number | null; // suppliers[0].sharePct, null when no purchases
  top3SharePct: number | null; // sum of top 3 shares, null when no purchases
}

export function computeSupplierConcentration(purchases: Purchase[], windowMonths = 12): SupplierConcentration {
  const todayIso = localIsoDate();
  const windowStart = addDaysIso(todayIso, -windowMonths * 30);

  const bySupplier = new Map<string, number>();
  let totalSpend = 0;
  for (const p of purchases) {
    if (p.date < windowStart || p.date > todayIso) continue;
    // In-house production spend (see recordProduction in DataContext /
    // PRODUCTION_SUPPLIER_LABEL in lib/types.ts) isn't exposure to an
    // external supplier — counting it here would both inflate totalSpend
    // and dilute how concentrated the real supplier risk looks.
    if (p.supplier === PRODUCTION_SUPPLIER_LABEL) continue;
    const name = (p.supplier ?? "").trim() || "Unspecified supplier";
    const spend = p.qty * p.unitCost;
    bySupplier.set(name, (bySupplier.get(name) ?? 0) + spend);
    totalSpend += spend;
  }

  const suppliers = [...bySupplier.entries()]
    .map(([supplier, spend]) => ({ supplier, spend, sharePct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0 }))
    .sort((a, b) => b.spend - a.spend);

  return {
    trailingMonths: windowMonths,
    totalSpend,
    suppliers,
    topSupplierSharePct: suppliers.length > 0 ? suppliers[0].sharePct : null,
    top3SharePct: suppliers.length > 0 ? suppliers.slice(0, 3).reduce((s, x) => s + x.sharePct, 0) : null,
  };
}

// ---------------------------------------------------------------------------
// Customer concentration — the sell-side mirror of computeSupplierConcentration
// above. What share of revenue rides on one buyer: the other half of "one
// supplier/buyer channel is a channel risk" — losing your biggest customer
// wipes cash flow the same way losing your only supplier does, and it's the
// more common way a small service/B2B business actually gets hurt. Built off
// Sale.customer (free text, same field Sales/the Customers directory already
// collect), so no new data entry needed.
// ---------------------------------------------------------------------------

export interface CustomerConcentration {
  trailingMonths: number;
  totalRevenue: number;
  customers: { customer: string; revenue: number; sharePct: number }[]; // sorted, highest revenue first
  topCustomerSharePct: number | null; // customers[0].sharePct, null when no sales with a customer name
  top3SharePct: number | null; // sum of top 3 shares, null when no sales with a customer name
}

export function computeCustomerConcentration(sales: Sale[], windowMonths = 12): CustomerConcentration {
  const todayIso = localIsoDate();
  const windowStart = addDaysIso(todayIso, -windowMonths * 30);

  const byCustomer = new Map<string, number>();
  let totalRevenue = 0;
  for (const s of sales) {
    if (s.date < windowStart || s.date > todayIso) continue;
    const name = (s.customer ?? "").trim();
    if (!name) continue; // walk-in/unnamed sales don't represent a "channel" to be concentrated in
    const revenue = s.qty * s.unitPrice;
    byCustomer.set(name, (byCustomer.get(name) ?? 0) + revenue);
    totalRevenue += revenue;
  }

  const customers = [...byCustomer.entries()]
    .map(([customer, revenue]) => ({ customer, revenue, sharePct: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    trailingMonths: windowMonths,
    totalRevenue,
    customers,
    topCustomerSharePct: customers.length > 0 ? customers[0].sharePct : null,
    top3SharePct: customers.length > 0 ? customers.slice(0, 3).reduce((s, x) => s + x.sharePct, 0) : null,
  };
}

// ---------------------------------------------------------------------------
// Cash runway / "can I make rent" projection. Starts from today's actual
// cash position (the same derived cash figure the Balance Sheet uses, so
// this is never a second, disagreeing source of truth) and walks forward
// day by day to a target date, applying every scheduled cash movement that
// has an actual date attached — loan payments (exact, from the
// amortization schedule), rent and recurring expenses/payroll (projected
// onto the specific days they recur on), and expected receivable
// collections (assumed to land on their due date, which is optimistic but
// is the only defensible assumption without a track record of how late
// customers actually pay). A flat estimated daily cash-sales inflow fills
// the gaps — this is a planning tool, not a guarantee.
// ---------------------------------------------------------------------------

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// Does a recurring item (rent, payroll, a recurring expense) land on this
// specific calendar day, given the day-of-month/week it started on? Handles
// the month-end edge case (e.g. something that starts on the 31st falls on
// the last day of shorter months) the same way computeLoanSchedule's
// addMonthsIso does.
export function recurrenceLandsOn(anchorIso: string, recurrence: Recurrence, targetIso: string): boolean {
  if (targetIso < anchorIso) return false;
  const [ay, am, ad] = anchorIso.split("-").map(Number);
  const [ty, tm, td] = targetIso.split("-").map(Number);
  switch (recurrence) {
    case "monthly": {
      const lastDayOfTargetMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
      const effectiveDay = Math.min(ad, lastDayOfTargetMonth);
      return td === effectiveDay;
    }
    case "weekly": {
      const anchorDow = new Date(Date.UTC(ay, am - 1, ad)).getUTCDay();
      const targetDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
      return anchorDow === targetDow;
    }
    case "yearly":
      return am === tm && ad === td;
    case "none":
      return anchorIso === targetIso;
  }
}

export interface CashRunwayDay {
  date: string;
  inflow: number;
  outflow: number;
  // v192b: the part of outflow that is already committed: bills and payables due, loan installments, pay, recurring costs and rent.
  // Money the business owes before it can choose anything else (see lib/cashAllocation.ts).
  committed: number;
  balance: number;
  events: string[]; // human-readable line items that moved cash this day
}

export interface CashRunwayResult {
  asOf: string;
  startingCash: number;
  rentDueDate: string;
  rentAmount: number;
  days: CashRunwayDay[];
  cashAtRentDue: number;
  canMakeRent: boolean;
  shortfall: number; // 0 if canMakeRent, else how much short
  lowestBalance: number;
  lowestBalanceDate: string;
  // Customer invoices already due or overdue. The projection cautiously does NOT count them as money coming in
  // (nobody knows when a late payer will pay), but the owner should see how much is being left out.
  overdueCustomersTotal: number;
  overdueCustomersCount: number;
}

export function computeCashRunway(params: {
  asOf: string;
  startingCash: number;
  horizonDays: number;
  estimatedDailyCashSales: number; 
  rentAmount: number;
  rentDueDayOfMonth: number;
  loans: Loan[];
  employees: Employee[];
  expenses: Expense[];
  receivables: ReceivableLine[];
  // Accepts PayableLine (supplier credit purchases) and/or BillPayableLine
  // (general bills) shaped objects — anything with a dueDate,
  // amountOutstanding, and either field to label the event with. Callers
  // typically pass payablesAging.lines and billsPayable.lines combined, so
  // a bill's due date shows up in the projection exactly like a supplier's
  // does.
  payables?: Array<{ dueDate: string; amountOutstanding: number; supplier?: string; payee?: string }>;
  currency: string;
}): CashRunwayResult {
  const { asOf, startingCash, horizonDays, estimatedDailyCashSales, rentAmount, rentDueDayOfMonth, loans, employees, expenses, receivables, payables = [] } = params;

  // Next occurrence of the rent due day, strictly after today. Walks forward
  // day by day (at most ~31 iterations) rather than doing month arithmetic,
  // so the "clamp to the last day of a short month" edge case (rent due day
  // 31, checking February) falls out for free: day 31 just never matches
  // and the search rolls into the next month, same as a calendar would.
  let rentDueDate = addDaysIso(asOf, 1);
  for (let i = 1; i <= 31; i++) {
    const candidate = addDaysIso(asOf, i);
    const [, , cd] = candidate.split("-").map(Number);
    const daysInThisMonth = new Date(Date.UTC(Number(candidate.slice(0, 4)), Number(candidate.slice(5, 7)), 0)).getUTCDate();
    const targetDay = Math.min(rentDueDayOfMonth, daysInThisMonth);
    if (cd === targetDay) {
      rentDueDate = candidate;
      break;
    }
  }

  const allLoanPayments = loans.filter((l) => l.active).flatMap((l) => computeLoanSchedule(l).map((p) => ({ ...p, loanName: l.name })));

  const days: CashRunwayDay[] = [];
  let balance = startingCash;
  let lowestBalance = startingCash;
  let lowestBalanceDate = asOf;

  for (let i = 1; i <= horizonDays; i++) {
    const date = addDaysIso(asOf, i);
    const events: string[] = [];
    let inflow = estimatedDailyCashSales;
    let outflow = 0;
    let committed = 0;

    for (const r of receivables) {
      if (r.dueDate === date) {
        inflow += r.amountOutstanding;
        events.push(`${r.customer} payment due (${r.amountOutstanding.toLocaleString()})`);
      }
    }

    for (const p of payables) {
      // A bill that is already due (or overdue) is money you still owe: it leaves tomorrow at the latest. Looking
      // only at future due dates used to drop it entirely, which made the squeeze look smaller than it is.
      const alreadyDue = p.dueDate <= asOf;
      if ((alreadyDue ? addDaysIso(asOf, 1) : p.dueDate) === date) {
        outflow += p.amountOutstanding;
        committed += p.amountOutstanding;
        events.push(`${p.supplier ?? p.payee ?? "Bill"} ${alreadyDue ? "overdue, pay now" : "payment due"} (${p.amountOutstanding.toLocaleString()})`);
      }
    }

    for (const lp of allLoanPayments) {
      if (lp.date === date) {
        outflow += lp.payment;
        committed += lp.payment;
        events.push(`${lp.loanName} installment`);
      }
    }

    for (const e of employees) {
      if (!e.active) continue;
      if (recurrenceLandsOn(e.startDate, e.payFrequency, date)) {
        outflow += e.payRate;
        committed += e.payRate;
        events.push(`Payroll: ${e.name}`);
      }
    }

    for (const ex of expenses) {
      if (ex.kind !== "expense" || !ex.isRecurring || ex.recurrence === "none") continue;
      if (ex.endDate && date > ex.endDate) continue;
      if (recurrenceLandsOn(ex.startDate, ex.recurrence, date)) {
        outflow += ex.amount;
        committed += ex.amount;
        events.push(ex.name);
      }
    }

    if (date === rentDueDate && rentAmount > 0) {
      outflow += rentAmount;
      committed += rentAmount;
      events.push("Rent");
    }

    balance = balance + inflow - outflow;
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }
    days.push({ date, inflow, outflow, committed, balance, events });
  }

  const lateCustomers = receivables.filter((r) => r.dueDate <= asOf && r.amountOutstanding > 0);
  const rentDueDay = days.find((d) => d.date === rentDueDate);
  const cashAtRentDue = rentDueDay ? rentDueDay.balance : balance;
  const canMakeRent = cashAtRentDue >= 0;

  return {
    asOf,
    startingCash,
    rentDueDate,
    rentAmount,
    days,
    cashAtRentDue,
    canMakeRent,
    shortfall: canMakeRent ? 0 : Math.abs(cashAtRentDue),
    lowestBalance,
    lowestBalanceDate,
    overdueCustomersTotal: lateCustomers.reduce((t, r) => t + r.amountOutstanding, 0),
    overdueCustomersCount: lateCustomers.length,
  };
}

// Fixed asset depreciation calculation
export interface FixedAssetStatus {
  asset: FixedAsset;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthlyDepreciation: number;
  fullyDepreciated: boolean;
  disposed: boolean;
  monthsDepreciated: number;
}

export function computeFixedAssetStatus(asset: FixedAsset, asOfISO: string): FixedAssetStatus {
  const disposed = !!asset.disposalDate;
  const effectiveEndDate = asset.disposalDate || asOfISO;

  // Calculate months between purchase date and effective end date
  const [py, pm] = asset.purchaseDate.split("-").map(Number);
  const [ey, em] = effectiveEndDate.split("-").map(Number);

  const purchaseMonth = py * 12 + (pm - 1);
  const endMonth = ey * 12 + (em - 1);
  const monthsDepreciated = Math.max(0, endMonth - purchaseMonth + 1);

  const depreciableAmount = asset.cost - (asset.salvageValue || 0);

  // Reducing balance: a fixed share of whatever book value is left is written off each year (spread over
  // the months, compounding), floored at salvage. Same month-counting as straight-line (the purchase month
  // is month 1), so accumulated depreciation still reconciles with the Balance Sheet and monthly totals.
  const ratePct = asset.reducingRatePct ?? 0;
  // v256: impairments recorded on or before the as-of date are written off in full on the day they are recorded (a non-cash charge), so they appear in
  // that month's depreciation line, and reduce the book value on the balance sheet, in the same way.
  const impaired = Math.min(asset.cost, (asset.impairments ?? []).filter((i) => i.date <= asOfISO).reduce((t, i) => t + i.amount, 0));
  if (asset.depreciationMethod === "reducing_balance" && ratePct > 0) {
    const salvage = asset.salvageValue || 0;
    const monthlyRate = 1 - Math.pow(1 - Math.min(ratePct, 100) / 100, 1 / 12);
    const nbvAfter = (n: number) => Math.max(salvage, asset.cost * Math.pow(1 - monthlyRate, n));
    const nbv = Math.max(0, nbvAfter(monthsDepreciated) - impaired);
    const latest = Math.max(monthsDepreciated, 1);
    return {
      asset,
      accumulatedDepreciation: asset.cost - nbv,
      netBookValue: nbv,
      monthlyDepreciation: nbvAfter(latest - 1) - nbvAfter(latest), // the current month's charge
      fullyDepreciated: nbv <= salvage + 0.005,
      disposed,
      monthsDepreciated,
    };
  }

  const monthlyDepreciation = depreciableAmount / asset.usefulLifeMonths;

  const accumulatedDepreciation = Math.min(
    asset.cost,
    Math.min(depreciableAmount, monthlyDepreciation * monthsDepreciated) + impaired
  );

  const netBookValue = asset.cost - accumulatedDepreciation;
  const fullyDepreciated = Math.min(depreciableAmount, monthlyDepreciation * monthsDepreciated) >= depreciableAmount;

  return {
    asset,
    accumulatedDepreciation,
    netBookValue,
    monthlyDepreciation,
    fullyDepreciated,
    disposed,
    monthsDepreciated,
  };
}

function monthEndIso(mKey: string): string {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function previousMonthKey(mKey: string): string {
  const [y, m] = mKey.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface FixedAssetMonthlyTotals {
  depreciation: number; // non-cash expense for the month
  purchaseCash: number; // cash paid to acquire assets, this month
  disposalProceeds: number; // cash received on disposal, this month
  disposalGainLoss: number; // disposalProceeds - net book value at disposal
}

// Per-month depreciation, acquisition cash, and disposal cash/gain-loss for
// the fixed asset register, aggregated across the whole portfolio. This is
// what feeds the non-cash depreciation line (and disposal gain/loss) into
// the Income Statement, and the acquisition/disposal cash into the Cash
// Flow Statement's investing section — for every month in `months`.
// Depreciation per month is derived from computeFixedAssetStatus's
// accumulated-depreciation figure (month-end minus prior month-end) so it
// always reconciles exactly with the net book value shown on the Balance
// Sheet and on the Fixed Assets page, however many months are summed.
export function computeFixedAssetMonthlyTotals(
  fixedAssets: FixedAsset[],
  months: string[]
): Map<string, FixedAssetMonthlyTotals> {
  const map = new Map<string, FixedAssetMonthlyTotals>();
  const bump = (key: string, delta: Partial<FixedAssetMonthlyTotals>) => {
    const cur = map.get(key) ?? { depreciation: 0, purchaseCash: 0, disposalProceeds: 0, disposalGainLoss: 0 };
    map.set(key, {
      depreciation: cur.depreciation + (delta.depreciation ?? 0),
      purchaseCash: cur.purchaseCash + (delta.purchaseCash ?? 0),
      disposalProceeds: cur.disposalProceeds + (delta.disposalProceeds ?? 0),
      disposalGainLoss: cur.disposalGainLoss + (delta.disposalGainLoss ?? 0),
    });
  };

  for (const asset of fixedAssets) {
    const purchaseMonth = monthKey(asset.purchaseDate);
    bump(purchaseMonth, { purchaseCash: asset.cost });

    const disposalMonth = asset.disposalDate ? monthKey(asset.disposalDate) : null;

    for (const month of months) {
      if (month < purchaseMonth) continue;
      if (disposalMonth && month > disposalMonth) continue;

      const asOfThisMonth = disposalMonth === month ? asset.disposalDate! : monthEndIso(month);
      const accumThisMonth = computeFixedAssetStatus(asset, asOfThisMonth).accumulatedDepreciation;

      const prevKey = previousMonthKey(month);
      const accumPrev =
        prevKey < purchaseMonth ? 0 : computeFixedAssetStatus(asset, monthEndIso(prevKey)).accumulatedDepreciation;

      bump(month, { depreciation: accumThisMonth - accumPrev });
    }

    if (disposalMonth) {
      const statusAtDisposal = computeFixedAssetStatus(asset, asset.disposalDate!);
      const proceeds = asset.disposalAmount ?? 0;
      bump(disposalMonth, {
        disposalProceeds: proceeds,
        disposalGainLoss: proceeds - statusAtDisposal.netBookValue,
      });
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Project / job costing. Rolls a project's manual cost segments together
// with any Purchase/Expense/Sale tagged to it (via their optional
// `projectId`) into one picture: quoted price vs. actual cost vs. invoiced
// to date. Nothing here touches inventory/WAC, MRR, or the P&L — a
// project's costs live wherever they already lived (a tagged Purchase still
// affects inventory and COGS exactly as before); this is purely an
// additional lens over the same data plus the segments that don't fit
// anywhere else.
// ---------------------------------------------------------------------------

export interface ProjectCostCategoryTotal {
  category: string;
  amount: number;
}

export interface ProjectFinancials {
  projectId: string;
  segmentCost: number; // sum of this project's manual ProjectCostSegment amounts
  purchaseCost: number; // sum of qty*unitCost for Purchases tagged to this project
  expenseCost: number; // sum of amount for Expenses tagged to this project
  laborCost: number; // sum of hours*hourlyRate for closed, billable TimeEntries tagged to this project
  laborHours: number; // sum of hours for closed TimeEntries tagged to this project (billable or not, for visibility)
  totalCost: number; // segmentCost + purchaseCost + expenseCost + laborCost
  quotedPrice: number;
  profit: number; // quotedPrice - totalCost
  marginPct: number | null; // profit / quotedPrice * 100, null if quotedPrice is 0
  budgetUsedPct: number | null; // totalCost / quotedPrice * 100, null if quotedPrice is 0
  invoicedToDate: number; // sum of revenue for Sales tagged to this project — cash/billing progress, separate from the margin calc above
  costByCategory: ProjectCostCategoryTotal[]; // segments (own category) + tagged purchases ("Materials (purchases)") + tagged expenses (own category) + tagged labor ("Labor (time entries)"), sorted desc
}

export function computeProjectFinancials(
  project: Project,
  costSegments: ProjectCostSegment[],
  purchases: Purchase[],
  expenses: Expense[],
  sales: Sale[],
  timeEntries: TimeEntry[] = []
): ProjectFinancials {
  const segs = costSegments.filter((s) => s.projectId === project.id);
  const segmentCost = segs.reduce((sum, s) => sum + s.amount, 0);

  const linkedPurchases = purchases.filter((p) => p.projectId === project.id);
  const purchaseCost = linkedPurchases.reduce((sum, p) => sum + p.unitCost * p.qty, 0);

  const linkedExpenses = expenses.filter((e) => e.projectId === project.id && e.kind === "expense");
  const expenseCost = linkedExpenses.reduce((sum, e) => sum + e.amount, 0);

  const linkedSales = sales.filter((s) => s.projectId === project.id);
  const invoicedToDate = linkedSales.reduce((sum, s) => sum + s.unitPrice * s.qty, 0);

  // Only entries that are actually finished (clockOut set) have a settled
  // duration; a still-running clock-in has no end time to cost out yet.
  // Only billable entries with a snapshotted hourlyRate contribute a dollar
  // cost — a non-billable or unrated entry still counts toward laborHours
  // (so the hours worked are visible) but adds nothing to totalCost, same
  // as it always could add nothing if never entered as a segment either.
  const linkedTimeEntries = timeEntries.filter((t) => t.projectId === project.id && t.clockOut);
  const laborHours = linkedTimeEntries.reduce((sum, t) => sum + (t.clockOut! - t.clockIn) / 3600000, 0);
  const laborCost = linkedTimeEntries
    .filter((t) => t.billable && t.hourlyRate)
    .reduce((sum, t) => sum + ((t.clockOut! - t.clockIn) / 3600000) * (t.hourlyRate ?? 0), 0);

  const totalCost = segmentCost + purchaseCost + expenseCost + laborCost;
  const profit = project.quotedPrice - totalCost;
  const marginPct = project.quotedPrice > 0 ? (profit / project.quotedPrice) * 100 : null;
  const budgetUsedPct = project.quotedPrice > 0 ? (totalCost / project.quotedPrice) * 100 : null;

  const catMap = new Map<string, number>();
  for (const s of segs) {
    const key = s.category || "Other";
    catMap.set(key, (catMap.get(key) ?? 0) + s.amount);
  }
  if (purchaseCost > 0) {
    catMap.set("Materials (purchases)", (catMap.get("Materials (purchases)") ?? 0) + purchaseCost);
  }
  for (const e of linkedExpenses) {
    const key = e.category || "Other";
    catMap.set(key, (catMap.get(key) ?? 0) + e.amount);
  }
  if (laborCost > 0) {
    catMap.set("Labor (time entries)", (catMap.get("Labor (time entries)") ?? 0) + laborCost);
  }

  const costByCategory = Array.from(catMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    projectId: project.id,
    segmentCost,
    purchaseCost,
    expenseCost,
    laborCost,
    laborHours,
    totalCost,
    quotedPrice: project.quotedPrice,
    profit,
    marginPct,
    budgetUsedPct,
    invoicedToDate,
    costByCategory,
  };
}

export function computeAllProjectFinancials(
  projects: Project[],
  costSegments: ProjectCostSegment[],
  purchases: Purchase[],
  expenses: Expense[],
  sales: Sale[],
  timeEntries: TimeEntry[] = []
): Map<string, ProjectFinancials> {
  const map = new Map<string, ProjectFinancials>();
  for (const p of projects) {
    map.set(p.id, computeProjectFinancials(p, costSegments, purchases, expenses, sales, timeEntries));
  }
  return map;
}

// Portfolio-level roll-up across every active (not completed/cancelled)
// project — the numbers a "Projects" list page leads with.
export interface ProjectPortfolioSummary {
  activeCount: number;
  totalQuotedActive: number;
  totalCostActive: number;
  totalProfitActive: number;
  overBudgetCount: number; // active projects where totalCost > quotedPrice
}

export function computeProjectPortfolioSummary(
  projects: Project[],
  financials: Map<string, ProjectFinancials>
): ProjectPortfolioSummary {
  let activeCount = 0;
  let totalQuotedActive = 0;
  let totalCostActive = 0;
  let totalProfitActive = 0;
  let overBudgetCount = 0;

  for (const p of projects) {
    if (p.status === "completed" || p.status === "cancelled") continue;
    const f = financials.get(p.id);
    if (!f) continue;
    activeCount += 1;
    totalQuotedActive += f.quotedPrice;
    totalCostActive += f.totalCost;
    totalProfitActive += f.profit;
    if (f.totalCost > f.quotedPrice && f.quotedPrice > 0) overBudgetCount += 1;
  }

  return { activeCount, totalQuotedActive, totalCostActive, totalProfitActive, overBudgetCount };
}

// The actual list behind ProjectPortfolioSummary.overBudgetCount — every
// active (not completed/cancelled) project that's at or past a budget
// threshold, worst first. This is what surfaces "3 projects over budget" on
// the Dashboard and drives the budget-threshold notifications, rather than
// requiring a visit to the Projects page to notice.
export interface ProjectBudgetAlert {
  projectId: string;
  name: string;
  client?: string;
  status: ProjectStatus;
  totalCost: number;
  quotedPrice: number;
  budgetUsedPct: number;
  isOverBudget: boolean; // true once budgetUsedPct > 100, vs. just "approaching" at the warn threshold
}

export function computeProjectBudgetAlerts(
  projects: Project[],
  financials: Map<string, ProjectFinancials>,
  warnThresholdPct: number = 90
): ProjectBudgetAlert[] {
  const alerts: ProjectBudgetAlert[] = [];
  for (const p of projects) {
    if (p.status === "completed" || p.status === "cancelled") continue;
    if (p.quotedPrice <= 0) continue;
    const f = financials.get(p.id);
    if (!f || f.budgetUsedPct === null) continue;
    if (f.budgetUsedPct < warnThresholdPct) continue;
    alerts.push({
      projectId: p.id,
      name: p.name,
      client: p.client,
      status: p.status,
      totalCost: f.totalCost,
      quotedPrice: f.quotedPrice,
      budgetUsedPct: f.budgetUsedPct,
      isOverBudget: f.budgetUsedPct > 100,
    });
  }
  return alerts.sort((a, b) => b.budgetUsedPct - a.budgetUsedPct);
}

// ---------------------------------------------------------------------------
// Progress-billing schedule roll-up for a single project's milestones — the
// number behind "how much of the quote has been scheduled/invoiced/paid so
// far", used on the Project detail view and to sanity-check that a
// milestone schedule actually adds up to the quoted price.
// ---------------------------------------------------------------------------
export interface MilestoneSummary {
  scheduledTotal: number; // sum of every milestone's amount, regardless of status
  invoicedTotal: number; // sum of amounts for milestones marked invoiced or paid
  paidTotal: number; // sum of amounts for milestones marked paid
  outstandingInvoiced: number; // invoicedTotal - paidTotal — billed but not yet collected
  unscheduled: number; // quotedPrice - scheduledTotal — what's left to put on the schedule (can be negative if over-scheduled)
}

export function summarizeMilestones(milestones: ProjectMilestone[], quotedPrice: number): MilestoneSummary {
  let scheduledTotal = 0;
  let invoicedTotal = 0;
  let paidTotal = 0;
  for (const m of milestones) {
    scheduledTotal += m.amount;
    if (m.status === "invoiced" || m.status === "paid") invoicedTotal += m.amount;
    if (m.status === "paid") paidTotal += m.amount;
  }
  return {
    scheduledTotal,
    invoicedTotal,
    paidTotal,
    outstandingInvoiced: invoicedTotal - paidTotal,
    unscheduled: quotedPrice - scheduledTotal,
  };
}

// Milestones with a dueDate that's overdue or coming up soon and haven't
// been paid yet — the progress-billing counterpart to receivables aging.
// Deliberately excludes "paid" milestones (nothing left to chase) but
// includes "invoiced" ones (billed but not yet collected is exactly the
// case worth a reminder for), same as how an overdue receivable is tracked
// regardless of whether an invoice was formally issued.
export interface MilestoneReminder {
  milestoneId: string;
  projectId: string;
  projectName: string;
  label: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number; // negative when overdue
  isOverdue: boolean;
}

export function computeMilestoneReminders(
  projects: Project[],
  milestones: ProjectMilestone[],
  todayIsoDate: string,
  daysAhead: number = 7
): MilestoneReminder[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const today = new Date(todayIsoDate).getTime();
  const reminders: MilestoneReminder[] = [];
  for (const m of milestones) {
    if (m.status === "paid" || !m.dueDate) continue;
    const due = new Date(m.dueDate).getTime();
    const daysUntilDue = Math.round((due - today) / 86400000);
    if (daysUntilDue > daysAhead) continue;
    const project = projectById.get(m.projectId);
    if (!project || project.status === "cancelled") continue;
    reminders.push({
      milestoneId: m.id,
      projectId: m.projectId,
      projectName: project.name,
      label: m.label,
      amount: m.amount,
      dueDate: m.dueDate,
      daysUntilDue,
      isOverdue: daysUntilDue < 0,
    });
  }
  return reminders.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// ---------------------------------------------------------------------------
// Unit Economics for Customer Analysis
// ---------------------------------------------------------------------------

export interface CustomerUnitEconomics {
  customerId: string;
  customerName: string;
  cac: number | null; // Customer Acquisition Cost
  totalRevenue: number;
  totalContributionMargin: number;
  transactionCount: number;
  arpu: number; // Average Revenue Per User
  customerLifetimeMonths: number; // Customer Lifetime in months
  ltv: number; // Customer Lifetime Value
  ltvCacRatio: number | null; // LTV:CAC Ratio
  cacPaybackPeriodMonths: number | null; // CAC Payback Period in months
  contributionMarginRatio: number; // Contribution Margin Ratio
  breakEvenMonths: number | null; // Break-Even Point in months (time to recover CAC)
  preTaxCashFlow: number; // Pre-Tax Cash Flow (total contribution margin from this customer)
}

export function computeCustomerUnitEconomics(
  customer: Customer,
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  _asOfISO: string
): CustomerUnitEconomics {
  const key = (name: string) => name.trim().toLowerCase();
  const customerKey = key(customer.name);
  
  // Filter sales for this customer
  const customerSales = sales.filter((s) => s.customer && key(s.customer) === customerKey);
  
  // Get economics for these sales
  const economicsBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
  const customerEconomics = customerSales
    .map((s) => economicsBySaleId.get(s.id))
    .filter((e): e is SaleEconomics => e !== undefined);
  
  // Calculate totals
  const totalRevenue = customerEconomics.reduce((sum, e) => sum + e.revenue, 0);
  const totalContributionMargin = customerEconomics.reduce((sum, e) => sum + e.contributionMargin, 0);
  const transactionCount = customerSales.length;

  // Customer Lifetime: time from first to last sale in months
  const dates = customerSales.map((s) => new Date(s.date).getTime()).sort((a, b) => a - b);
  const customerLifetimeMonths = dates.length >= 2 
    ? Math.max(1, Math.round((dates[dates.length - 1] - dates[0]) / (30 * 24 * 60 * 60 * 1000)))
    : dates.length === 1 ? 1 : 0;

  // ARPU: Average Revenue Per User, per MONTH — deliberately totalRevenue
  // divided by the customer's active months, not by transaction count.
  // The LTV formula below multiplies ARPU by a number of *months*, so ARPU
  // has to already be a monthly rate or the units don't line up: dividing
  // by transactionCount instead gives an average-order-value figure, and
  // multiplying THAT by a month count produced an LTV that swung several-
  // fold in either direction purely based on how many separate purchases
  // happened to fall inside the observed window — e.g. 10 purchases across
  // 2 months previously understated LTV to a fifth of the customer's
  // actual earned contribution margin, while 2 purchases across 10 months
  // overstated it fivefold. Neither error reflected anything real about
  // the customer.
  const arpu = customerLifetimeMonths > 0 ? totalRevenue / customerLifetimeMonths : totalRevenue;
  
  // Contribution Margin Ratio
  const contributionMarginRatio = totalRevenue > 0 ? totalContributionMargin / totalRevenue : 0;
  
  // LTV: Customer Lifetime Value = ARPU × Customer Lifetime × Contribution Margin Ratio.
  // With ARPU now correctly a monthly rate, this multiplies back out to
  // totalRevenue × contributionMarginRatio — i.e. the contribution margin
  // actually earned from this customer so far. That's intentional: with
  // no churn-rate or subscription-renewal data to project a *future*
  // lifetime from, this is a historical/realized LTV ("value earned to
  // date"), not a predictive one — the same reading as Pre-Tax Cash Flow
  // below, arrived at independently via the standard ARPU × margin ×
  // lifetime formula. Businesses that want a forward-looking projection
  // need an assumed retention period, which isn't derivable from this data.
  const ltv = arpu * customerLifetimeMonths * contributionMarginRatio;
  
  // CAC from customer record
  const cac = customer.cac ?? null;
  
  // LTV:CAC Ratio
  const ltvCacRatio = cac && cac > 0 ? ltv / cac : null;
  
  // CAC Payback Period = CAC / (ARPU × Contribution Margin Ratio)
  const monthlyContributionMargin = arpu * contributionMarginRatio;
  const cacPaybackPeriodMonths = cac && monthlyContributionMargin > 0 ? cac / monthlyContributionMargin : null;
  
  // Break-Even Point: time to recover CAC (same as CAC Payback Period in this context)
  const breakEvenMonths = cacPaybackPeriodMonths;
  
  // Pre-Tax Cash Flow: total contribution margin from this customer
  const preTaxCashFlow = totalContributionMargin;
  
  return {
    customerId: customer.id,
    customerName: customer.name,
    cac,
    totalRevenue,
    totalContributionMargin,
    transactionCount,
    arpu,
    customerLifetimeMonths,
    ltv,
    ltvCacRatio,
    cacPaybackPeriodMonths,
    contributionMarginRatio,
    breakEvenMonths,
    preTaxCashFlow,
  };
}

export function computeAllCustomerUnitEconomics(
  customers: Customer[],
  sales: Sale[],
  saleEconomics: SaleEconomics[],
  asOfISO: string
): CustomerUnitEconomics[] {
  return customers
    .map((c) => computeCustomerUnitEconomics(c, sales, saleEconomics, asOfISO))
    .filter((e) => e.transactionCount > 0); // Only include customers with actual sales
}

// ---------------------------------------------------------------------------
// Bank reconciliation matching. No bank feed, no external aggregator — this
// takes the manually-entered/CSV-imported BankStatementLine rows and the
// book records that could plausibly have caused them, and suggests
// candidates. The person still clicks "this is the match"; nothing here
// writes a match on its own. See BankStatementLine in lib/types.ts.
//
// Only "cash-out-of-the-bank" record types are considered: Sale/Purchase
// paid by card or bank_transfer (cash sales/purchases never touch a bank
// statement), ReceivablePayment/PayablePayment by the same two methods,
// CapitalEntry (owner injections/withdrawals — assumed to move through the
// bank, since there's no method field to check), and one-off Expenses
// (recurring flat expenses are deliberately excluded — see the comment on
// computeMRR/expenseTotalsForMonth: they don't have a discrete per-month
// record to point at, so there's nothing concrete to suggest as a match).
// ---------------------------------------------------------------------------

export interface CashLedgerCandidate {
  type: "sale" | "purchase" | "expense" | "receivablePayment" | "payablePayment" | "billPayment" | "capital" | "supplierReturn" | "supplierCredit" | "customerDeposit";
  id: string;
  date: string; // ISO date
  label: string;
  amount: number; // positive = cash in, negative = cash out
}

export function computeCashLedgerCandidates(params: {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  receivablePayments: ReceivablePayment[];
  payablePayments: PayablePayment[];
  billPayments?: BillPayment[];
  capitalEntries: CapitalEntry[];
  // Goods sent back to suppliers. Only a "refund" is cash (a supplier paying
  // you back, goods + the tax on them, by bank/card); "reduce_payable" and cash refunds are not bank lines.
  supplierReturns?: SupplierReturn[];
  // Supplier credit: a deposit paid by bank/card is money out, a credit refund by bank/card is money in. Using credit
  // on a bill and credit from a return move no money, so they are never bank lines.
  supplierCredits?: SupplierCreditEntry[];
  // Customer deposits: one received by bank/card is money in, one refunded by bank/card is money out. Applying a
  // deposit to an invoice moves no money, so it is never a bank line.
  customerDeposits?: CustomerDepositEntry[];
}): CashLedgerCandidate[] {
  const { sales, purchases, expenses, receivablePayments, payablePayments, billPayments = [], capitalEntries, supplierReturns = [], supplierCredits = [], customerDeposits = [] } = params;
  const candidates: CashLedgerCandidate[] = [];
  const bankish = (m?: string) => m === "card" || m === "bank_transfer";

  for (const s of sales) {
    if (!bankish(s.paymentMethod)) continue;
    candidates.push({
      type: "sale",
      id: s.id,
      date: s.date,
      label: s.customer ? `Sale to ${s.customer}` : "Sale",
      amount: s.unitPrice * s.qty + (s.taxAmount ?? 0),
    });
  }
  for (const p of purchases) {
    if (!bankish(p.paymentMethod)) continue;
    candidates.push({
      type: "purchase",
      id: p.id,
      date: p.date,
      label: p.supplier ? `Purchase from ${p.supplier}` : "Purchase",
      amount: -(p.unitCost * p.qty + (p.taxAmount ?? 0)),
    });
  }
  for (const e of expenses) {
    if (e.isRecurring) continue; // no discrete per-month record to point at — see doc comment above
    if (e.kind === "expense" && e.paymentStatus === "unpaid") continue; // not cash yet — the eventual BillPayment is the candidate, not this
    candidates.push({ type: "expense", id: e.id, date: e.startDate, label: e.name, amount: e.kind === "revenue" ? e.amount : -e.amount });
  }
  for (const rp of receivablePayments) {
    if (!bankish(rp.method)) continue;
    candidates.push({ type: "receivablePayment", id: rp.id, date: rp.date, label: "Customer payment received", amount: rp.amount });
  }
  for (const pp of payablePayments) {
    if (!bankish(pp.method)) continue;
    candidates.push({ type: "payablePayment", id: pp.id, date: pp.date, label: "Supplier payment sent", amount: -pp.amount });
  }
  for (const bp of billPayments) {
    if (!bankish(bp.method)) continue;
    candidates.push({ type: "billPayment", id: bp.id, date: bp.date, label: "Bill payment sent", amount: -bp.amount });
  }
  for (const r of supplierReturns) {
    if (r.settlement !== "refund" || !bankish(r.refundMethod)) continue; // a cash refund never reaches a bank statement
    candidates.push({
      type: "supplierReturn",
      id: r.id,
      date: r.date,
      label: r.supplier ? `Refund from ${r.supplier}` : "Supplier refund",
      amount: r.creditAmount + (r.taxAmount ?? 0),
    });
  }
  for (const c of supplierCredits) {
    if (c.kind === "applied" || !bankish(c.method)) continue; // using credit moves no money; a cash movement never reaches a bank statement
    candidates.push({
      type: "supplierCredit",
      id: c.id,
      date: c.date,
      label: c.kind === "deposit" ? `Deposit paid to ${c.supplier}` : `Credit refunded by ${c.supplier}`,
      amount: c.kind === "deposit" ? -c.amount : c.amount,
    });
  }
  for (const d of customerDeposits) {
    if (d.kind === "applied" || !bankish(d.method)) continue; // using a deposit moves no money; a cash movement never reaches a bank statement
    candidates.push({
      type: "customerDeposit",
      id: d.id,
      date: d.date,
      label: d.kind === "received" ? `Deposit from ${d.customer}` : `Deposit refunded to ${d.customer}`,
      amount: d.kind === "received" ? d.amount : -d.amount,
    });
  }
  for (const c of capitalEntries) {
    candidates.push({
      type: "capital",
      id: c.id,
      date: c.date,
      label: isPoolEntry(c)
        ? c.kind === "withdrawal"
          ? `Investor ${c.distribution === "capital" ? "capital returned" : "dividend"}: ${c.investorName}`
          : `Investor money in: ${c.investorName}`
        : c.kind === "withdrawal" ? "Owner withdrawal" : c.kind === "reinvestment" ? "Owner reinvestment" : "Owner investment",
      amount: c.kind === "withdrawal" ? -c.amount : c.amount,
    });
  }
  return candidates;
}

// For one bank statement line, rank the candidates most likely to be it:
// same sign, amount within `amountTolerance` (default 1 unit of currency —
// covers rounding, not a fudge factor for genuinely different amounts), and
// date within `dayWindow` days either side, closest date and amount first.
export function suggestMatchesForLine(
  line: BankStatementLine,
  candidates: CashLedgerCandidate[],
  opts?: { dayWindow?: number; amountTolerance?: number }
): CashLedgerCandidate[] {
  const dayWindow = opts?.dayWindow ?? 5;
  const amountTolerance = opts?.amountTolerance ?? 1;
  const lineDate = new Date(line.date).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return candidates
    .filter((c) => Math.sign(c.amount) === Math.sign(line.amount) || line.amount === 0)
    .filter((c) => Math.abs(c.amount - line.amount) <= amountTolerance)
    .filter((c) => Math.abs(new Date(c.date).getTime() - lineDate) <= dayWindow * dayMs)
    .sort((a, b) => {
      const amountDiff = Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount);
      if (amountDiff !== 0) return amountDiff;
      return Math.abs(new Date(a.date).getTime() - lineDate) - Math.abs(new Date(b.date).getTime() - lineDate);
    })
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Cash actions — "who do I chase, and what must I pay soon?"
//
// A pure roll-up of the aging numbers the Money owed page already computes, so
// the dashboard can put the two most cash-critical questions on the home
// screen without a second calculation. Nothing here reads or writes anything;
// it only filters and adds up lines that computeReceivablesAging /
// computePayablesAging / computeBillsPayable already produced (so it can never
// disagree with the Money owed page).
//
//   overdueIn  — customer balances past their due date (money to collect).
//   dueOut     — supplier purchases and general bills that are overdue or fall
//                due within `dueSoonDays` (money to pay). Not-yet-due items
//                further out are deliberately left off: they are not an action.
// ---------------------------------------------------------------------------
export interface CashActions {
  overdueIn: {
    count: number;
    total: number;
    oldestDaysOverdue: number;
    top: { customer: string; amount: number; oldestDaysOverdue: number }[]; // biggest overdue balances, max 3
  };
  dueOut: {
    count: number;
    total: number;
    overdueCount: number;
    overdueTotal: number;
  };
}

export function computeCashActions(
  receivables: ReceivablesAging,
  payables: PayablesAging,
  bills: BillsPayablesAging,
  dueSoonDays = 7
): CashActions {
  const EPS = 0.005;
  const overdueLines = receivables.lines.filter((l) => l.daysOverdue > 0 && l.amountOutstanding > EPS);
  const byCustomer = new Map<string, { amount: number; oldest: number }>();
  for (const l of overdueLines) {
    const key = l.customer?.trim() || "No name recorded";
    const cur = byCustomer.get(key) ?? { amount: 0, oldest: 0 };
    cur.amount += l.amountOutstanding;
    cur.oldest = Math.max(cur.oldest, l.daysOverdue);
    byCustomer.set(key, cur);
  }
  const top = [...byCustomer.entries()]
    .map(([customer, v]) => ({ customer, amount: v.amount, oldestDaysOverdue: v.oldest }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const payLines: { outstanding: number; daysOverdue: number }[] = [
    ...payables.lines.map((l) => ({ outstanding: l.amountOutstanding, daysOverdue: l.daysOverdue })),
    ...bills.lines.map((l) => ({ outstanding: l.amountOutstanding, daysOverdue: l.daysOverdue })),
  ].filter((l) => l.outstanding > EPS && l.daysOverdue >= -dueSoonDays);
  const overduePay = payLines.filter((l) => l.daysOverdue > 0);

  return {
    overdueIn: {
      count: overdueLines.length,
      total: overdueLines.reduce((s, l) => s + l.amountOutstanding, 0),
      oldestDaysOverdue: overdueLines.reduce((m, l) => Math.max(m, l.daysOverdue), 0),
      top,
    },
    dueOut: {
      count: payLines.length,
      total: payLines.reduce((s, l) => s + l.outstanding, 0),
      overdueCount: overduePay.length,
      overdueTotal: overduePay.reduce((s, l) => s + l.outstanding, 0),
    },
  };
}
