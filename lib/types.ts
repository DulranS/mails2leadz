export type Recurrence = "weekly" | "monthly" | "yearly" | "none";

export type OfferingType = "product" | "service";

// A "Product" can be a physical item (wholesale-bought, held as inventory)
// or a service/labor offering (no physical stock — its "cost" is what it
// costs you to deliver one unit, logged the same way a purchase is logged
// for a product). Both share the same WAC costing engine below; only the
// UI labels and whether EOQ/reorder planning applies differ by type.
// A physical place stock is held / a sale or purchase happens at — a shop,
// warehouse, or outlet. Deliberately minimal (name only): this is the
// "lighter" multi-location model — it tags transactions and stock with a
// place, but does NOT scope Staff visibility or split financial reports by
// location (every Sale/Purchase/StockAdjustment still rolls into one
// consolidated P&L/balance sheet regardless of locationId, same as before
// locations existed). Every business gets one auto-created Location named
// "Main" the first time this feature loads for them (see DataContext), so a
// business that never adds a second location never sees any of this. `id`
// is a Firestore doc id, not a fixed slug — a locationId on a transaction
// stores this id. A Sale/Purchase/StockAdjustment with no locationId at all
// (i.e. every record created before this feature existed) is read as
// belonging to whichever Location has `isDefault: true` — see
// resolveLocationId in lib/stockTracking.ts — so historical data doesn't
// need a migration pass.
export interface Location {
  id: string;
  name: string;
  active: boolean;
  isDefault?: boolean; // true for the auto-created "Main" location; legacy (locationId-less) records resolve here
  createdAt: number;
}

// A movement of physical stock from one Location to another — NOT a sale or
// a purchase, so (like StockAdjustment) it never touches revenue, COGS, or
// WAC. Unlike StockAdjustment it's a paired movement rather than a single
// signed qty: it removes `qty` units from `fromLocationId` and adds the same
// `qty` to `toLocationId`, so total qtyOnHand across all locations for the
// product is unchanged — only where it physically sits moves. See
// computeLocationStockLevel in lib/stockTracking.ts for how it's folded in.
export interface StockTransfer {
  id: string;
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: number; // positive
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  type: OfferingType;
  active: boolean;
  // Stock level tracking — product type only
  currentStock?: number; // current on-hand quantity, computed from purchases - sales
  minStockLevel?: number; // reorder point: alert when stock falls below this
  // EOQ / reorder-planning inputs — product type only, all optional
  // (falls back to Settings defaults when unset).
  orderingCost?: number; // fixed cost to place one order (S)
  holdingCostPct?: number; // annual holding cost as % of unit cost (used to derive H)
  leadTimeDays?: number; // supplier lead time, for reorder point
  // Default prices — optional convenience fields. Pre-fill the unit
  // cost/price on new Purchase/Sale entries so they don't need to be
  // retyped every time, and drive the live margin preview on this form and
  // the quick stock/sell actions on the Products page. The actual WAC/COGS
  // engine still only ever uses what's entered on each Purchase/Sale — these
  // are just sensible starting values, not a source of truth.
  defaultCostPrice?: number;
  defaultSellPrice?: number;
  contractorName?: string; // v275: the contractor or talent who earns a share of this product's sales
  contractorSharePct?: number; // v275: their share of revenue, 0-100
  // Optional market reference: what the market charges for this product or service, where you checked it and when (lib/marketRates.ts).
  marketRate?: number;
  marketRateSource?: string;
  marketRateCheckedOn?: string;
  // Optional market reference on the buying side: what suppliers charge the market for this item, where and when it was checked.
  marketCost?: number;
  marketCostSource?: string;
  marketCostCheckedOn?: string;
  // What a wholesale customer usually pays for this item (see Customer.wholesale). Only ever a suggestion on the sale form:
  // the price actually charged is whatever is entered on the sale, and no figure is derived from this field.
  wholesalePrice?: number;
  // Minimum advertised price a brand allows (lib/priceControl.ts). Sales charged below it are listed on Price & condition. Memo only.
  mapPrice?: number;
  // Condition of the units: new (the default when unset), open_box, refurbished or used (lib/priceControl.ts).
  condition?: "new" | "open_box" | "refurbished" | "used";
  // Quantity price breaks: "this many or more, this price each" (lib/priceTiers.ts). Quantities are in base units, prices
  // per base unit. Only ever a suggestion on the sale form; it never changes a price or any figure by itself.
  priceTiers?: { minQty: number; unitPrice: number }[];
  // Warranty length in months (lib/warranty.ts). A sale of the item then offers a serial / IMEI box, and the receipt and
  // the Sales page show when the warranty ends. Information only: no figure is derived from it.
  warrantyMonths?: number;
  // Eco and sustainability tags (lib/ecoTags.ts), e.g. Vegan, Recyclable packaging. Information only: no price or cost depends on them.
  ecoTags?: string[];
  // Shelf or bin where it sits (lib/bins.ts). Orders the stock count; information only.
  binLocation?: string;
  // The sales tax / VAT rate for THIS item, in percent. Absent = use the shop rate from Settings. 0 = tax-free (exempt or
  // zero-rated). Read when a sale or purchase of the item is entered and snapshotted onto that record's taxAmount, so
  // changing it never rewrites past sales. Ignored while sales tax is switched off. See lib/tax.ts.
  taxRatePct?: number;
  // For service-type offerings especially: the labor cost that goes into
  // delivering one unit (an employee's time, not a logged Purchase/contractor
  // fee). Doesn't touch COGS or the WAC ledger — a service delivered by an
  // employee already has that employee's pay sitting in operating expenses,
  // so folding it into COGS too would double-count it. This is a separate,
  // clearly-labeled "fully-loaded" view so a service's true per-unit margin
  // isn't overstated just because payroll happens to live in a different
  // bucket than COGS.
  laborCostPerUnit?: number;
  // ---------------------------------------------------------------------
  // Productized offers — a service-type Product whose delivery cost is
  // broken into named recipe lines instead of one laborCostPerUnit number.
  // Optional and purely additive: a service Product without recipeLines
  // works exactly as before. When set, `defaultSellPrice` is the offer's
  // fixed price and `recipeLines` is the repeatable cost recipe — see
  // OfferCostLine below and fulfillOffer in DataContext, which is what
  // actually logs the recipe as a cost entry (a Purchase) every time the
  // offer is delivered, at the same price and the same cost breakdown
  // every single time. This is deliberately just a Product, not a new
  // entity: it reuses the exact same WAC/COGS engine, the same Sale/
  // Purchase records, the same reporting, and the same Staff-hidden-cost
  // rule (recipeLines is never mirrored onto CatalogItem below) that every
  // other Product already gets — a packaged offer is a repeatable product,
  // not a different kind of thing.
  recipeLines?: OfferCostLine[];
  // Capacity ONE delivery of this offer consumes (e.g. hours of your own
  // time, a contractor day, a seat). Purely informational — feeds the "how
  // much can I still sell before I'm out of capacity" view on the Offers
  // page. Doesn't touch cost/margin math at all.
  capacityPerDelivery?: number;
  capacityUnit?: string; // e.g. "hours", "days", "seats" — label only
  // ---------------------------------------------------------------------
  // Bill of materials — a product-type Product that's actually
  // manufactured/assembled from other products already tracked as
  // inventory here (raw materials or sub-assemblies), rather than bought
  // ready-to-sell. Optional and purely additive: a Product without
  // `components` works exactly as before (buy it, sell it). When set,
  // `recordProduction` in DataContext is what actually acts on it: for a
  // production run of N finished units it (a) reduces each component's
  // stock by componentQtyPerUnit × N, valued at that component's WAC at
  // that moment — logged as a StockAdjustment with
  // reason "production_use" (see StockAdjustmentReason below) rather than
  // "damaged"/"theft"/etc, specifically so routine production doesn't
  // inflate the "manual overrides" anomaly signal on Financial Health
  // (computeManualOpsSignals excludes this reason on purpose — production
  // use isn't an anomaly, it's the business), and (b) adds N units of the
  // finished good to stock via a Purchase at the computed cost (component
  // cost + any labor/overhead entered at production time), same as any
  // other Purchase would. Reuses the existing WAC/COGS engine entirely —
  // no changes to computeProductLedger/computeAllLedgers were needed for
  // this to work correctly.
  //
  // This is a different mechanism from `recipeLines`/`OfferCostLine`
  // above, which is for a service offering: recipeLines only logs a cost
  // entry (nothing physical is consumed or produced), while `components`
  // actually moves real inventory between real Products. Like
  // recipeLines, `components` is never mirrored onto CatalogItem — Staff
  // never sees a bill of materials, same as they never see cost prices.
  components?: BomComponent[];
  // ---------------------------------------------------------------------
  // Units of measure (all optional, purely additive). Stock, cost and price
  // are ALWAYS kept per BASE unit — the unit you sell and count in (a piece,
  // a kg, a metre). `packSizes` are bigger units you BUY in (a carton of 12):
  // the purchase forms convert "5 cartons at 1,200" into "60 pieces at 100"
  // before anything is saved, so the WAC/COGS engine, margins, stock counts
  // and every report never need to know packs exist. See lib/units.ts.
  baseUnit?: string; // label only, e.g. "pc", "kg", "m"
  packSizes?: PackSize[];
  // true for things sold in parts (kg, litres, metres): lets quantities such
  // as 2.5 be entered. Off by default so a stray decimal can't slip in.
  allowFractionalQty?: boolean;
  // ---------------------------------------------------------------------
  // Variants (size, colour, ...). Each variant is a complete Product of its
  // own — own SKU, stock, cost and price — so nothing in the ledger changes.
  // These two fields only group them for display and roll-ups:
  // variantGroup = the shared name ("Polo shirt"), variantLabel = what sets
  // this one apart ("M / Red"). Created in bulk from Products > Add variants.
  variantGroup?: string;
  variantLabel?: string;
  createdAt: number;
}

// A bigger unit a product is bought in: `qty` base units per pack
// (e.g. { name: "Carton", qty: 12 } on a product whose baseUnit is "pc").
// `id` is local to the array, same pattern as BomComponent.id.
export interface PackSize {
  id: string;
  name: string;
  qty: number;
}

// One line of a Product's bill of materials — "qtyPerUnit" units of
// `componentProductId` are consumed to produce ONE unit of the finished
// good this array sits on. `id` is a local identifier scoped to this array
// (React keys / edit-remove), not a Firestore document id — same pattern
// as OfferCostLine.id below.
export interface BomComponent {
  id: string;
  componentProductId: string;
  qtyPerUnit: number;
}

// Sentinel "supplier" name used on the Purchase a production run creates
// for the finished good (see recordProduction in DataContext). Filtered
// out of computeSupplierConcentration in lib/calculations.ts on purpose:
// that signal measures exposure to losing an external supplier, and
// in-house production spend isn't that — counting it would both inflate
// total purchasing spend and dilute how concentrated the REAL supplier
// risk looks, which matters most for exactly the manufacturing businesses
// that would use `components` at all.
export const PRODUCTION_SUPPLIER_LABEL = "Production (in-house)";

// One line of an offer's repeatable cost recipe — e.g. "My time: 3 hrs @
// $30/hr", "Subcontractor fee", "Software/tool allocation". `amount` is the
// cost for delivering ONE unit of the offer. Kept as a plain array on the
// Product doc (not its own collection) since a recipe is edited as a whole
// alongside the offer, never queried independently — same reasoning as
// RecurringInvoiceLine on RecurringInvoice below. `id` is a local
// identifier scoped to this array (for React keys and edit/remove), not a
// Firestore document id.
export interface OfferCostLine {
  id: string;
  label: string;
  category: string; // one of PROJECT_COST_CATEGORIES, free text also accepted
  amount: number;
}

// For a product: a wholesale purchase (qty bought, unit cost).
// For a service: a cost entry (capacity/hours delivered, cost per unit —
// e.g. labor cost per hour or per job). Same shape, same WAC math either way.
// This represents STOCK ALREADY IN HAND / cost already incurred — see
// PurchaseOrder below for stock that's been ordered but not yet received.
export interface Purchase {
  id: string;
  productId: string;
  qty: number;
  unitCost: number;
  date: string; // ISO date (yyyy-mm-dd)
  supplier?: string; // product: supplier name. service: contractor/resource.
  notes?: string;
  purchaseOrderId?: string; // set when this purchase was created by receiving a PO
  // Use-by / expiry date of THIS delivery (food, medicine, cosmetics, chemicals), and the supplier's batch or lot
  // number if there is one. Both optional and memo-only: they change no cost, stock quantity, cash or profit anywhere.
  // They exist so the Expiry watch (lib/expiryWatch.ts) can say which units on the shelf are about to run out of
  // date. Write-offs of spoiled stock are still recorded as ordinary stock adjustments (reason "expired").
  expiryDate?: string; // ISO date
  batchRef?: string;
  // Optional link to a Project — set when this purchase (materials, a
  // subcontracted service, whatever) was bought specifically for a costed
  // job. Rolls straight into that project's actual cost alongside its
  // manual cost segments — see ProjectCostSegment below. Purely additive.
  projectId?: string;
  // "cash"/"card"/"bank_transfer" are all treated as paid-in-full at purchase.
  // "credit" is money owed to supplier — it doesn't show as paid until a
  // PayablePayment is recorded against it.
  paymentMethod?: PaymentMethod;
  creditTermDays?: number; // only meaningful when paymentMethod === "credit"
  dueDate?: string; // ISO date = date + creditTermDays, stored so it never has to be recomputed
  // Multi-currency (all optional — absent means this was paid in the
  // business's base currency, i.e. exchangeRate 1). When set, `unitCost`
  // above is ALWAYS the base-currency equivalent (foreignUnitCost ×
  // exchangeRate), so WAC/COGS and every other calculation keep working
  // unchanged. These three fields exist purely to remember what was
  // actually paid, and in what currency, for display/audit. See lib/fx.ts.
  currency?: string; // e.g. "USD" — only set when different from the base currency
  exchangeRate?: number; // 1 unit of `currency` = this many units of base currency, at purchase date
  foreignUnitCost?: number; // the price actually paid, in `currency`
  // ---------------------------------------------------------------------
  // Landed cost — freight, customs/duty, and other costs to get the goods
  // from the supplier into your hands, on top of what you paid the
  // supplier itself. All three are OPTIONAL TOTALS for this whole
  // purchase (not per-unit — that's how a freight or customs bill
  // actually arrives), and are purely for audit/display: when any of them
  // is set, `unitCost` above is ALWAYS the true all-in per-unit cost —
  // goodsUnitCost plus (freightCost + customsCost + otherLandedCost) / qty
  // — so the WAC/COGS engine, margins, and every calculation elsewhere
  // keep working completely unchanged without needing to know landed
  // costs exist. This mirrors the foreignUnitCost pattern above: the raw
  // component is kept for what-you-actually-paid transparency, the
  // derived number is what everything downstream reads.
  goodsUnitCost?: number; // price paid to the supplier alone, per unit, base currency, before landed costs
  freightCost?: number; // total freight/shipping for this purchase, base currency
  customsCost?: number; // total customs/duty for this purchase, base currency
  otherLandedCost?: number; // total other landed cost (insurance, handling, agent fees), base currency
  // Input tax (VAT/GST/etc — see Settings.salesTaxRatePct/salesTaxLabel)
  // paid on this purchase, in base currency — the mirror of Sale.taxAmount
  // on the other side of the ledger. Computed the same way (qty × unitCost
  // × the single flat rate in Settings) and snapshotted at purchase time
  // for the same reason: changing the rate later shouldn't rewrite
  // historical purchases. This app has no separate input/output rate — one
  // flat rate is assumed to apply on both sides, which covers the
  // standard-rate VAT/GST case most SMEs actually deal with. Absent or 0
  // means no tax was paid on this purchase (feature off, predates it, or a
  // zero-rated/exempt supplier). Kept OUT of `unitCost`/COGS — it's money
  // reclaimable against output tax, not a cost of the goods — so nothing
  // about WAC/COGS/margins needs to know it exists. Read back out only by
  // the Tax summary on the Statements page (output tax collected on Sales
  // minus input tax paid here = net tax owed/reclaimable for the period).
  taxAmount?: number;
  // Which Location this stock was received into. Absent = the business's
  // default Location (see Location.isDefault above) — so every purchase
  // logged before multi-location existed reads correctly with no migration.
  // Purely a physical-quantity tag: WAC/COGS below are computed across all
  // locations together regardless of this field, by design (see Location).
  locationId?: string;
  createdAt: number;
}

export type OrderStatus = "draft" | "awaiting_approval" | "ordered" | "in_transit" | "received" | "cancelled"; // draft: made for review, not yet sent

// A wholesale order placed with a supplier — separate from Purchase, which
// represents stock you already physically hold. A PurchaseOrder tracks the
// commitment (what you ordered, when, from whom, expected when) through to
// receipt. Marking one "received" generates the corresponding Purchase entry
// (qty actually received, which can differ from qty ordered) so it flows
// into the WAC/inventory ledger exactly once, at the moment stock actually
// arrives — not when you merely placed the order.
export interface PurchaseOrder {
  id: string;
  autoDrafted?: boolean; // v243: made by the daily buying list, for review
  productId: string;
  qtyOrdered: number;
  unitCost: number; // quoted/expected unit cost at order time
  orderDate: string; // ISO date
  expectedDate?: string; // ISO date
  supplier?: string;
  notes?: string;
  status: OrderStatus;
  receivedDate?: string; // ISO date, set when received
  qtyReceived?: number; // actual qty received, set when received (may differ from qtyOrdered)
  // What was wrong with the delivery when it came (damaged, short, wrong item). Memo only: no stock or cost figure reads it.
  receivingNote?: string;
  receivedUnitCost?: number; // actual unit cost paid, set when received (may differ from quoted)
  // v177c: the supplier's own confirmation of the delivery day, from the supplier portal. Kept apart from expectedDate, which the owner
  // sets and the on-time record reads; a supplier can never change that.
  supplierAck?: { confirmedDate: string; note?: string; at: number };
  createdAt: number;
}

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "credit";

export interface Sale {
  posRef?: string; // the POS transaction this sale came from (lib/pos-ingest.ts). Stops a re-sent sale posting twice.
  eventId?: string; // the ticketed event these seats were sold for (lib/events.ts). Set on ticket sales only.
  id: string;
  productId: string;
  qty: number;
  unitPrice: number;
  date: string; // ISO date
  customer?: string;
  customerContact?: string; // phone/email — mainly useful once it's a credit sale you need to chase
  // How the sale reached the customer: "Walk-in", "Wholesale", "Online" or any name the business uses. Free text, optional,
  // blank means not recorded. Used only by Sales by channel (lib/salesChannels.ts); no money figure depends on it.
  saleChannel?: string;
  // A tip the customer left on this sale, passed on to staff (lib/tips.ts). A memo only: it is not revenue, cost, profit, tax or cash.
  tipAmount?: number;
  // Promo code used on this sale and what it took off (lib/promoCodes.ts). Memo: the sale price already has the discount.
  promoCode?: string;
  promoOffAmount?: number;
  // Serial number / IMEI of the unit(s) sold, free text (several separated by commas). Used to find the sale again for a
  // warranty claim (lib/warranty.ts). Information only.
  serialNo?: string;
  // Set when this sale is a late charge the owner billed on an overdue invoice (lib/lateFees.ts: the key of that
  // invoice). Lets a later charge bill only what has built up since. An ordinary sale otherwise.
  lateFeeForKey?: string;
  notes?: string;
  // Optional link to a Project — set when this sale is a progress-billing /
  // invoice line against a costed job rather than a standalone retail sale.
  // Purely additive: an untagged sale behaves exactly as before. See
  // Project/ProjectCostSegment below for the job-costing model.
  projectId?: string;
  // "cash"/"card"/"bank_transfer" are all treated as collected-in-full at the
  // point of sale. "credit" is money owed to you — it doesn't show up as cash
  // until a ReceivablePayment is recorded against it. Old sales without this
  // field are read as "cash" (see computeReceivablesAging / DataContext).
  paymentMethod?: PaymentMethod;
  creditTermDays?: number; // only meaningful when paymentMethod === "credit"
  dueDate?: string; // ISO date = date + creditTermDays, stored so it never has to be recomputed against a changed default later
  // Multi-currency (all optional — absent means this was charged in the
  // business's base currency, i.e. exchangeRate 1). When set, `unitPrice`
  // above is ALWAYS the base-currency equivalent (foreignUnitPrice ×
  // exchangeRate), so revenue/COGS/margin and every other calculation keep
  // working unchanged. These three fields exist purely to remember what was
  // actually charged, and in what currency, for display/audit. See lib/fx.ts.
  currency?: string; // e.g. "USD" — only set when different from the base currency
  exchangeRate?: number; // 1 unit of `currency` = this many units of base currency, at sale date
  foreignUnitPrice?: number; // the price actually charged, in `currency`
  // True on the delivery line a sale form adds when a delivery charge is typed (lib/delivery.ts). It marks the line for
  // good, even if delivery is switched off in Settings later, so delivery fees are never counted as units sold or
  // earn a salesperson commission. Absent on everything else.
  isDelivery?: boolean;
  // Set when this Sale is one line of a multi-item invoice created together
  // (see MultiItemInvoiceForm) — every Sale sharing the same invoiceId was
  // billed to the customer as a single invoice with one total, even though
  // each line still exists as its own Sale row so stock/WAC/COGS math for
  // each product is untouched. Absent for an ordinary standalone sale.
  // Grouping for display, printing, and receivables aging happens by
  // reading this field back out (see computeReceivablesAging) — nothing
  // about the WAC/COGS engine needs to know it exists.
  invoiceId?: string;
  // Sequential invoice number (INV-000001), set when the sale is first saved (lib/invoiceNumber.ts, v321). Absent on older sales, which print their legacy ref.
  invoiceNo?: string;
  // Date of supply, when it differs from the invoice date (v326). Blank means the same day.
  supplyDate?: string;
  // Saved offline: the number is given once this device is back online (v326, DataContext pending pass).
  numberPending?: boolean;
  // Sales tax (VAT/GST/etc — see Settings.salesTaxRatePct/salesTaxLabel)
  // charged on this line, in base currency. A snapshot taken at sale time
  // — like exchangeRate above — so changing the rate later never rewrites
  // historical sales. Absent or 0 means no tax was charged on this line
  // (either the feature is off, or this predates it). Deliberately kept
  // OUT of `unitPrice`/revenue: computeSaleEconomics, margins, and P&L all
  // read `unitPrice` as the untaxed sale price, so tax living in its own
  // field means none of that math needs to know this exists. Only the
  // money actually owed — computeReceivablesAging's amountDue, and the
  // printed invoice/receipt totals — add this back on top.
  taxAmount?: number;
  // Who actually rang this up — set automatically by DataContext, never
  // user-entered. Powers per-staff cash reconciliation and the audit log;
  // also the basis for the Firestore rule that lets Staff read only their
  // own sales.
  // Optional: the Purchase (delivery / batch) this sale was taken from, picked on the sale form when the seller
  // knows exactly which batch left the shelf. Memo only (lib/batchLedger.ts): costing stays on weighted average
  // cost and no figure changes. Absent = the batch is estimated, earliest expiry first.
  batchPurchaseId?: string;
  createdByUid?: string;
  createdByName?: string;
  // Which Location this was sold from. Absent = the business's default
  // Location — see Purchase.locationId above for why no migration is
  // needed. Revenue/COGS/margins stay consolidated across locations.
  locationId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Estimates — a pre-sale, multi-line quote sent to a customer before any
// commitment exists. Deliberately its OWN document, not a draft Sale: an
// Estimate never touches stock, WAC/COGS, or revenue — none of that should
// move until the customer actually agrees to buy. Accepting one converts it
// into real Sale rows (one per line, sharing an invoiceId, via
// DataContext.convertEstimateToInvoice) using the exact same path a
// hand-entered multi-item invoice takes, so everything downstream
// (receivables aging, statements, margins) works unchanged from there.
// Distinct from Project.quotedPrice (a single agreed job price you cost
// actuals against over time) — this is a line-itemized offer with its own
// accept/decline lifecycle, for a retail/service sale that hasn't happened
// yet.
export type EstimateStatus = "draft" | "sent" | "accepted" | "declined" | "expired" | "converted" | "revised";

export interface EstimateLineItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface Estimate {
  id: string;
  date: string; // ISO date issued
  validUntil?: string; // ISO date — purely informational, nothing auto-expires it
  customer?: string;
  customerContact?: string;
  lines: EstimateLineItem[];
  notes?: string;
  status: EstimateStatus;
  // Set once convertEstimateToInvoice runs — the invoiceId shared by the
  // Sale rows it created, so the Estimate can link forward to what it
  // became instead of just disappearing.
  convertedInvoiceId?: string;
  createdByUid?: string;
  createdByName?: string;
  // Revisions. A revised quote is a NEW estimate that points back at the one it replaces (revisionOf). The old one is
  // marked "revised" and points forward (supersededBy), and its customer link stops working. A revision never moves
  // money: see computeRevisionSettlement in lib/quoteRevision.ts for what happens to a deposit the customer already holds.
  revision?: number; // 1 for the first version, +1 for each revision
  revisionOf?: string;
  supersededBy?: string;
  // Customer link (app/quote/[token]). Sent when the owner asks for the link; answered online by the customer. Accepting
  // records their answer only: it does not convert the quote, move stock, or count as a legal e-signature.
  sentAt?: number;
  decidedAt?: number;
  decidedByName?: string; // the name the customer typed to confirm their answer
  decisionFrom?: "owner" | "customer_link";
  // Carried onto every Sale line convertEstimateToInvoice creates when this
  // estimate is accepted — same "resolves to default if unset" rule as
  // everywhere else (see Location in this file).
  locationId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Ledger adjustments — stock and money movements that are neither a
// Purchase (stock in) nor a Sale (stock out): a customer return, a
// discount given against a sale, or a stock write-off/count correction.
// Three separate record types (not one polymorphic one) because each
// touches a different slice of the ledger — see the doc comment on each
// below — but they share the same shape: append-only, dated, reason-coded,
// and attributed to whoever logged it, same as every other record in this
// app. None of the three ever mutates a Purchase or Sale document; they're
// their own auditable trail, the same way ReceivablePayment/PayablePayment
// sit alongside Sale/Purchase instead of overwriting them.
// ---------------------------------------------------------------------------

export type StockAdjustmentReason =
  | "damaged"
  | "expired"
  | "theft"
  | "count_correction"
  | "production_use"
  | "other";

export const STOCK_ADJUSTMENT_REASONS: { value: StockAdjustmentReason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired / spoiled" },
  { value: "theft", label: "Theft" },
  { value: "count_correction", label: "Stock count correction" },
  { value: "production_use", label: "Used in production" },
  { value: "other", label: "Other" },
];

// An inventory movement that isn't a Purchase or a Sale — breakage,
// spoilage, theft, a physical count correction, or (via recordProduction
// in DataContext) a component consumed by a production run. Adjusts qty on
// hand (see computeProductLedger in lib/calculations.ts) but deliberately
// never touches revenue or COGS: nothing was sold and nothing was bought,
// so forcing it through Sale/Purchase would pollute both. `qty` is signed —
// negative for stock that's gone (damaged/expired/stolen/a count that came
// up short/used in production), positive for stock a count turned up that
// wasn't on record — stored explicitly so the ledger math never has to
// infer a sign from the reason string. Valued at the product's WAC at the
// moment of the adjustment, so inventory value stays consistent without a
// fake Purchase/Sale invented just to force the number. Note:
// reason === "production_use" is deliberately excluded from
// computeManualOpsSignals' anomaly count — see BomComponent above.
export interface StockAdjustment {
  id: string;
  productId: string;
  qty: number; // signed: negative = stock lost, positive = stock found
  reason: StockAdjustmentReason;
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  // Which Location this adjustment happened at. Absent = the business's
  // default Location — see Purchase.locationId above.
  locationId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Stock-outs (lost sales): a customer wanted something you had none of (or not enough of) and left without it.
// A memo, not a transaction: it NEVER touches stock, revenue, cost of goods, cash or any statement. It exists so the
// cost of running out becomes a number you logged yourself, instead of nothing. Only what you actually record is
// counted, so there is no estimating of demand you never saw.
//   qty        - base units the customer wanted that you could not supply
//   unitPrice  - what you would have sold each for (snapshot, base currency), so a later price change never
//                rewrites history
//   unitCost   - what each unit costs you (snapshot of the product's average cost when logged), so the margin
//                lost is known without looking anything up later
// Lost revenue = qty x unitPrice; lost margin = qty x (unitPrice - unitCost). See lib/stockOuts.ts.
// ---------------------------------------------------------------------------
export interface StockOut {
  id: string;
  productId: string;
  qty: number;
  unitPrice: number;
  unitCost?: number;
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Playbook: the written side of running a business. A procedure is how a repeatable task is done (so it survives
// someone being away or leaving); a contract entry tracks who the agreement is with and WHEN IT ENDS, so a renewal or a
// notice period is never missed. Plain text and dates only: Balancr does not draft, file or check any legal document,
// and an entry changes no figure in the books. Owner/Manager write, the Owner deletes, whoever reads the books reads it.
// ---------------------------------------------------------------------------
// Customer support log (lib/support.ts): complaints, questions, refund and warranty requests and whether each was sorted
// out. Never part of the books. Owner/Manager write, whoever reads the books reads.
export type SupportKind = "complaint" | "question" | "refund" | "warranty" | "other";
export type SupportPriority = "normal" | "urgent";
export type SupportStatus = "open" | "resolved";

export interface SupportCase {
  id: string;
  customerName: string; // free text, matched to customers by name only for the "repeat customers" count
  contact?: string;
  kind: SupportKind;
  priority: SupportPriority;
  subject: string;
  detail?: string;
  openedOn: string; // ISO date
  status: SupportStatus;
  resolvedOn?: string; // ISO date, only when resolved
  resolution?: string; // what was done
  assignedTo?: string; // who has it, free text
  dueOn?: string; // ISO date it should be sorted by, while open (optional)
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// One answer to "how likely are you to recommend us, 0 to 10?" (lib/feedback.ts). A plain record that changes no figure
// anywhere; Balancr asks nobody and sends nothing, the owner types in the answers they got.
export type FeedbackChannel = "in_person" | "whatsapp" | "email" | "phone" | "online_review" | "other";

export interface FeedbackEntry {
  id: string;
  customerName: string; // free text
  contact?: string;
  score: number; // whole number 0 to 10
  comment?: string; // what they said, in their words
  receivedOn: string; // ISO date
  channel?: FeedbackChannel;
  followedUp: boolean; // someone got back to them (matters for scores of 6 or less)
  // v189b: shown on the public enquiry page, once the owner has marked it and the customer has agreed (lib/testimonials.ts)
  testimonial?: { approved: boolean; quote: string; displayName: string; approvedAt: number };
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// A record of days off for one employee (lib/leave.ts). Owner only, like payroll. It changes no money anywhere.
export type LeaveType = "annual" | "casual" | "sick" | "other" | "unpaid";

export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string; // as it was when the leave was logged, so the record still reads if the employee is removed
  type: LeaveType;
  from: string; // ISO date, first day
  to: string; // ISO date, last day
  days: number; // working days away, whole or half days
  note?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

export type PlaybookKind = "procedure" | "contract" | "other";

export const PLAYBOOK_KINDS: { value: PlaybookKind; label: string }[] = [
  { value: "procedure", label: "Procedure" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];

export interface PlaybookEntry {
  id: string;
  kind: PlaybookKind;
  title: string;
  body: string; // the steps, or the key terms in your own words: plain text
  owner?: string; // who is responsible for it
  // Procedures (or anything with a schedule): re-read and update it this often. Due counts from lastReviewed, or from
  // the day it was written if it has never been marked reviewed.
  reviewEveryDays?: number;
  lastReviewed?: string; // ISO date
  // Contracts
  counterparty?: string; // the customer, supplier, landlord or partner it is with
  startDate?: string; // ISO date
  endDate?: string; // ISO date: when it ends or renews
  noticeDays?: number; // how many days before the end you must act to end, renew or renegotiate
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "customer_changed_mind"
  | "damaged_in_transit"
  | "other";

export const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "defective", label: "Defective" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "damaged_in_transit", label: "Damaged in transit" },
  { value: "other", label: "Other" },
];

// A customer return against a specific Sale — full or partial. Always
// reverses recognized revenue by `refundAmount` (see computeSaleEconomics).
// `restock` decides whether COGS is also reversed:
//   - restock: true  — the returned units go back into sellable inventory,
//     valued at the unit cost they originally left at (that Sale's
//     WAC-based cost per unit — see computeProductLedger's "return" event).
//     COGS is reversed by the same amount, so a resellable return is close
//     to net-neutral on gross profit for those units.
//   - restock: false — the units are gone (defective/damaged, can't be
//     resold) and are NOT added back to stock; COGS is NOT reversed either,
//     since that cost was genuinely incurred and the goods are a write-off.
//     The refund is then a real loss on top of the original cost — which is
//     the correct economic picture for "sold it, it broke, refunded them,
//     kept nothing."
// Deliberately its own record rather than a negative-qty Sale: a return
// needs to reference the original sale (for the refund/receivables math
// and for restocking at the right cost) and needs the restock/no-restock
// branch above, neither of which a plain Sale can express.
export interface SaleReturn {
  id: string;
  saleId: string;
  productId: string; // denormalized from the sale, for filtering without a join
  qty: number; // positive quantity returned
  refundAmount: number; // amount refunded to the customer, base currency
  restock: boolean;
  reason: ReturnReason;
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  // Denormalized from the original Sale (same pattern as productId above) —
  // restocked qty goes back to wherever it was originally sold from.
  locationId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Supplier returns — goods sent BACK to a supplier (faulty, wrong item,
// over-delivery) against a specific Purchase, for a refund or a reduction in
// what you still owe them. The mirror image of SaleReturn above.
//
// What it does to the books (every figure base currency, none of it can
// drift because each line below is exactly offset by another):
//   - Stock: `qty` units leave stock. They leave at the cost they came in at
//     (`unitCost`, a snapshot of the purchase's all-in unit cost), and the
//     product's weighted average cost is re-derived from what remains — so
//     returning a bad batch does not quietly change the cost of the good
//     units, and past sales' COGS is never rewritten.
//   - Money: `creditAmount` (goods, before tax) plus `taxAmount` (the input
//     tax on those goods, reversed pro-rata) comes back to you one of two ways:
//       "refund"         — the supplier pays you (cash/bank). Cash in.
//       "reduce_payable" — the supplier knocks it off what you still owe on
//                          that credit purchase. No cash moves.
//   - Profit: creditAmount minus qty × unitCost. A full-price refund is 0;
//     a restocking fee or a part-credit is a loss; it lands in cost of goods
//     in the month of the return. (Nothing is booked as revenue.)
//   - Input tax: the reversed `taxAmount` reduces input tax reclaimable.
// Deliberately its own record, like SaleReturn, rather than a negative
// Purchase: it needs the link to the original purchase (cost basis, refund
// cap, what it settles) and the refund/reduce-payable branch.
//
// A third way to settle is "hold_credit": the supplier keeps the money as a credit note for you to spend on a
// future order. Nothing is paid or received now; the value (goods + tax) becomes an asset, "credit held with the
// supplier", which is later applied against one of their open bills or refunded in cash. See SupplierCreditEntry
// and lib/supplierCredit.ts.
// ---------------------------------------------------------------------------
export type SupplierReturnReason =
  | "defective"
  | "wrong_item"
  | "damaged_in_transit"
  | "over_delivered"
  | "quality"
  | "other";

export const SUPPLIER_RETURN_REASONS: { value: SupplierReturnReason; label: string }[] = [
  { value: "defective", label: "Defective / faulty" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "damaged_in_transit", label: "Damaged in transit" },
  { value: "over_delivered", label: "Over-delivered" },
  { value: "quality", label: "Not to spec / quality" },
  { value: "other", label: "Other" },
];

export type SupplierReturnSettlement = "refund" | "reduce_payable" | "hold_credit";

export interface SupplierReturn {
  id: string;
  purchaseId: string;
  productId: string; // denormalized from the purchase, for filtering without a join
  supplier?: string; // denormalized from the purchase, for display
  qty: number; // positive quantity sent back
  unitCost: number; // snapshot of the purchase's all-in unit cost: what each returned unit leaves stock at
  creditAmount: number; // goods value the supplier gives back, before tax
  taxAmount?: number; // input tax reversed with it (pro-rata of the purchase's); 0/absent when no tax
  settlement: SupplierReturnSettlement;
  // How a "refund" arrived. Absent reads as cash (like every other record here), so a cash refund counts
  // in the day's till count and only a bank/card refund is offered for matching on a bank statement.
  refundMethod?: PaymentMethod;
  reason: SupplierReturnReason;
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  // Denormalized from the purchase: the units leave the place they were received into.
  locationId?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Supplier credit: money a supplier holds for you, to be spent on a later order. An ASSET (what they owe you in
// goods), the mirror of what you owe them on a credit purchase. Per supplier (matched by name, ignoring case and
// spaces, like everywhere else):
//   balance = credit from returns settled "hold_credit" (goods + tax, derived from the SupplierReturn itself)
//           + deposits (paid in advance)
//           - applied (used against one of their open bills)
//           - refunded (they paid the credit back to you)
// Only the rows below are stored; the credit from returns is never copied here, so it cannot drift out of step.
//   deposit  - cash/bank/card paid out now, asset up. Cash flow: cash paid to suppliers.
//   applied  - settles part of an open bill with credit instead of cash: payable down, asset down, no cash moves.
//              `purchaseId` is the bill (a credit Purchase, or an opening-balance payable's id).
//   refunded - the supplier pays the credit back: cash in, asset down.
// Balance may never go below zero on any date (lib/supplierCredit.ts checks this before saving or deleting).
// ---------------------------------------------------------------------------
export type SupplierCreditKind = "deposit" | "applied" | "refunded";

export interface SupplierCreditEntry {
  id: string;
  supplier: string; // display name as typed; matched by supplierKey()
  kind: SupplierCreditKind;
  amount: number; // always positive
  date: string; // ISO date
  // deposit: how it was paid; refunded: how it arrived. Absent reads as cash. Not used for "applied".
  method?: Exclude<PaymentMethod, "credit">;
  purchaseId?: string; // applied only: the bill the credit was used on
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Customer deposits: money a customer paid you BEFORE you delivered. A LIABILITY (you owe them the goods or the
// work, or the money back), the mirror of supplier credit above. Per customer (matched by name, ignoring case and
// spaces, like everywhere else):
//   balance = received - applied - refunded
//   received - cash/bank/card taken now, liability up. Cash flow: cash received from customers. NOT revenue yet.
//   applied  - used to settle part of an open credit invoice the customer owes: receivable down, liability down,
//              no cash moves (the cash came in when it was received). `saleId` is the invoice line (a credit
//              Sale, or an opening-balance receivable's id), exactly like a ReceivablePayment's.
//   refunded - you pay the deposit back: cash out, liability down.
// Revenue is recognised by the sale (as always); a deposit only becomes "paid" by being applied to it.
// Balance may never go below zero on any date (lib/customerDeposits.ts checks this before saving or deleting).
// ---------------------------------------------------------------------------
export type CustomerDepositKind = "received" | "applied" | "refunded";

export interface CustomerDepositEntry {
  id: string;
  customer: string; // display name as typed; matched by customerDepositKey()
  kind: CustomerDepositKind;
  amount: number; // always positive
  date: string; // ISO date
  // received: how it arrived; refunded: how you paid it back. Absent reads as cash. Not used for "applied".
  method?: Exclude<PaymentMethod, "credit">;
  saleId?: string; // applied only: the invoice line the deposit was used on
  notes?: string;
  // received only: set on the money taken for a gift card. The card's balance is kept under its own customer name
  // ("Gift card XXXX-XXXX"), so it can be used on any customer's invoice (see lib/giftCards.ts).
  giftCardCode?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A mark that someone has looked at a large discount, expense, return or refund a team member made (see lib/reviewQueue.ts).
// Its id is the item's review key, for example "discount:abc123".
export interface ReviewMark {
  id: string;
  checkedAt: number;
  checkedByUid?: string;
  checkedByName?: string;
}

// What a caller supplies to DataContext.addSupplierReturn. The cost snapshot,
// input-tax share, supplier name and product are all taken from the purchase
// itself, so they can't be mistyped or fall out of step with it.
export type NewSupplierReturn = Pick<
  SupplierReturn,
  "purchaseId" | "qty" | "creditAmount" | "settlement" | "refundMethod" | "reason" | "date" | "notes" | "locationId"
>;

export type DiscountReason =
  | "promotion"
  | "loyalty"
  | "price_match"
  | "bulk_order"
  | "goodwill"
  | "other";

export const DISCOUNT_REASONS: { value: DiscountReason; label: string }[] = [
  { value: "promotion", label: "Promotion" },
  { value: "loyalty", label: "Loyalty" },
  { value: "price_match", label: "Price match" },
  { value: "bulk_order", label: "Bulk order" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
];

// A discount given against a specific Sale, tracked as its own event
// instead of disappearing into a lower `unitPrice` — e.g. a loyalty
// discount, a price match, a goodwill gesture, or a bulk-order markdown
// decided after the sale was rung up. Reduces recognized revenue for that
// sale (see computeSaleEconomics) without touching qty, stock, or COGS —
// the goods still cost what they cost; only what the customer paid
// changes. For a discount known and applied AT the point of sale, it's
// simplest to just enter the already-discounted `unitPrice` on the Sale
// itself — this record type is for discounts worth seeing as their own
// number in reporting ("how much did I give away in discounts this
// month"), or ones decided after the sale was already logged.
export interface Discount {
  id: string;
  saleId: string;
  productId: string; // denormalized from the sale
  amount: number; // revenue given up, base currency
  reason: DiscountReason;
  date: string; // ISO date
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A customer directory entry. Deliberately lightweight — this is a
// name/contact lookup, not a CRM: `Sale.customer` stays the free-text field
// it always was (so nothing about existing sales or the receivables/aging
// math changes), and this collection exists purely to (a) give the sale
// form a consistent list of names to pick from instead of retyping a
// slightly different spelling each time, and (b) anchor a per-customer
// view — total sales, outstanding balance, last visit — computed by
// matching this `name` against the existing sales/receivables data on the
// Customers page. No customerId foreign key anywhere; matching is by name.
export interface Customer {
  relatedParty?: boolean; // pass 350: a family member, a company the owner controls or a director. Sales to them count in the related-party red flag.
  id: string;
  name: string;
  // Tax-exempt: no sales tax is charged on what they buy (lib/tax.ts customerIsTaxExempt). Set by hand on the customer.
  taxExempt?: boolean;
  // Buyer's Sri Lankan TIN (nine digits), for a VAT-registered buyer. Printed as "TIN" on their tax invoices (v325).
  tin?: string;
  // Outreach (lib/outreach.ts): whether they agreed to receive offers, their birthday (MM-DD or a full date), and when the
  // owner last messaged them. Set by hand on the Outreach page; nothing is sent by the app.
  marketingOptIn?: boolean;
  messagesRefused?: boolean; // v265: the customer asked not to be messaged at all; set by the owner. Service messages stop too (a booking they made still gets its confirmation).
  birthday?: string;
  lastContactedAt?: string;
  // The customer this one was referred by (a customer name, as typed on the sale). Feeds Referrers on Outreach.
  referredBy?: string;
  reviewRequestedAt?: string; // ISO day a review was asked for
  // A wholesale customer: the sale form offers the item's wholesale price (Product.wholesalePrice) as a one-tap suggestion.
  // Never changes a price by itself.
  wholesale?: boolean;
  contact?: string; // phone or email
  notes?: string;
  cac?: number; // Customer Acquisition Cost (optional, for unit economics calculations)
  // How this customer was acquired — one of CUSTOMER_LEAD_SOURCES, free text
  // also accepted (same pattern as OfferCostLine.category /
  // PROJECT_COST_CATEGORIES below). Purely a label: it doesn't feed the
  // CAC/LTV math itself (that still comes from the `cac` field above, which
  // is one number per customer, not a channel-level spend). What it does
  // enable is grouping customers by source on the Customers page — e.g.
  // seeing that "Referral" customers have a far better LTV:CAC than "Cold
  // outreach" ones — which the previous flat directory couldn't show since
  // there was nowhere to record how anyone found you in the first place.
  leadSource?: string;
  // Values for the extra details the owner named under Settings (lib/customerFields.ts), keyed by that name. Information only.
  customFields?: Record<string, string>;
  // Optional, owner/manager-set ceiling on how much credit (unpaid
  // balance) this customer should carry — purely advisory. Nothing in the
  // app blocks a sale or invoice when a customer is at or over it; it only
  // drives a warning on the Customers page and on the credit-sale form, so
  // a business can decide in the moment whether to extend more credit.
  // Unset or 0 means no limit is tracked for this customer.
  creditLimit?: number;
  // The "borrower record" half of the customer: where to find them, how to tell them apart from a namesake,
  // and who stands behind them. All optional free text, all management notes: nothing is checked against any
  // register or bureau. The same record serves a shop chasing a late invoice and a lender chasing a late loan.
  address?: string;
  idReference?: string; // e.g. national ID or business registration no., only to tell two people with one name apart
  guarantorName?: string;
  guarantorContact?: string;
  // Who chases this customer's late money (a team member's uid + the name at the time), set by the Owner.
  // Matched to receivables by customer name, like every other customer lookup in the app.
  collectorUid?: string;
  collectorName?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A supplier/vendor directory entry — the same lightweight, name-matching
// pattern as Customer above, and for the same reason: `Purchase.supplier`
// and `Expense.payee` both stay free-text fields (so nothing about
// existing purchases, expenses, or the payables/bills aging math changes),
// and this collection exists purely to (a) give a consistent list of names
// to pick from on those forms instead of retyping a slightly different
// spelling each time — "City Electric" one month, "City Electric Co." the
// next, silently splitting one supplier's history in two — and (b) anchor
// a per-supplier view — total spent, currently owed, contact info to chase
// a bill — computed by matching this `name` against existing purchases,
// expenses, and payables/bills data on the Suppliers page. No supplierId
// foreign key anywhere; matching is by name, same as Customer.
export interface Supplier {
  relatedParty?: boolean; // pass 350: purchases from them count in the related-party red flag.
  id: string;
  name: string;
  contact?: string; // phone or email
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// Grouped under five acquisition channels: Direct outreach (you contact
// them), Content & search (they find you), Paid attention (you pay to be
// seen), Physical outreach (in-person presence), Partner-driven (someone
// else sends them to you). Lets the dropdown stay readable and covers the
// usual inbound and outbound marketing routes. Repeat/Returning sits outside
// all of them since it's retention, not acquisition. Presets only: the field
// is free text, so any other channel can still be typed, and existing
// customers and leads keep whatever they already have.
export const CUSTOMER_LEAD_SOURCE_GROUPS: { group: string; options: string[] }[] = [
  { group: "Direct outreach", options: ["Cold outreach", "Wholesale outreach"] },
  { group: "Content & search", options: ["Search / SEO", "Content / blog / video", "Email / newsletter"] },
  { group: "Paid attention", options: ["Online/Website", "Social media", "Marketplace", "Search / display ads", "Influencer / affiliate", "Print / radio / TV"] },
  { group: "Physical outreach", options: ["Walk-in", "Flyers/local signage", "Event / trade show"] },
  { group: "Partner-driven", options: ["Referral", "Reseller/dealer partner"] },
];

export const CUSTOMER_LEAD_SOURCE_UNGROUPED = ["Repeat/Returning"];

// Flat list of every preset — used for "is this a known preset or custom
// text" checks. The dropdown itself renders the grouped form above.
export const CUSTOMER_LEAD_SOURCES = [
  ...CUSTOMER_LEAD_SOURCE_GROUPS.flatMap((g) => g.options),
  ...CUSTOMER_LEAD_SOURCE_UNGROUPED,
];

// ---------------------------------------------------------------------------
// Leads / pipeline — "outreach → follow-up → closing", upstream of the
// Customer directory above: a Customer only exists once someone's actually
// bought something, but plenty of outreach never gets that far, and that
// work still needs somewhere to live instead of being tracked in someone's
// head or a phone's notes app until it either closes or gets forgotten.
// Deliberately simple stages rather than a configurable pipeline builder —
// this covers "did I follow up with everyone I should have" for a
// solo-run or small-team SME, not a full sales-ops platform.
export type LeadStage = "new" | "contacted" | "qualified" | "follow_up" | "proposal_sent" | "won" | "lost";

export const LEAD_STAGES: { value: LeadStage; label: string }[] = [
  { value: "new", label: "New / inbound" },
  { value: "contacted", label: "Outreach sent" },
  // Vetted: they have the budget, the authority, a real need and a timeline. Worth a proposal; unvetted leads are not.
  { value: "qualified", label: "Qualified (budget, authority, need, timing)" },
  { value: "follow_up", label: "Following up" },
  { value: "proposal_sent", label: "Proposal / quote sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

// A won Lead is expected to become a Customer (and a Sale/Estimate)
// through the normal flow elsewhere in the app — see the "Convert to
// customer" action on the Leads page, which just calls addCustomer with
// this lead's details — rather than this record trying to duplicate that
// data entry itself. No foreign key to a Customer/Sale: same
// name-matching convention as Customer/Supplier above, not a relational
// link.
// One contact attempt on a lead. Logged by hand; Balancr never contacts anyone on its own.
export type LeadContactChannel = "call" | "whatsapp" | "email" | "meeting" | "visit" | "other";
export type LeadContactOutcome = "no_answer" | "left_message" | "spoke" | "meeting_set" | "asked_stop" | "not_interested";

export interface LeadContact {
  id: string;
  at: number; // epoch ms
  channel: LeadContactChannel;
  outcome: LeadContactOutcome;
  note?: string;
  byUid?: string;
  byName?: string;
}

// Where a lead is in its follow-up sequence (lib/leadPipeline.ts holds the steps). doneSteps counts touches already logged.
export interface LeadSequenceState {
  key: string;
  startedOn: string; // ISO date the sequence started; step 1 is due this day
  doneSteps: number;
}

export interface Lead {
  id: string;
  name: string;
  contact?: string; // phone or email
  // Same free-text pattern as Customer.leadSource just above — one of
  // CUSTOMER_LEAD_SOURCES, or anything typed. Carried over to the
  // Customer record on conversion so the acquisition-channel view on the
  // Customers page stays accurate for pipeline-sourced customers too.
  source?: string;
  stage: LeadStage;
  estValue?: number; // what the deal looks like it's worth if it closes — optional, purely for a pipeline-value view, never touches revenue/COGS
  notes?: string;
  nextFollowUpDate?: string; // ISO date — enables a "due for follow-up" view without a separate reminders system
  lostReason?: string; // only meaningful when stage === "lost"
  // Set once "Convert to customer" has actually been used on this lead
  // (see app/leads/page.tsx). addCustomer has no duplicate-name detection
  // anywhere in this app — the plain "+ Add customer" form doesn't either,
  // so this isn't a new gap to close there — but a one-click button is
  // far easier to trigger twice by accident (a slow network, or coming
  // back to an already-converted Won lead days later) than retyping a
  // name into a form deliberately. This field is what lets the UI hide
  // the button and show "Converted" instead, once it's already been used,
  // so that specific accidental-double-click path can't fragment one
  // customer's history across two records.
  convertedToCustomerAt?: number;
  // The sale recorded from this lead once it was Won (lib/leadSales.ts). Set once; a lead with a sale stays Won.
  saleId?: string;
  // ---- v175: contact log, ownership, opt-out, follow-up sequence, close timing, re-engagement, attribution ----
  // Every contact attempt on this lead, newest last. Capped at 200 per lead (lib/leadPipeline.ts). Append-only in the UI.
  contacts?: LeadContact[];
  firstContactedAt?: number; // epoch ms of the first logged contact; speed-to-lead is this minus createdAt
  lastContactedAt?: number; // epoch ms of the latest logged contact
  // Who is working this lead. Absent = unassigned. The owner/manager assigns; the assignee (staff) can log contacts on it.
  ownerUid?: string;
  ownerName?: string;
  // Set when the person asked not to be contacted (or the owner set it). Blocks every new contact attempt and any sequence.
  doNotContact?: boolean;
  sequence?: LeadSequenceState;
  // ISO date the owner expects the deal to close. Drives the "closing this month" view.
  expectedCloseDate?: string;
  // ISO date to look at a Lost lead again. Drives the "revisit" list.
  revisitOn?: string;
  // Where an online enquiry came from: utm_source / utm_campaign from the link they followed, and the referring site.
  campaign?: string;
  referrer?: string;
  // How the person said they heard about the business (from the enquiry form's list).
  howHeard?: string;
  // v176b: match keys for duplicate detection ("p:+94..." for a phone, "e:name@x.com" for an email) and the id a calling tool gave it.
  contactKeys?: string[];
  externalId?: string;
  consentToContact?: boolean; // what the person said on the form or to the calling tool, when it was asked
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// An opening balance: money a customer already owed the business (kind
// "receivable") or the business already owed a supplier (kind "payable") on the
// day the owner started using the app. It exists so a business that is already
// running can move over without re-entering old invoices as sales — which would
// book revenue in a month that already happened and distort the P&L.
//
// It is NOT revenue or a cost. On the Balance Sheet the amount sits as an asset
// (receivable) or liability (payable) with the matching entry in owner's capital
// (see computeBalanceSheet's `openingEquity`), exactly like cash and stock
// brought in on day one. Collections and supplier payments against it reuse the
// normal ReceivablePayment / PayablePayment records (keyed by this doc's id, the
// same way they are keyed by a sale or purchase id), so they move cash through
// the existing cash-basis code with no special case there. A write-off of an
// opening receivable is a real bad-debt expense, the same as for any invoice.
export interface OpeningBalance {
  id: string;
  kind: "receivable" | "payable";
  party: string; // customer or supplier name
  contact?: string; // phone/email — receivables only, used to chase
  amount: number; // what was owed on `date`, in the base currency
  date: string; // ISO date — the day the owner started using the app
  dueDate: string; // ISO date the money is/was due
  note?: string; // e.g. the paper invoice number
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A payment collected against a credit sale. Deliberately its own
// append-only record rather than an `amountPaid` field mutated on the Sale:
// that means collecting a payment never requires "edit" permission on
// Sales, so Staff can take a customer's cash against an outstanding credit
// sale without ever being able to alter the original sale record — and the
// business keeps a full history of who collected what, when, instead of a
// single overwritten running total.
export interface ReceivablePayment {
  id: string;
  saleId: string;
  amount: number;
  date: string; // ISO date
  method: "cash" | "card" | "bank_transfer";
  note?: string;
  // Who actually went and got the money, when that is not whoever typed it in (the owner logging a payment a
  // field officer collected on the road). Left out = the person who recorded it collected it.
  collectedByUid?: string;
  collectedByName?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A bad-debt write-off against a credit sale — the "this customer is never
// paying" counterpart to ReceivablePayment's "this customer paid". Revenue
// on a credit sale is recognized (accrual basis) the moment it's made, long
// before it's collected; without a write-off, a customer who simply never
// pays leaves that revenue sitting in both the P&L (as profit already
// earned) and the Balance Sheet (as an asset — accounts receivable) forever,
// even once everyone involved knows it's uncollectible. Recording a
// write-off here does two things: removes the amount from Receivables
// Aging/outstanding (via computeReceivablesAging) and records it as a
// same-sized bad debt expense in the month it's written off (via
// computeMonthlyPnL's badDebtExpense), which is what actually corrects the
// earlier overstated profit — see the Balance Sheet FIX note above this
// comment for the same "recognized on paper isn't the same as real" logic
// applied to receivables generally. Deliberately its own append-only
// record, same reasoning as ReceivablePayment: a full audit trail of who
// wrote off what and why, and Staff never gets a path to erase a sale's
// balance quietly. Partial write-offs are allowed (e.g. settling for 60% of
// an old invoice) — `amount` need not equal the sale's full outstanding
// balance.
export interface ReceivableWriteOff {
  id: string;
  saleId: string;
  amount: number; // base currency, > 0
  date: string; // ISO date — which month absorbs the bad debt expense
  reason?: string; // "customer unreachable", "business closed", "settled for less", etc.
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A payment made against a credit purchase (payable). Mirrors ReceivablePayment
// for supplier payments — append-only for the same audit trail and permission
// separation reasons.
export interface PayablePayment {
  id: string;
  purchaseId: string;
  amount: number;
  date: string; // ISO date
  method: "cash" | "card" | "bank_transfer";
  note?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A payment made against an unpaid, one-off Expense (a general bill — rent,
// a contractor invoice, an employee pay run entered as its own line, a
// utility bill). Mirrors PayablePayment exactly, one level further down the
// same "credit purchases can be paid off in parts, over time" pattern, for
// bills that aren't tied to an inventory Purchase at all.
export interface BillPayment {
  id: string;
  expenseId: string;
  amount: number;
  date: string; // ISO date
  method: "cash" | "card" | "bank_transfer";
  note?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Bank reconciliation — matching what the books say happened against what
// the bank statement says happened. Deliberately manual/offline: no bank
// feed API, no external aggregator (Plaid etc). The person exports or
// screenshots their real statement and either pastes/CSV-imports the lines
// here or adds them by hand; matching a line to a book record is always a
// human decision (see ReconciliationMatchCandidate in lib/calculations.ts
// for how the app SUGGESTS candidates), never automatic. This is a
// reconciliation aid, not a bank integration.
// ---------------------------------------------------------------------------

export type BankLineStatus = "unmatched" | "matched" | "ignored";

export interface BankStatementLine {
  id: string;
  date: string; // ISO date, as printed on the bank statement
  description: string; // whatever the bank printed — "POS KAMAL HARDWARE", "DD RENT", etc.
  amount: number; // base currency; positive = money in, negative = money out
  status: BankLineStatus;
  // v319: the Plaid transaction id, set only on a line read by the automatic bank feed (lib/bankFeed.ts). A re-read never imports it twice.
  feedTxnId?: string;
  // Free text the person enters when they mark a line matched — usually
  // copied from whichever candidate they picked ("Sale to Kamal, 4 Sep") or
  // typed by hand when no candidate fit. Purely descriptive; there is no
  // enforced link back to a specific Sale/Purchase/Expense id, because the
  // whole point is this is a human-confirmed note, not a second ledger.
  matchNote?: string;
  // Who marked this line matched/ignored, and when - stamped by DataContext so the person who
  // reviews the bank statement is on record next to the line (a basic separation-of-duties check:
  // the owner can see at a glance that the reviewer is not the person who made the payments).
  reviewedByName?: string;
  reviewedAt?: number;
  createdAt: number;
}

export const EXPENSE_CATEGORIES = [
  "Marketing",
  "Rent & utilities",
  "Payroll & labor",
  "Sales payroll", // v177d: sales staff pay, a Selling expense on the income statement (lib/sga.ts)
  "Software & tools",
  "Transport & logistics",
  "Professional fees",
  "Insurance",
  "Bank & payment fees",
  "Other overhead",
] as const;

// Covers both operating expenses AND recurring revenue (retainers, subscriptions,
// rent income, etc). "kind" decides which side of the P&L it lands on.
export type ExpenseImportance = "essential" | "useful" | "optional";

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  kind: "expense" | "revenue";
  isRecurring: boolean;
  recurrence: Recurrence;
  startDate: string; // ISO date
  endDate?: string; // ISO date, optional (ongoing if absent)
  employeeId?: string; // set when this expense is the auto-managed payroll line for an Employee
  // Who this one-off bill is owed to — a supplier, contractor, or employee
  // name (e.g. "Priya" for a salary run, "City Electricity Board" for a
  // utility bill). Purely a display label for the Bills payable list;
  // doesn't link to any other record. Only meaningful alongside
  // paymentStatus below.
  payee?: string;
  // Receipt photo or PDF (v332): the download link and the storage path, stored by lib/receiptUpload.ts.
  receiptUrl?: string;
  receiptPath?: string;
  // Paid/unpaid status for a ONE-OFF expense (kind: "expense", isRecurring:
  // false) only — a discrete, dated bill you may have been billed for
  // before you actually paid it (a contractor invoice, a utility bill, an
  // employee's pay run entered as its own dated line). Absent or "paid"
  // means exactly what every Expense meant before this field existed: cash
  // left the business the moment it was recorded — zero behavior change
  // for every pre-existing record. "unpaid" means the cost is real and
  // counted in this month's P&L (accrual) but the cash hasn't gone out yet
  // — it shows up on the Bills tab of the Money Owed page until a
  // BillPayment is recorded against it, same two-step (recognize now, pay
  // later) that credit Purchases already get via PayablePayment. Recurring
  // flat expenses (rent, subscriptions, auto-managed payroll) deliberately
  // don't get this: they have no single discrete instance to mark paid or
  // not, same reasoning as their exclusion from bank-reconciliation
  // candidates below.
  paymentStatus?: "paid" | "unpaid";
  // How much the business needs this cost, for the spending review on the Expenses page and the "what could I pause"
  // advice when cash is tight. Absent means not reviewed yet. Changes no numbers anywhere.
  importance?: ExpenseImportance;
  // Which way of finding customers this marketing spend was for (the same names as Lead.source and Customer.leadSource,
  // for example "Social media" or "Search / display ads"). Only used for the "Marketing by channel" card; it changes no
  // figure in the books. Absent means not tagged.
  channel?: string;
  // Due date for an unpaid bill — defaults to startDate if absent when the
  // bill is unpaid (mirrors Purchase.dueDate ?? date). Unused when paid.
  dueDate?: string;
  // Optional link to a Project — set when this one-off cost (a permit, a
  // rental, a subcontractor invoice) belongs to a specific job rather than
  // general overhead. Only meaningful for kind === "expense". Purely
  // additive. See ProjectCostSegment below.
  projectId?: string;
  // Optional link to a Location — set when this one-off or recurring cost
  // (branch rent, a branch's utility bill, a repair at one shop) is really
  // that location's own cost rather than shared/business-wide overhead.
  // Purely additive, mirrors projectId immediately above. Only meaningful
  // for kind === "expense". Absent means "shared overhead, not split by
  // location" — the correct default for most expenses (a generic
  // subscription, head-office admin, owner's own costs) and the only
  // behavior every pre-existing Expense had before this field existed. See
  // computeLocationProfitability in lib/calculations.ts for how a tagged
  // expense feeds into that location's numbers, and why an UNtagged one
  // deliberately never gets allocated to any location.
  locationId?: string;
  // Optional itemized breakdown — lets one Expense show what it's made of
  // (e.g. "Operations": Electricity 340, Water 60, Internet 45, Supplies
  // 210) instead of being a single opaque number. When present, `amount`
  // is kept equal to the sum of these — set that way by whatever writes
  // it (see RecurringExpenseOccurrence below for the usual source), not
  // enforced by the type itself. Freely usable on a one-off Expense too,
  // not just ones that came from a recurring template.
  breakdown?: ExpenseBreakdownLine[];
  // Input tax (VAT/GST/etc) reclaimable on this expense — the mirror of
  // Purchase.taxAmount, for the non-stock side of the ledger (rent,
  // utilities, subcontractor services, professional fees, and so on).
  // Unlike Purchase/Sale, this is NOT auto-computed from the flat rate for
  // every row: not every expense category carries reclaimable tax (wages,
  // bank fees, and many insurance premiums typically don't), so the person
  // logging the expense opts in per-entry (see the "Reclaimable tax on this
  // expense" checkbox in the form) and the amount is snapshotted here at
  // that point, same reasoning as Purchase.taxAmount — changing the rate
  // later shouldn't rewrite historical expenses. Absent or 0 means no
  // reclaimable tax on this expense. Kept OUT of `amount` so P&L/MRR/every
  // existing calculation keeps reading `amount` exactly as before; only the
  // Tax summary on the Statements page reads this back out, alongside
  // Purchase.taxAmount, to make up total input tax for the period.
  taxAmount?: number;
  createdAt: number;
  createdByUid?: string; // who entered it (set on new entries; older ones have none and are not reviewed)
  createdByName?: string;
}

export interface ExpenseBreakdownLine {
  label: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Recurring, ITEMIZED expenses — for a cost like "Operations" that happens
// every period but whose actual total drifts month to month (utilities,
// supplies, small variable overhead), as opposed to Expense.isRecurring
// above, which is for a genuinely FLAT recurring cost (rent, a fixed
// subscription): that one holds a single `amount` and projects it onto
// every month on the fly via monthlyNormalizedAmount().
//
// A flat recurring Expense can't safely represent a fluctuating cost: since
// there's no separate record per month, editing `amount` to reflect this
// month's real bill retroactively changes every PAST month's P&L too — the
// projection is computed live from whatever the field currently holds, for
// any month in the active window.
//
// This mirrors RecurringInvoice on the sales side instead: a template
// that, each period, produces a real, dated, editable record — not a
// formula. The one difference from RecurringInvoice (which posts straight
// to a real Sale) is that generation here first creates a
// RecurringExpenseOccurrence in "pending" status: the actual bills for a
// period usually aren't known the moment the period starts, so the line
// amounts need a chance to be reviewed/adjusted before anything lands in
// the ledger. See generateDueRecurringExpenses / postExpenseOccurrence in
// DataContext for the generate-then-confirm flow.
// ---------------------------------------------------------------------------

export interface RecurringExpenseLine {
  label: string;
  amount: number; // default/expected amount for this line
}

export interface RecurringExpenseTemplate {
  id: string;
  name: string; // e.g. "Operations"
  category: string; // Expense category the generated occurrence is filed under
  lines: RecurringExpenseLine[]; // defaults each new occurrence starts from
  recurrence: Exclude<Recurrence, "none">;
  startDate: string; // ISO date
  endDate?: string; // ISO date, optional (runs indefinitely if absent)
  active: boolean; // pausing stops generation without losing the schedule or its history
  notes?: string;
  nextDueDate: string; // ISO date of the next occurrence still to be generated
  lastGeneratedDate?: string; // ISO date this schedule last generated an occurrence
  autopay?: boolean; // v286: post each occurrence by itself when it falls due (lib/recurringAutopay.ts); absent or false = wait in the Pending list
  lastExpenseId?: string; // Expense.id of the most recently POSTED occurrence
  createdAt: number;
}

// One period's actual instance of a RecurringExpenseTemplate. Starts
// "pending" the moment its due date arrives, with `lines` defaulted from
// the PREVIOUS posted occurrence's actual amounts where one exists (this
// period usually looks like last period, not like the template's original
// guess), else from the template itself. Nothing posts to the ledger —
// zero P&L impact, doesn't appear as an Expense anywhere — until it's
// reviewed, optionally edited, and posted: that's the moment the real
// Expense doc (with this same breakdown) gets created and `status` flips
// to "posted".
export interface RecurringExpenseOccurrence {
  id: string;
  templateId: string;
  period: string; // ISO date this occurrence is for (the due date it was generated on)
  lines: RecurringExpenseLine[]; // editable up until posted
  status: "pending" | "posted";
  expenseId?: string; // set once posted — the real Expense this occurrence produced
  postedAt?: number;
  createdAt: number;
}

// An employee/contractor on payroll. Adding one automatically books their pay
// as a recurring expense (category "Payroll & labor") so it flows straight
// into MRR, monthly P&L, and the spend-by-category breakdown — payroll is
// just another recurring bill, bookkept the same way rent or a subscription
// is, rather than a separate system. taxPct is the employee's own
// withholding/PAYE rate: informational only (splits take-home vs. tax
// remitted) and does NOT change what the business pays out — gross pay is
// the real cash cost and is what's booked as the expense.
export interface Employee {
  id: string;
  name: string;
  role: string;
  payRate: number; // gross pay per pay period
  payFrequency: Exclude<Recurrence, "none">;
  taxPct: number; // employee's personal tax/withholding %, for take-home reference only
  // v320: how this person's pay is taxed (lib/payTax.ts). Absent means "flat", which uses taxPct as before.
  // "apit": employment income, from the 2026/27 APIT bands. "service_wht": a service payment to a resident individual, 5% over Rs 100,000 a month.
  taxMode?: "flat" | "apit" | "service_wht";
  // Sri Lanka EPF/ETF: employer contributes 12% (EPF) + 3% (ETF) of gross pay
  // on top of it, and the employee's own 8% EPF share comes out of their
  // gross pay. Default true for real staff; turn off for the owner
  // themself, family labor, or anyone who isn't legally an EPF/ETF-covered
  // employee. See SL_EPF_EMPLOYER_PCT etc. in lib/calculations.ts — these
  // are fixed statutory rates, not a per-business assumption, so they
  // aren't user-editable the way the VAT rate is.
  epfEtfApplicable: boolean;
  startDate: string; // ISO date
  weeklyOffDay?: number; // v286: regular day off, 0 = Sunday to 6 = Saturday (lib/weeklyOff.ts); absent = none set
  endDate?: string; // ISO date, set when employee becomes inactive
  exitInterviewOn?: string; // v231: the day the exit interview was held (owner only)
  exitNotes?: string; // v231: what the exit interview covered (owner only)
  severanceAmount?: number; // v231: severance or final settlement paid, as entered by the owner (owner only)
  severanceNote?: string; // v231: how it was worked out, in the owner's words (owner only)
  active: boolean;
  notes?: string;
  // Sales commission (see lib/commission.ts). `commissionPct` is a share of the net sales (before sales tax, less
  // returns) that the linked login recorded in a month; 0 or absent means no commission. `commissionMemberUid` is the
  // team login (Member.id) whose sales count, matched against Sale.createdByUid. Nothing is booked automatically: the
  // owner reviews the month's figure on the Employees page and records it as an expense when they pay it.
  commissionPct?: number;
  commissionMemberUid?: string;
  // v239: rate tiers: from this share of the monthly target, this commission rate (lib/commissionTiers.ts). Absent: the single rate applies.
  commissionTiers?: { fromPct: number; pct: number }[];
  // What the commission rate is applied to: the person's net sales (the default, and what absent means) or the profit
  // those sales left (contribution after cost of goods and per-sale costs, net of returns and discounts). Profit lines
  // up pay with what the business keeps; sales is simpler to explain. See lib/commission.ts.
  commissionBasis?: "sales" | "profit";
  // Paid leave days this person gets a year, all paid kinds together (see lib/leave.ts). 0 or absent: leave is not tracked
  // against an allowance for them. The business decides the number; Balancr does not know what the law gives anyone.
  leaveDaysPerYear?: number;
  linkedExpenseId?: string; // the auto-managed Expense doc this employee's pay is booked as
  createdAt: number;
}

export interface VariableCost {
  id: string;
  name: string;
  // "per_unit": flat amount added to every unit sold (any product, unless productId set)
  // "percent": percentage of the sale's revenue
  type: "per_unit" | "percent";
  amount: number;
  productId?: string; // if absent, applies globally to all products
  createdAt: number;
  // If true, this cost is treated as part of Cost of Goods Sold and reduces
  // Gross Profit — the right setting for something like outbound shipping,
  // which most SME accounting treats as COGS, not a below-the-line cost.
  // If false/unset (the default — every VariableCost created before this
  // field existed behaves exactly as it did before), it only reduces
  // Contribution Margin, sitting below Gross Profit — the right setting for
  // payment processing fees, marketplace commissions, variable marketing
  // spend, and similar costs that aren't part of "what it cost to make/
  // acquire the thing you sold".
  includeInCogs?: boolean;
}

// Capital in/out of the business — separate from operating P&L. Tracks the
// initial investment, any reinvestment, and owner withdrawals, so the
// dashboard can show payback progress and cash position rather than only
// month-to-month profit.
export type CapitalKind = "investment" | "reinvestment" | "withdrawal";

export interface CapitalEntry {
  id: string;
  kind: CapitalKind;
  amount: number;
  date: string; // ISO date
  notes?: string;
  createdAt: number;
  // Investor pool (see lib/investorPool.ts). Set when the money came from, or went back to, an outside investor
  // in one specific investment (e.g. a crowdfunded land purchase). `securityId` is that investment and
  // `investorName` is who. Untagged entries are the owner's own capital, exactly as before. A pool entry still
  // counts as normal equity on the cash flow and balance sheet; it is only kept out of the owner-draw warnings.
  securityId?: string;
  investorName?: string;
  // On a pool "withdrawal": a dividend out of profit, or a return of the investor's own capital.
  distribution?: "profit" | "capital";
}

// A payment the business actually sent to its tax authority, entered by the
// owner/manager themselves — closes the "salesTaxPayable is cumulative
// activity, not a live balance" limitation called out on
// BalanceSheet.salesTaxPayable and the Statements page. Deliberately just
// one number per remittance (mirrors CapitalEntry's shape) rather than a
// real tax-filing record (period covered, return reference, penalties,
// e-filing status) — this app doesn't file or submit anything to any tax
// authority, doesn't validate the amount against any external return, and
// doesn't know your filing calendar. It only lets you record "I paid the
// tax office this much, on this date" so computeBalanceSheet can net it out
// of what the ledger still thinks you owe. Treat the actual filing/payment
// as something you did with your tax authority directly; this is just the
// bookkeeping entry for it.
export interface TaxPayment {
  id: string;
  amount: number;
  date: string; // ISO date the payment was made
  notes?: string; // e.g. "Q1 VAT remittance", a return/reference number
  createdAt: number;
}

// A bank/supplier loan or other business debt. Monthly amortizing loan —
// this is what SMEs actually take (working capital loan, equipment loan,
// overdraft converted to term loan) — so the schedule assumes monthly
// payments rather than modeling every possible frequency. startDate is the
// disbursement date; the first payment falls one month after it.
export interface Loan {
  id: string;
  name: string; // e.g. "BOC working capital loan"
  lender?: string;
  principal: number; // original amount borrowed
  annualInterestRatePct: number; // nominal annual rate, e.g. 14 = 14%
  variable?: boolean; // v254: the rate can rise (a variable-rate loan); a rate rise is stressed on the scenario screen (lib/rateStress.ts)
  termMonths: number; // number of monthly payments
  startDate: string; // ISO date — disbursement date
  notes?: string;
  active: boolean; // false = closed/paid off early, kept for history but excluded from "current" liability views
  createdAt: number;
}

// A month's revenue/expense targets — the "use budgets to guide decisions"
// half of financial planning, stored deliberately as one number each rather
// than a category-by-category budget. A per-category budget is a real
// feature in its own right (allocation rules, rollover, category mapping)
// and would be scope creep for what an SME actually needs here: something
// to hold themselves to and see, plainly, whether they beat or missed it —
// which the two totals already do against the same actuals
// (MonthlyPnL.totalRevenue / operatingExpenses) shown everywhere else in
// Statements. See app/statements/page.tsx's "Budget" tab and
// DataContext.saveBudget.
export interface MonthlyBudget {
  revenueTarget: number;
  expenseTarget: number;
}

// Stored as a single map at users/{businessId}/meta/budgets — one small
// doc, not a collection — keyed by "YYYY-MM", the same month-key format
// MonthlyPnL already uses. A handful of months of targets is nowhere near
// Firestore's 1MB doc limit, and a single doc means one read/one listener
// for the whole history instead of a collection + per-month CRUD, which
// would be a lot of new surface area for "type two numbers, once a month."
export type Budgets = Record<string, MonthlyBudget>;

// Who owns the business, for planning a raise of outside money (see lib/equity.ts). A working record and a
// what-if tool, NOT a legal share register: nothing here is filed with, or checked against, any registry or
// authority, and it never moves money. Owner only. Lives on the settings doc, so it is in the backup.
export interface EquityHolder { id: string; name: string; shares: number }
export interface EquityRound {
  id: string;
  date: string; // ISO date
  investor: string;
  amount: number; // money raised
  shares: number; // new shares issued
  preMoney: number; // what the business was valued at before the money
  postMoney: number; // preMoney + amount
}
export interface UseOfFundsLine { id: string; purpose: string; amount: number }
// A dividend paid to the people on the cap table, split by shares (lib/shareholderDividends.ts). The split is stored with the
// dividend as it was when declared, so later changes to the cap table never rewrite history. Its cash is a capital withdrawal
// (capitalEntryId), removed with it if the dividend is deleted.
export interface ShareholderDividend {
  id: string;
  date: string; // ISO date the dividend is paid
  amount: number; // total declared, before tax (the company pays this gross)
  note?: string;
  capitalEntryId?: string;
  withholdingPct?: number; // v290: tax withheld, as a % of each person's share (0 or absent = none)
  withheld?: number; // v290: total tax withheld across everyone
  allocations: { holderId: string; name: string; shares: number; amount: number; withheld?: number; net?: number }[];
}
// A board or advisory meeting on record (v289, lib/boardMeetings.ts). Actions carry an owner and a due date and are followed up until done.
export interface BoardAction { id: string; text: string; owner: string; due: string; done: boolean } // due "" = no date
export interface BoardMeeting {
  id: string;
  date: string; // ISO date of the meeting
  attendees: string[];
  agenda: string;
  decisions: string;
  keyRisks: string;
  actions: BoardAction[];
}
export interface EquityPlan {
  holders: EquityHolder[];
  rounds?: EquityRound[];
  useOfFunds?: UseOfFundsLine[];
  dividends?: ShareholderDividend[]; // v289
}

// How the cost of goods sold (and the value of stock on hand) is worked out.
//   average - one blended average cost per product (weighted average cost). The default, and what every business had before.
//   batch   - each sale is costed at the cost of the batch(es) it drew from: the batch picked on the sale form, otherwise the
//             one expiring soonest, otherwise the oldest delivery (lib/batchLedger.ts computeProductLedgerByBatch).
// Costs are always derived from the records, so switching restates every past figure, not just future ones.
export type CostingMethod = "average" | "batch";

// Automations you can switch on or off (lib/integrations.ts). Each one only sets fields on records; none sends a message.
export interface AutomationSettings {
  autoAssignInbound?: boolean; // a new inbound lead (website form or API) goes to the operating member with the fewest open leads
  autoFollowUpInbound?: boolean; // a new inbound lead is due for follow-up today
  autoSequenceInbound?: boolean; // a new inbound lead starts the new-enquiry follow-up sequence
  mergeDuplicateInbound?: boolean; // a repeat enquiry from someone already on file is added to that lead instead of filed twice (default on)
  autoRevisitLostDays?: number; // a lead marked Lost is set to be looked at again after this many days (0 = off)
  autoFollowUpAfterProposalDays?: number; // a lead moved to Proposal sent gets a follow-up this many days later, if it has none (0 = off)
  automationsPaused?: boolean;
  alertCycleCounts?: boolean; // A-value stock that is due a count shows on the Agenda (default on: it only lists)
  alertWeeklyReview?: boolean; // on Mondays the Agenda lists the operations review and how many items need a decision (default on)
  alertCapacity?: boolean; // a day with more booked than rostered, or booked with nobody rostered, shows on the Agenda (default on)
  alertEscalations?: boolean; // items overdue by a month or more show on the Agenda (default on: it only lists)
  alertActions?: boolean; // an open management decision whose day is near or past shows on the Agenda (default on: it only lists) // the owner's one switch: stops every automatic change to leads and the webhook push until switched back on
  alertInspections?: boolean; // an inspection that is due shows on the Agenda (default on: it only lists)
  alertLowReviews?: boolean; // a review of 1 or 2 stars that arrives through the review API raises an alert (default on: it only alerts)
  defaultCountryCode?: string; // digits only, e.g. 94 for Sri Lanka, 1 for the US; reads local phone numbers for matching
  // Quiet hours for text messages (lib/quietHours.ts): texts go out only inside this window in this time zone. Unset = no window.
  smsTimeZone?: string;
  smsSendFromHour?: number;
  smsSendUntilHour?: number;
  // A web address (https, public) that each new inbound lead is posted to as JSON, e.g. a Zapier catch hook. Empty = off.
  outboundWebhookUrl?: string;
}

// v319: a POS export layout the owner has saved under a name. `mapping` maps Balancr's sales fields to the file's own column headers.
export interface PosVendorProfile {
  name: string;
  mapping: Record<string, string | null>; // product, date, qty, unitPrice, paymentMethod, transactionId -> the file's column header, or null
  priceIsTotal: boolean; // the mapped price column is the line's total, not a per-item price
  savedAt: number;
}

export interface Settings {
  // v202b: monthly revenue target for each salesperson, keyed by their member id (the sales team scorecard reads it)
  salesTargets?: Record<string, number>;
  royaltyRates?: Record<string, number>; // v216b: franchise royalty share of sales, per location id (lib/royalty.ts)
  businessKind?: string;
  showAllScreens?: boolean; // v241: show every operations screen whatever the business type (default: screens that do not fit the type are hidden)
  // v319: named column mappings for POS sales exports (lib/posVendorProfile.ts). Used only when the owner picks one in the import wizard.
  posVendorProfiles?: PosVendorProfile[];
  accrualReviewMonths?: string[]; // v209: months the owner has confirmed need no accruals (the close checklist reads it) // v205b: the kind of business chosen in the starter setup (lib/starterSets.ts)
  // Automations switched on or off by the owner (Settings > Automations).
  automations?: AutomationSettings;
  // The most a Manager can approve on a spend request or expense claim (lib/operations.ts). Owner sets it; no limit = Owners only.
  managerApprovalLimit?: number;
  // Purchase orders above this amount wait for an owner or manager to approve them (lib/poApproval.ts). 0 or unset = no approval step.
  poApprovalAbove?: number;
  autoDraftOrders?: boolean; // v243: draft the orders that are due each day, for review
  lastAutoDraftOn?: string; // the day the drafts were last made
  // Names of the extra customer details (lib/customerFields.ts), up to four.
  customerFieldLabels?: string[];
  // Promo codes for the sale form (lib/promoCodes.ts): code -> percent off. A code fills in a lower price; it books no discount.
  promoCodes?: Record<string, number>;
  // What you spent on each promo campaign, keyed by code (lib/promoCodes.ts). A comparison only: never posted to expenses or profit.
  campaignSpend?: Record<string, number>;
  // A standing monthly budget per expense category, e.g. { "Marketing": 50000 }. Set by the owner on the Expenses page and
  // compared with what was actually spent that month (lib/categoryBudgets.ts). A plan to hold yourself to: it changes no
  // expense, profit or cash figure. Lives on the settings doc, so it is in the backup.
  categoryBudgets?: Record<string, number>;
  // Optional late payment charge shown on overdue invoices and in reminders (lib/lateFees.ts): a monthly % of what is still
  // owed once the grace period has passed. 0 or absent = off. Advisory only: never posted to the books.
  lateFeeMonthlyPct?: number;
  lateFeeGraceDays?: number;
  // Shareholders, past raises and the use-of-funds plan. Only ever written by the Profitability page's
  // "Selling a share of the business" section (and DataContext.recordEquityRaise), never by the general Settings form.
  equity?: EquityPlan;
  costingMethod?: CostingMethod; // absent = "average". See CostingMethod.
  taxRatePct: number; // e.g. 15 = 15% — INCOME tax, applied to positive pre-tax profit in the P&L (see computeMonthlyPnL). Not charged to customers.
  // Sales tax charged TO CUSTOMERS on a sale (VAT/GST/whatever it's called
  // locally) — a completely separate thing from taxRatePct above. Off by
  // default: an SME with no obligation to charge it shouldn't see a tax
  // line appear on their invoices unprompted. When on, QuickSaleForm and
  // MultiItemInvoiceForm compute it from salesTaxRatePct and snapshot the
  // result onto each Sale.taxAmount, and the printed
  // receipt/invoice/receivables math (computeReceivablesAging) add it on
  // top of the untaxed sale price. Purely a rate + a label — no filing,
  // no external compliance system, matching the app's deliberate scope.
  salesTaxEnabled?: boolean;
  salesTaxRatePct?: number; // e.g. 15 = 15%
  salesTaxLabel?: string; // e.g. "VAT", "GST", "Sales Tax" — printed on invoices/receipts
  currency: string; // e.g. "LKR", "USD", "AED"
  forecastMonths: number; // how many months forward to project
  defaultOrderingCost: number; // fallback S for EOQ when a product doesn't set its own
  defaultHoldingCostPct: number; // fallback annual holding-cost % of unit cost
  defaultLeadTimeDays: number; // fallback supplier lead time in days
  // Extra days of demand to hold on top of the lead time before a "reorder now" flag fires
  // (a cushion for erratic demand or late deliveries). 0 / unset = no cushion, i.e. the
  // reorder point is exactly daily demand x lead time, as before.
  defaultSafetyStockDays?: number;
  // The service item a customer delivery charge is booked against ("Delivery charge"). Set when the owner turns the
  // delivery line on (Settings -> General); absent = the sale forms show no delivery box. See lib/delivery.ts.
  deliveryProductId?: string;
  // Imputed monthly cost of the owner's own labor — what you'd have to pay
  // someone to do your job if you weren't doing it. Not a real transaction
  // and never touches the accounting statements; purely a decision-support
  // number so "we're profitable" isn't an illusion built on nobody paying
  // themselves for the hours they put in.
  monthlyOwnerDraw?: number;
  // Default credit term offered to a customer when a sale is marked
  // "credit" and no term is entered on that sale specifically.
  defaultCreditTermDays: number;
  // Credit sales at or above this amount get visually flagged on the
  // Receivables page — not blocked, just surfaced, since the biggest single
  // fraud vector in a credit-heavy shop is a large "sale" that was never
  // really owed and never gets chased.
  creditReviewThreshold: number;
  // Owner review (lib/reviewQueue.ts): a discount, expense, sales return or cash refund a team member makes above this amount is
  // listed on the dashboard until someone marks it checked. 0 or absent = off. Flags only; nothing is blocked.
  reviewAbove?: number;
  // Loyalty (lib/loyalty.ts): one point for every this-much a customer spends. 0 or absent = off.
  loyaltyEvery?: number;
  // Rent (or any single largest fixed monthly outflow) — what the Cash
  // Runway tool is checking you can cover.
  rentAmount: number;
  rentDueDayOfMonth: number; // 1-28, day of month rent is due
  // Starting float assumed for a new cash-count session when nothing else
  // is entered.
  defaultOpeningFloat: number;
  // Business identity for printed documents (project quotes/invoices — see
  // buildQuoteHtml/buildInvoiceHtml in app/projects/page.tsx). All optional
  // and all purely cosmetic — nothing elsewhere in the app reads these, so
  // leaving them blank never breaks anything, it just means the printed
  // document has no letterhead.
  businessName?: string;
  profitSplit?: { reinvestPct?: number; takeHomePct?: number; costOfCapitalPct?: number; costOfEquityPct?: number; recurringTargetPct?: number; valuationMultiple?: number; sharesInIssue?: number; riskFreePct?: number; beta?: number; equityRiskPremiumPct?: number; latestDividendPerShare?: number; dividendGrowthPct?: number; payoutPct?: number; partners?: { name: string; pct: number }[] };
  sustainabilityTargets?: Record<string, number>; // v255: targets per measured category (lib/sustainability.ts) // v252: targets for the profit split (lib/profitSplit.ts)
  bankRules?: { id: string; contains: string; direction: "in" | "out" | "any"; action: { kind: "ignore" } | { kind: "match"; label: string } }[]; // v251: rules for bank lines (lib/bankRules.ts)
  // Where a customer leaves a review (for example your Google review link). Used by the review request message on Outreach.
  reviewLink?: string;
  businessAddress?: string;
  businessPhone?: string;
  // Sri Lankan tax identity, printed under the business name on every document (see buildLetterheadHtml). Typed by the owner;
  // nothing checks them against the IRD. Leave blank if the business is not VAT-registered.
  taxIdNumber?: string; // TIN
  vatRegistrationNo?: string; // VAT registration number, only if VAT-registered
  // When on: a sale cannot be edited or deleted (only its project and note can change). A mistake is corrected by a return or a
  // credit, so the original and the correction both stay on record. See lib/salesLock.ts.
  issuedSalesLocked?: boolean;
  // Shown to a customer on their invoice link: how to pay (bank, account, reference). Typed by the owner. Balancr takes no money.
  paymentInstructions?: string;
  // Card payments through PayHere are configured per business under Integrations (see lib/payhere.ts).
  // Automatic overdue reminders by email: off unless the owner turns them on (lib/overdueReminders.ts).
  autoReminders?: boolean;
  customerMessages?: boolean; // v265: routine customer messages (booking confirmations, reminders, quote follow-ups, thank-yous, welcomes)
  reviewRequests?: boolean;
  weeklyNumbers?: boolean; // v282: email the owner the week's sales, expenses and what is left, on Mondays
  reportEmail?: string; // v282: where the weekly numbers are sent
  bonusSharePct?: number; // v287: share of the month's profit above the minimum that goes into the results bonus pool (lib/bonusPool.ts); absent or 0 = no pool
  bonusMinProfit?: number; // v287: profit a month must reach before any bonus pool
  boardMeetings?: BoardMeeting[]; // v289: board and advisory meetings, their decisions and actions (lib/boardMeetings.ts)
  managerMonthlySpendLimit?: number; // v286: a manager's one-off expenses in a calendar month cannot go over this; absent or 0 = no limit (lib/spendLimit.ts)
  secondSignOffAbove?: number; // v283: a supplier payment above this needs a second signer to approve it; blank = no second signer // v265: ask happy customers for a review, three to five days after a job; only to customers who agreed to marketing
  reminderEveryDays?: number; // at least this many days between reminders for the same invoice
  replyToEmail?: string; // where a customer's reply to a reminder goes; optional
  // Table-time pricing for hourly services (lib/bookings.ts suggestBookingPrice). All optional; a suggestion only, never a posted price.
  bookingMinMinutes?: number; // charge at least this many minutes (e.g. 60)
  bookingBlockMinutes?: number; // round the booked length up to a whole number of these blocks (e.g. 30)
  bookingPerPerson?: boolean; // the hourly rate is per person: multiply by the booking's party size
  smsReminders?: boolean; // also text customers with no email address a mobile reminder (lib/sms.ts); needs autoReminders on and the server's SMS keys
  // Download URL for a logo image uploaded via Settings → General (see
  // lib/logoUpload.ts). Purely cosmetic, same as the fields above — shown
  // next to the letterhead text on printed quotes/invoices/receipts when
  // set, omitted entirely when blank.
  logoUrl?: string;
  // Timestamp (Date.now()) of the last time an owner clicked "Download
  // full backup" on Import/Export. Backup is manual/on-demand — there is
  // no scheduled export — so this is purely so the Dashboard can show
  // "last backed up X days ago" (or "never") instead of an owner assuming
  // a backup exists that was never taken.
  lastBackupAt?: number;
  // Max AI Assistant messages (see lib/aiUsageLimit.ts) this business can
  // send per UTC day before /api/ai/chat starts refusing new turns with a
  // clear message instead of silently keeping the meter running. Not
  // exposed in Settings UI — this is a plan/abuse control for whoever
  // operates the deployment (you), not a per-business preference, so it's
  // set directly in Firestore (users/{businessId}/meta/settings) for a
  // customer who needs a different tier. Unset uses the default in
  // lib/aiUsageLimit.ts; 0 or a negative number disables the limit
  // entirely for that business.
  aiDailyMessageLimit?: number;
  // A few plain sentences from the owner on what the business sells, to whom, and why it is worth buying. Used only to
  // ground the "Write with AI" drafts of outreach, follow-ups and post ideas (lib/aiDraft.ts); sent to the AI provider
  // with each draft request and nowhere else. Blank or unset means drafts are not offered. At most 600 characters.
  offerContext?: string;
  // Pages the owner has tucked out of the side menu (lib/navPrefs.ts). Cosmetic and reversible: a hidden page still works, every
  // link to it still works, and Jump to still finds it. Unset or empty shows every page.
  hiddenPages?: string[];
  // "Close the books": the last day (YYYY-MM-DD, always a month-end) of the
  // most recent period the owner has locked. Dated one-off transactions on
  // or before this date can no longer be added, edited or deleted by anyone
  // until the owner reopens the period. Unset/absent = nothing is locked.
  // Only ever written through DataContext.setBooksClosedThrough (validated +
  // audit-logged), never through the general Settings form. What is and isn't
  // covered is documented in lib/periodLock.ts.
  booksClosedThrough?: string;
  // Profit First-style target allocation (Mike Michalowski's cash-management
  // method): a plain percentage split of the cash actually collected this
  // month into Profit / Owner's Pay / Tax, with whatever's left being what
  // the business actually has to run on. Purely a decision-support number,
  // same spirit as monthlyOwnerDraw above — nothing here moves money
  // between accounts, creates a ledger transaction, or talks to a bank; it
  // just re-reads MonthlyPnL's cash-collected figure through a different
  // lens. Off by default (undefined/false) so a business that's never
  // heard of the method sees nothing new. See computeProfitFirstAllocation
  // in lib/calculations.ts.
  profitFirstEnabled?: boolean;
  // The net profit margin the owner is aiming for, in percent (0-100; 0 = no target). The Dashboard compares each recent
  // month's actual net margin (net profit before tax over revenue) with it and warns when it stays under. Read-only:
  // see lib/marginTarget.ts.
  targetNetMarginPct?: number;
  // Percentages of cash collected, each 0-100. Opex isn't its own setting:
  // it's deliberately whatever's left (100 - the three below, floored at
  // 0) — the method's whole point is that Opex is a constraint you operate
  // within, not a target you plan around. Defaults mirror the published
  // starter percentages for a business under roughly $250k/yr real
  // revenue — the band almost every user of this app falls into.
  profitFirstProfitPct?: number;
  profitFirstOwnerPayPct?: number;
  profitFirstTaxPct?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  taxRatePct: 0,
  salesTaxEnabled: false,
  salesTaxRatePct: 0,
  salesTaxLabel: "Tax",
  currency: "LKR",
  forecastMonths: 3,
  defaultOrderingCost: 0,
  defaultHoldingCostPct: 20,
  defaultLeadTimeDays: 7,
  defaultSafetyStockDays: 0,
  defaultCreditTermDays: 90,
  creditReviewThreshold: 25000,
  rentAmount: 0,
  rentDueDayOfMonth: 1,
  defaultOpeningFloat: 0,
  profitFirstEnabled: false,
  targetNetMarginPct: 0,
  profitFirstProfitPct: 5,
  profitFirstOwnerPayPct: 50,
  profitFirstTaxPct: 15,
};

// ---------------------------------------------------------------------------
// Multi-user access. One business (identified by its owner's uid) can have
// several people signed in under it, each with their own login and a role
// that determines what they can see and do. See lib/permissions.ts for the
// actual permission matrix and firestore.rules for how it's enforced at the
// database level (client-side checks alone are not real security).
// ---------------------------------------------------------------------------

// owner: the account the business was created under. Full access, always
//   exactly one, cannot be removed or demoted.
// manager: trusted day-to-day operator. Can create/edit almost everything a
//   business needs day to day, but can't delete records, manage the team,
//   change settings, or see payroll — deletion and payroll are the two
//   things worth keeping to a short list of people even among trusted staff.
// staff: till/floor level. Can log a sale, record a customer's payment, and
//   count cash at end of shift — and nothing else. Critically, cannot edit
//   or delete anything once it's saved, including their own entries: a
//   genuine mistake gets fixed by a manager or owner, which is exactly the
//   friction that makes "log it low, pocket the difference" not work.
// accountant: the business's bookkeeper/accountant/auditor. READ-ONLY across
//   the books (everything a manager can read - sales, purchases, bills,
//   receivables/payables, reports, balance sheet), and nothing else: cannot
//   create, edit or delete a single record, cannot see payroll, the team,
//   settings, the audit log, or use the AI assistant. Enforced in
//   firestore.rules (no write rule names this role), not just hidden in the UI.
export type Role = "owner" | "manager" | "staff" | "accountant";

// The record of a person's membership in a business — lives at
// users/{businessId}/members/{uid}. This is the single source of truth
// Firestore rules check for every permission decision; nothing else (not
// even the top-level `memberships` pointer below) grants access on its own.
export interface Member {
  id: string; // == uid
  role: Role;
  name: string;
  email: string;
  active: boolean; // false = removed. Kept, not deleted, so history/audit trail stays intact.
  invitedBy?: string; // uid of whoever invited them
  createdAt: number;
  // The locations this person works at (see lib/locationScope.ts). Absent or empty = every location.
  locationIds?: string[];
}

// A top-level users/{uid}-independent pointer, at memberships/{uid}, that
// exists purely so a freshly signed-in user's own client can answer "which
// business am I part of" with a single doc read by their own uid — Firestore
// can't otherwise search "which business's members subcollection contains
// me" without a collection-group query. It intentionally carries no role —
// role is always read fresh from the Member doc above, so there's exactly
// one place a role can be wrong, and it isn't this one.
export interface MembershipPointer {
  businessId: string;
}

// A pending invitation — lives at users/{businessId}/invites/{id}. The owner
// creates one and shares the resulting link with the person out of band
// (WhatsApp, in person, whatever); accepting it is what creates the Member
// doc and the MembershipPointer, validated by matching email + role in
// firestore.rules.
export interface Invite {
  id: string;
  email: string; // lowercased at creation
  name: string; // pre-filled display name, editable by the invitee on accept
  role: Role;
  status: "pending" | "accepted" | "revoked";
  invitedBy: string; // uid
  invitedByName: string;
  createdAt: number;
  acceptedAt?: number;
  acceptedByUid?: string;
}

// Platform-level account status — lives at users/{businessId}/meta/account.
// This is separate from a Member's own `active` flag above: that gates one
// person's access to a business they belong to; this gates the whole
// business at once, for the "customer stopped paying" case. Only ever
// written by the platform-admin API routes (app/api/admin/*) via the Admin
// SDK — firestore.rules denies client writes to this doc outright (see the
// module comment there), so no member of the business, including its
// owner, can flip themselves back on. Absence of this doc means "not
// suspended" — most businesses never get one.
export interface AccountStatus {
  adminAccount?: boolean; // pass 308: never billed; may use the operator's DeepSeek key
  suspended: boolean;
  suspendedAt?: number;
  reactivatedAt?: number;
  reason?: string; // shown to the business on the lockout screen, e.g. "Payment overdue"

  // Billing — deliberately manual, no payment gateway. The admin takes
  // payment however they actually take it (bank transfer, cash, whatever)
  // and records the fact of it here by hand, same "platform lever, not
  // client-writable" shape as `suspended` above — see the meta/account
  // rule in firestore.rules, which already covers these fields since
  // they live on the same doc. `plan` is free text rather than a fixed
  // enum because pricing gets negotiated per customer in practice; the
  // landing page's public price is a starting point, not an enforced
  // tier this app has any feature-gating logic for. Absence of
  // `renewalDueDate` means "not on a billing cycle yet" — every newly
  // provisioned business starts this way until the admin sets it on the
  // "Manage accounts" tab.
  plan?: string; // e.g. "Standard — monthly"
  billingAmount?: number;
  billingCycle?: "monthly" | "annual";
  lastPaidAt?: number;
  renewalDueDate?: string; // ISO date; "Mark paid" advances this by one billingCycle
  // Opt-in, per account, set from "Edit billing". When true, the business locks
  // itself RENEWAL_GRACE_DAYS after renewalDueDate passes (lib/accountAccess.ts).
  // Absent/false = an overdue renewal only flags, it never locks.
  autoLockOverdue?: boolean;
  // Set from "Edit billing" for accounts that are never invoiced — the platform
  // owner's own business, a friend, a partner. Such an account has no renewal
  // date to chase, so it is left out of the admin's "needs attention" queue and
  // never locks itself (lib/accountAccess.ts). A manual Suspend still works.
  complimentary?: boolean;
  // Set ONLY by the server (lib/demoServer.ts), never from a client: marks the one shared sandbox
  // behind the "Try it now" button. It switches on the demo guardrails (lib/guardrails.ts) — tighter AI
  // limits, no deleting / settings / team changes, and an automatic reset to the sample data. Only an
  // account that is already plan "Demo" + complimentary can receive it.
  publicDemo?: boolean;
  // Stamped once, when a trial account becomes a paying one ("Convert to paid" or the
  // first Mark paid while a trial date is still set). Only used for the admin's
  // trial → paid conversion figure; nothing else reads it.
  convertedAt?: number;

  // Free-text, admin-only memory for this specific business — "agreed to
  // a discounted rate", "wants annual invoicing", "prefers WhatsApp over
  // email", whatever's worth remembering next time this account comes up.
  // Same client-write-denied doc as everything else here, same reasoning:
  // this is the admin's own record, not something the business itself
  // should see or edit. Deliberately just a string, not a structured CRM —
  // that's a different product than a bookkeeping app's account panel.
  notes?: string;

  // Set automatically when an account is provisioned as a trial (see
  // ProvisionForm in app/admin/new-business/page.tsx and the
  // app/api/admin/businesses/[businessId]/trial route that writes it —
  // same client-write-denied doc, so this goes through the Admin SDK too).
  // Presence of this field is what "this account is on a trial" means;
  // there is no separate boolean. "Convert to paid" clears it via
  // FieldValue.delete() rather than leaving a stale past date sitting on
  // an otherwise-normal paying account. When this date passes plus a short
  // grace period, the business is locked automatically — computed on read
  // (lib/accountAccess.ts), not stored, so extending the trial or marking a
  // payment (which also clears this field) unlocks it instantly. Renewal
  // dates never auto-lock; those stay "flag, don't act".
  trialEndsAt?: string; // ISO date
}

export type AuditAction = "create" | "update" | "delete";

// An append-only trail of who did what. Written by the app alongside the
// mutations that matter most for fraud detection (sales, purchases,
// expenses, deletions, role changes) — see contexts/DataContext.tsx. This is
// a detection/deterrence layer, not a cryptographic guarantee: firestore.rules
// make it truly impossible for anyone to edit or delete an entry here after
// the fact, but a sufficiently technical person could in principle write to
// Firestore directly and bypass the app's logging code entirely. The real,
// unconditional protection against theft is what firestore.rules refuses to
// allow Staff to do in the first place (see lib/permissions.ts) — this log
// is what lets an owner or manager notice when something looks wrong.
export interface AuditLogEntry {
  id: string;
  at: number;
  byUid: string;
  byName: string;
  byRole: Role;
  action: AuditAction;
  entity: string; // "sale" | "purchase" | "expense" | "product" | "loan" | "member" | ...
  entityId: string;
  summary: string; // short human-readable description, e.g. "Sale 2×Widget Rs 4,500 → Rs 2,500"
}

// End-of-shift cash reconciliation. `expectedCash` is snapshotted at the
// moment the count is submitted (opening float + cash sales collected -
// cash spent, over the covered date range) rather than recomputed live
// later, so a later edit to that day's records (which only Owner/Manager
// can make anyway) never silently rewrites a variance that's already been
// flagged and discussed. This is the single highest-leverage anti-theft
// control in the app: a staff member who's been skimming cash sales will
// show a shortfall here every time, on a clean, dated, named record they
// can never edit or delete themselves. The one exception is the Owner
// (never Manager, never the person who submitted it), who can correct a
// genuine data-entry slip — see DataContext.updateCashCount — without
// losing the record to a delete-and-recreate; `variance` is re-derived
// against the corrected `countedCash`, `expectedCash` itself never changes.
export interface CashCount {
  id: string;
  date: string; // ISO date the count covers
  openingFloat: number;
  expectedCash: number;
  countedCash: number;
  variance: number; // countedCash - expectedCash; negative = cash missing
  // Cash taken out of the till on this date for a small spend and not yet booked as an expense (v292). Already
  // taken off expectedCash; kept so the count shows why the expected figure is what it is.
  tillPayoutsOut?: number;
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// Cash taken out of the till for a small spend (v292). Any active role can write one down, so a cash count can account for it.
// Until an owner or manager records it as an expense (expenseId set), it is cash out on its date; after that the expense is the
// record and this payout is not counted again. See lib/tillPayouts.ts.
export interface TillPayout {
  id: string;
  date: string; // ISO date the cash left the till
  amount: number;
  reason: string;
  expenseId?: string; // set once recorded as an expense, in the same batch that creates it
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A billable-hours clock-in/out record. Deliberately per-job rather than
// per-day: `jobLabel` is a free-text reference (a customer name, a service
// sale, a project — whatever the business calls it) rather than a link to
// a formal "job" entity, since this app has no job/project object of its
// own. That also means the same member can have more than one entry open
// at once (clocked into two jobs on and off through the day) — the create
// rule doesn't try to prevent that, since a caterer or contractor genuinely
// does bounce between concurrent jobs. `clockOut` is unset while an entry
// is running; once set, `firestore.rules` blocks that field from ever being
// changed again by the entry's own creator, same anti-tampering shape as
// CashCount — only Owner/Manager can correct a mistake after the fact.
export interface TimeEntry {
  id: string;
  memberUid: string;
  memberName: string;
  jobLabel: string; // e.g. a customer name, "Acme Corp — website redesign"
  billable: boolean;
  hourlyRate?: number; // snapshotted at clock-in, in the business's currency
  clockIn: number; // epoch ms
  clockOut?: number; // epoch ms; absent while the entry is still running
  notes?: string;
  // True for a freelancer or contractor with no login here (logged by the owner or a manager, memberUid "outside:<name>").
  // Their time is recorded and costed the same way; nobody outside the business can sign in as them.
  outsideWorker?: boolean;
  // Optional link to a Project — set when this clocked time was worked
  // against a costed job rather than general/unattributed work. Purely
  // additive, same shape as the `projectId` on Purchase/Expense/Sale: an
  // untagged entry behaves exactly as before. When set (and the entry has
  // both a hourlyRate and a clockOut), hours × rate rolls automatically
  // into that project's actual labor cost — see computeProjectFinancials
  // in lib/calculations.ts — instead of having to be re-entered by hand as
  // a manual ProjectCostSegment.
  projectId?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A cost-stripped mirror of Product, kept in sync by DataContext whenever a
// product is created/updated/deleted. Staff gets read access to this
// collection instead of `products` — same id, but no cost/margin fields —
// so a Staff-role sales form can list what's for sale and at what price
// without ever being able to read what it cost the business, and therefore
// without being able to work out how much room there is to skim per unit.
export interface CatalogItem {
  id: string; // == Product.id
  name: string;
  sku: string;
  category: string;
  type: OfferingType;
  active: boolean;
  sellPrice?: number; // mirrors Product.defaultSellPrice
  wholesalePrice?: number | null; // mirrors Product.wholesalePrice
  priceTiers?: { minQty: number; unitPrice: number }[] | null; // mirrors Product.priceTiers (Staff sell from the catalog)
  warrantyMonths?: number | null; // mirrors Product.warrantyMonths (Staff sell from the catalog)
  taxRatePct?: number | null; // mirrors Product.taxRatePct: Staff sell from the catalog, so they must charge the same tax
  // Not sensitive, and the sale form needs them: unit label and whether a
  // part-quantity (2.5 kg) may be entered.
  baseUnit?: string;
  allowFractionalQty?: boolean;
  // Pack names and sizes (a Carton of 12) so the sale form can sell by the pack. Names and counts only, nothing
  // about cost. Mirrored whenever the product is saved; a product whose packs were set up before this field
  // existed shows them to Staff after its next save.
  packSizes?: PackSize[];
}

// Notification types for reminders and alerts
export type NotificationType = 
  | "receivable_overdue"      // Customer payment is overdue
  | "receivable_due_soon"     // Customer payment due soon
  | "payable_overdue"         // Supplier payment is overdue
  | "payable_due_soon"        // Supplier payment due soon
  | "low_stock"               // Product stock below reorder point
  | "expense_due"             // Recurring expense due
  | "loan_payment_due"        // Loan payment due
  | "lent_loan_late"          // A borrower is behind on money the business lent out
  | "project_over_budget"     // Project actual cost is approaching/past its quoted price
  | "milestone_due"           // A progress-billing milestone is due soon or overdue
  | "growth_lever"            // COGS/opex/AOV/price trend moved against the business
  | "lead_follow_up"          // A lead's next-follow-up date has arrived or passed
  | "shipment_overdue"        // A shipment is still on the way past its expected day
  | "rental_overdue"         // A rented-out item is still not back past its due-back day
  | "customer_quiet"          // A customer who used to buy on a regular rhythm has gone quiet: a win-back prompt
  | "booking_soon"            // A booking still marked booked starts within the next 24 hours
  | "sale_due"                // A Done booking or a Won lead has no sale recorded yet: a reminder only, nothing is recorded
  | "quote_answered"          // A customer accepted or declined a quote through its link
  | "enquiry_received"        // A website enquiry arrived and was filed as a new lead
  | "payment_claimed"         // A customer says they paid an invoice: a claim to check, NOT a recorded payment
  | "booking_requested"       // A customer asked for a booking online: a request to confirm, NOT a confirmed booking
  | "ticket_requested"        // A customer asked for seats at an event online: a request to confirm, NOT a sale and no seat is held
  | "order_received"          // A web order arrived through the order API and waits for the owner to confirm it as a sale
  | "review_received"        // An online review came in through the review API; a low one is worth an answer on the platform today
  | "custom";                 // User-created custom reminder

export type NotificationPriority = "low" | "medium" | "high";

// A notification/reminder for the business owner
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;           // Short headline
  message: string;         // Detailed description
  entityId?: string;       // Reference to related entity (saleId, purchaseId, productId, etc.)
  entityType?: string;     // Type of entity ("sale", "purchase", "product", etc.)
  dueDate?: string;        // ISO date when action is needed
  isRead: boolean;         // Whether user has dismissed/read it
  dismissedAt?: number;    // Timestamp when marked as read
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Project / job costing. A Project bundles many costs against ONE agreed
// price, so a business that quotes jobs (a build, a renovation, a client
// engagement, a custom order) can see whether that specific job actually
// made money once every material, subcontractor invoice, and ad-hoc cost
// against it is totalled up — not just whether the business as a whole is
// profitable that month. Deliberately kept separate from the WAC/COGS
// engine (which answers "is this *product* profitable") — this answers
// "is this *job* profitable", the question a project-based SME (a
// contractor, an agency, a fabricator) actually asks.
// ---------------------------------------------------------------------------

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export const PROJECT_COST_CATEGORIES = [
  "Materials",
  "Labor",
  "Subcontractor",
  "Equipment & rental",
  "Permits & fees",
  "Transport & logistics",
  "Overhead allocation",
  "Other",
] as const;

// A costed job — e.g. a customer order, a renovation, a build, a contract
// engagement. `quotedPrice` is the single agreed/contracted value of the
// whole job; every cost that lands against it (see ProjectCostSegment, and
// the optional `projectId` on Purchase/Expense/Sale) is compared against
// this one number to answer "did we make money on this job".
export interface Project {
  id: string;
  name: string;
  client?: string;
  quotedPrice: number; // the agreed/contracted price for the whole project
  status: ProjectStatus;
  startDate: string; // ISO date
  targetEndDate?: string; // ISO date
  completedDate?: string; // ISO date, set when marked completed
  notes?: string;
  createdAt: number;
}

// One line of cost against a project — a "cost segment". Kept as its own
// append list (rather than a running total mutated on Project) for the same
// auditability reason every other ledger in this app works this way.
// Segments are for costs that don't already exist as a Purchase or Expense
// (a subcontractor's lump-sum invoice, a permit fee, a manual labor
// allocation). A cost that *does* already exist as a Purchase or Expense
// should be tagged with this project's id on that record instead (its
// `projectId` field), so nothing is ever counted twice — see
// computeProjectFinancials in lib/calculations.ts, which sums segments and
// tagged Purchases/Expenses together into one total.
export interface ProjectCostSegment {
  id: string;
  projectId: string;
  label: string;
  category: string; // one of PROJECT_COST_CATEGORIES, free text also accepted
  amount: number;
  date: string; // ISO date
  notes?: string;
  createdAt: number;
}

// A progress-billing schedule line for a Project — e.g. "Deposit", "50% on
// delivery", "Final payment on handover". Deliberately its own append list
// (same auditability pattern as ProjectCostSegment) rather than a JSON blob
// on Project, and deliberately NOT auto-converted into a Sale: a milestone
// can be scheduled long before it's actually billed, and a service project
// billed in stages doesn't always map to a sellable Product/SKU the way the
// Sale record requires. Status is tracked here directly instead — see
// summarizeMilestones in lib/calculations.ts for the roll-up used on the
// Project detail view (scheduled vs invoiced vs paid, against quotedPrice).
export type MilestoneStatus = "pending" | "invoiced" | "paid";

export interface ProjectMilestone {
  id: string;
  projectId: string;
  label: string; // e.g. "Deposit", "Milestone 2 — framing complete"
  amount: number;
  dueDate?: string; // ISO date
  status: MilestoneStatus;
  invoicedDate?: string; // ISO date, set when marked invoiced
  paidDate?: string; // ISO date, set when marked paid
  // The invoiceId of the sale this milestone was recorded as ("Record in books"). Absent = not recorded from here.
  // A link only: the sale is an ordinary sale and lives on after the milestone is edited or deleted.
  saleInvoiceId?: string;
  notes?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Recurring invoices — a billing schedule for a repeat-billing customer
// (a retainer client, a monthly service contract). Deliberately its own
// entity rather than another flavor of Expense/"revenue": those are a
// single amount spread mathematically across months for reporting (see
// monthlyNormalizedAmount in lib/calculations.ts) and never become
// anything a customer could be handed or chased for payment. A recurring
// invoice needs to become a REAL invoice each cycle — a multi-item Sale
// group with its own invoiceId, a customer, a due date, and a place in
// receivables aging, exactly as if it had been entered by hand with
// MultiItemInvoiceForm — because a retainer client still expects an actual
// invoice, and the business still needs to collect and chase it like any
// other credit sale. See generateDueRecurringInvoices in DataContext for
// the generation step, and lib/recurringInvoices.ts for the pure
// due/next-date math it's built on.
// ---------------------------------------------------------------------------

// One line item on a recurring invoice's template — same shape as a line
// in MultiItemInvoiceForm, minus anything date-specific (that's supplied
// fresh each time an occurrence is generated).
export interface RecurringInvoiceLine {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface RecurringInvoice {
  id: string;
  customer: string;
  customerContact?: string;
  lines: RecurringInvoiceLine[];
  recurrence: Exclude<Recurrence, "none">;
  creditTermDays?: number; // falls back to Settings.defaultCreditTermDays when unset
  startDate: string; // ISO date — first invoice is generated on/after this date
  endDate?: string; // ISO date, optional (runs indefinitely if absent)
  active: boolean; // pausing stops generation without losing the schedule or its history
  notes?: string;
  nextDueDate: string; // ISO date of the next occurrence still to be generated
  lastGeneratedDate?: string; // ISO date this schedule last actually generated an invoice
  lastInvoiceId?: string; // invoiceId of the most recently generated invoice
  // Every Sale this schedule generates is tagged with this Location (same
  // "resolves to default if unset" rule as everywhere else — see Location
  // in this file). Set once on the schedule, not per-occurrence, since a
  // recurring invoice is by definition billed from the same place each time.
  locationId?: string;
  createdAt: number;
}

// Weekly reflection entries — "write lessons learned weekly" was a stated
// operating habit with nothing in the app to actually do it in. Deliberately
// minimal: one date + one block of free text. No categorization, tagging,
// or linkage to other records — the moment this needs structure it's a
// different, bigger feature, and the entire point of a lessons-learned habit
// is that it's low-friction enough to actually keep doing every week.
// Owner-only (see firestore.rules) — this is a personal reflection tool, not
// an operational record any other role needs.
export interface JournalEntry {
  id: string;
  date: string; // ISO date — the week/day this lesson is logged against
  content: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// Ranks hypothetical ventures/opportunities against each other with a
// single weighted score, rather than gut feel — same "transparent,
// hand-verifiable" philosophy as the NPV/IRR investment calculator on the
// Profitability page, but for comparing several different opportunities
// against each other rather than sizing up one single purchase. Every
// factor is a 1-10 self-assessment the owner enters by hand (there's no
// ledger data these could be derived from — "how much optionality does
// this open up" isn't a number that accrues anywhere). See
// computeOpportunityScore in lib/calculations.ts for the formula.
export interface Opportunity {
  id: string;
  name: string;
  financialCeiling: number; // 1-10: how high the upside realistically goes
  optionality: number; // 1-10: how many future doors this keeps open
  longevity: number; // 1-10: how long the opportunity stays viable
  capitalRequired: number; // 1-10: how much capital it eats before it pays back
  timeToProfit: number; // 1-10: how long until it's actually profitable
  passportFriction: number; // 1-10: visa/relocation/travel friction involved
  risk: number; // 1-10: downside risk if it doesn't work out
  notes?: string;
  createdAt: number;
}

// Fixed asset for depreciation tracking (machinery, vehicles, equipment, etc.)
export interface FixedAsset {
  id: string;
  name: string;
  category: string;
  purchaseDate: string; // ISO date
  cost: number;
  usefulLifeMonths: number; // straight-line only; ignored for reducing_balance
  salvageValue?: number;
  // How it loses value. Unset means straight_line (every asset created before this field existed).
  // reducing_balance charges reducingRatePct a year on the book value still remaining, so the charge is
  // largest in year one and shrinks, never taking the asset below its salvage value. Equipment that wears
  // out fast (vehicles, computers, machinery) usually fits this better.
  depreciationMethod?: "straight_line" | "reducing_balance";
  reducingRatePct?: number; // yearly % of remaining book value, 0-100, reducing_balance only
  // Expected yearly rise in MARKET value, for land, buildings and other assets that tend to gain value (0 or absent =
  // none expected). Management view only (lib/assetOutlook.ts): the books stay at cost less depreciation, and nothing
  // is revalued or taxed because of it.
  appreciationPct?: number;
  notes?: string;
  impairments?: { date: string; amount: number; reason?: string }[]; // v256: write-downs when the asset is worth less than its book value; a non-cash charge in that month
  disposalDate?: string; // ISO date, set when disposed
  disposalAmount?: number; // amount received on disposal
  createdAt: number;
}

// Securities and other investments the business holds to grow its capital (shares, bonds and treasury
// bills, unit trusts / funds, fixed deposits, property, anything else). Management accounting only:
// the owner types in what they bought, sold and received, and the price they last checked. Nothing here
// connects to a broker, exchange or price feed, and nothing is filed anywhere. See lib/investments.ts.
// v289: the classes follow the common investment map (shares; fixed income; government and retirement schemes; commodities;
// real estate; alternative investments; cash and liquid; other). Stored values are unchanged for the first six.
export type InvestmentAssetClass = "shares" | "bonds" | "funds" | "deposits" | "retirement" | "commodities" | "property" | "alternative" | "cash" | "other";

export interface Security {
  id: string;
  name: string; // e.g. "John Keells Holdings", "91-day T-bill", "NDB fixed deposit"
  symbol?: string;
  assetClass: InvestmentAssetClass;
  // Latest price PER UNIT, entered by hand. Missing means "not priced yet": the holding is carried at
  // cost until it is. priceDate is when the owner last checked it, so stale prices can be flagged.
  currentPrice?: number;
  priceDate?: string; // ISO date
  notes?: string;
  createdAt: number;
}

export type InvestmentTxnKind = "buy" | "sell" | "income";

export interface InvestmentTxn {
  id: string;
  securityId: string;
  kind: InvestmentTxnKind;
  date: string; // ISO date, never in the future
  units?: number; // buy / sell only
  // buy / sell: total consideration before fees (units x price). income: the amount received
  // (dividend, interest, coupon, rent).
  amount: number;
  fees?: number; // brokerage / charges: added to cost on a buy, deducted from proceeds on a sell or income
  notes?: string;
  createdAt: number;
}

// Money the business has LENT to someone else and earns interest on: a loan to a customer, a staff advance,
// money placed with another trader, equipment leased on instalments. The opposite of `Loan` above, which is
// money the business BORROWED. Management accounting only: the owner records what was lent and every
// repayment actually received; nothing connects to a bank, a registry or any authority, and nothing here
// moves money. See lib/lending.ts for how it ties into the books.
export type LentLoanStyle = "installments" | "interest_only";

export interface LentLoan {
  id: string;
  borrower: string; // who owes you the money
  purpose?: string; // e.g. "stock advance", "staff loan", "equipment on instalments"
  principal: number; // the amount that left the business
  annualInterestRatePct: number; // nominal yearly rate on what is still owed, e.g. 18 = 18%
  termMonths: number; // how many monthly payments were agreed
  // installments: equal monthly payments that clear the loan at the end (the default).
  // interest_only: the interest each month, with the whole principal due at the end.
  repaymentStyle?: LentLoanStyle;
  startDate: string; // ISO date the money was handed over, never in the future
  notes?: string;
  // The borrower record. `customerId` links to the customer directory when the borrower is in it (the name stays
  // on the loan too, so renaming a customer never rewrites a loan's history). The contact is a copy taken when the
  // loan was made, so a loan always carries a number to call even if the directory entry is later removed.
  customerId?: string;
  borrowerContact?: string; // phone or email
  guarantorName?: string;
  guarantorContact?: string;
  collateral?: string; // what backs the loan, in words: "gold chain, 2 sovereigns", "lorry WP-1234"
  // Who chases this loan (a team member's uid + name at the time), set by the Owner.
  collectorUid?: string;
  collectorName?: string;
  createdAt: number;
}

// repayment: cash actually received from the borrower. It pays the interest owed first, then the principal.
// writeoff: principal the owner has given up on collecting (bad debt). No cash moves.
export type LentLoanTxnKind = "repayment" | "writeoff";

export interface LentLoanTxn {
  id: string;
  loanId: string;
  kind: LentLoanTxnKind;
  date: string; // ISO date, never in the future
  amount: number;
  notes?: string;
  collectedByUid?: string; // who brought the money in (repayments only), see ReceivablePayment.collectedByUid
  collectedByName?: string;
  createdAt: number;
}

// One line in the collections diary: a call, a message or a visit to someone who owes the business money, what
// came of it, and when to try again. Append-only in spirit (the Owner can delete a mistaken line, nobody edits
// one), because the value of a diary is that it says what really happened. The promise on a person is the newest
// line that names a date and the next follow-up is the newest line's, so there is no separate state to fall out
// of step (see lib/collections.ts).
//
// Management notes only: nothing here sends a message, schedules a call or contacts anyone. The WhatsApp button
// on the Collections page opens the owner's own WhatsApp with the words filled in, as everywhere else in the app.
export type CollectionSubjectKind = "customer" | "lent_loan";
export type CollectionChannel = "call" | "whatsapp" | "visit" | "message" | "other";
export type CollectionOutcome = "reached" | "no_answer" | "promised" | "partial" | "dispute" | "refused" | "other";

export interface CollectionNote {
  id: string;
  subjectKind: CollectionSubjectKind;
  // customer: the customer's name, lower-cased and trimmed (receivables are matched to customers by name, so a
  // contact logged against "Nimal" in Monday's invoice and "nimal " on Friday's is one person's diary).
  // lent_loan: the loan's id.
  subjectKey: string;
  subjectLabel: string; // the name as typed, for display
  date: string; // ISO date the contact happened, never in the future
  channel: CollectionChannel;
  outcome: CollectionOutcome;
  note?: string;
  promisedDate?: string; // ISO date they said they would pay by
  promisedAmount?: number; // how much they said they would pay
  nextFollowUpDate?: string; // ISO date to try again
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// A prospect asking for access, submitted anonymously from the public
// marketing site (app/page.tsx -> app/request-trial/page.tsx) before they
// have any account or login. This is deliberately NOT a self-serve signup
// — see lib/provisioning.ts and app/admin/new-business/page.tsx for why
// account creation stays admin-only. It's the intake queue that feeds
// that gated tool: written by anyone via app/api/trial-requests (Admin
// SDK, no Firestore client access at all — there is no firestore.rules
// entry for this collection because the client SDK is never used to
// touch it), and only ever read/updated by the admin passcode-gated
// routes under the same path. Lives at the Firestore root as
// `trialRequests/{id}`, outside the users/{businessId} tree, since it
// belongs to no business yet.
export interface TrialRequest {
  id: string;
  name: string;
  email: string; // lowercased at submission
  businessName?: string;
  teamSize?: "solo" | "2-5" | "6-10" | "10+";
  message?: string;
  // Free text, same shape as AccountStatus.plan below and for the same
  // reason: pricing/plan is negotiated per customer, not enforced by any
  // code path, so this is a lead-capture signal for the admin ("what were
  // they looking at on the pricing page"), not something that ever
  // constrains what account.provisioning.ts or the billing panel do with
  // it. Populated from the `plan`/`cycle` query params that
  // components/PricingSection.tsx's per-tier "Start free trial" links
  // carry through — e.g. "Growth — annual". Absent when someone reaches
  // the form another way (the footer/nav CTA, a direct link, etc).
  interestedPlan?: string;
  createdAt: number;
  status: "pending" | "contacted" | "provisioned" | "dismissed";
  // Set when the request became an account (by the admin pressing Activate, or automatically).
  provisionedAt?: number;
  // True when no human pressed anything: AUTO_ACTIVATE_TRIALS was on and every guard passed
  // (see lib/autoActivate.ts). Lets the admin panel say so on the card.
  autoActivated?: boolean;
  // Computed by GET /api/trial-requests for open requests only (a Firebase Auth lookup on
  // `email`) and never written to Firestore — lets the admin see "already has a login"
  // before trying to provision.
  hasAccount?: boolean;
  // Captured server-side from the request itself in app/api/trial-requests
  // (never client-supplied, so a submitter can't spoof or omit it) purely
  // so a hostile/spam submission leaves a trail an admin can act on —
  // blocking at the edge, reporting abuse, etc. Absent on any request
  // submitted before this field existed.
  ipAddress?: string;
  // Gmail-collapsed identity (lib/emailPolicy.ts canonicalEmail): john.doe@ / johndoe+x@ /
  // johndoe@gmail.com are one inbox and share one key. Absent on requests from before the
  // confirm-your-email step existed.
  emailKey?: string;
  // Set when the visitor clicked the confirmation link emailed to `email` — proof they can read
  // that inbox. Every request created since the confirm step has it; older ones don't, and an
  // absent value there means "predates the check", not "unconfirmed".
  emailVerifiedAt?: number;
  // Soft abuse signals (lib/trialAbuse.ts) for submissions that looked odd but weren't odd enough
  // to be discarded: shown on the lead card so the person working the queue sees why.
  suspicionScore?: number;
  suspicionReasons?: string[];
  // Full X-Forwarded-For chain (comma-joined), not just the first hop —
  // kept in addition to ipAddress so a proxy chain is visible in full if
  // it's ever needed, while ipAddress stays the single value everything
  // else (admin panel, email) treats as "the" IP.
  ipChain?: string;
  userAgent?: string;
  referer?: string;
  acceptLanguage?: string;
  // Client hints (sec-ch-ua / sec-ch-ua-platform), sent by Chromium-based
  // browsers only — absent on Safari/Firefox and any spoofed request.
  clientHintsUa?: string;
  clientHintsPlatform?: string;
  // Collected in the browser itself (see app/request-trial/page.tsx) —
  // best-effort, since a script-only submission skips the browser
  // entirely and this stays blank. Never a substitute for the
  // header-derived fields above, which every request has.
  browserTimezone?: string;
  browserScreen?: string;
  browserLanguage?: string;
}

// A quick "request something" or "report a problem" note, submittable
// from anywhere: the public marketing site (app/page.tsx) for a visitor
// who isn't a customer yet, and every signed-in page via
// components/FeedbackWidget.tsx (mounted once in components/AppShell.tsx
// and again on the landing page) for someone already using the app.
// Same architecture choice as TrialRequest just above, for the same
// reason — written by anyone via app/api/feedback (Admin SDK, no
// Firestore client access at all — there is no firestore.rules entry for
// this collection either), read only by the admin passcode-gated routes
// under that same path. Lives at the Firestore root as `feedback/{id}`,
// outside any one business's users/{businessId} tree: a signed-out
// visitor's note has no business to live under, and keeping a signed-in
// member's note in that same root queue is what lets the admin see
// everything in one place instead of opening every account individually.
export interface Feedback {
  id: string;
  // "problem" is called out separately from "idea"/"other" wherever this
  // is displayed (email subject, admin queue) since something broken is
  // usually more time-sensitive than a nice-to-have.
  kind: "idea" | "problem" | "other";
  message: string;
  contactEmail?: string; // optional — someone can send a note without wanting a reply
  // Everything below is context FeedbackWidget fills in automatically for
  // a signed-in submitter, so they're never asked to type it themselves.
  // All optional since a signed-out landing-page visitor has none of it.
  businessId?: string;
  memberName?: string;
  role?: string;
  page?: string; // the pathname they were on when they opened the form
  createdAt: number;
  status: "new" | "read" | "resolved";
}

// ---- Delegation: tasks handed to people (team members, or freelancers and contractors with no login) (lib/tasks.ts) ----
export type TaskPriority = "normal" | "urgent";
export type TaskStatus = "open" | "done";
// A step inside a task (a checklist). Done steps are ticked off by the team; the task itself is still closed by hand.
export interface BusinessSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface BusinessTask {
  id: string;
  title: string;
  details?: string;
  subtasks?: BusinessSubtask[]; // optional checklist, in the order it was written
  assigneeName: string; // a team member's name, or an outside person's
  assigneeKind: "member" | "outside";
  assigneeUid?: string; // the team member's login, when assigneeKind is "member"
  dueDate?: string; // ISO date, optional
  priority: TaskPriority;
  status: TaskStatus;
  doneOn?: string; // ISO date, when marked done
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Staff rota: who works which hours on which day (lib/rota.ts) ----
// One shift for one person on one day, within that day (no overnight shifts). Records only: pay stays on the employee's own record.
export interface ShiftEntry {
  id: string;
  employeeId: string;
  employeeName: string; // as it was when the shift was set, so it still reads if the employee is removed
  date: string; // ISO date
  start: string; // HH:MM, 24-hour
  end: string; // HH:MM, 24-hour, after start on the same day
  location?: string;
  note?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// ---- Bookings: appointments and reservations for time or seats (lib/bookings.ts) ----
export type BookingStatus = "booked" | "done" | "cancelled" | "no_show";
export interface Booking {
  id: string;
  customerName: string;
  contact?: string;
  service: string;
  resource?: string; // who or what is booked (a person, a room, a chair). Blank = the single default lane
  date: string; // ISO date
  startTime: string; // HH:MM, 24-hour
  durationMin: number; // whole minutes, must end the same day
  status: BookingStatus;
  depositAmount?: number; // paid in advance, business currency. Recorded for the owner to see; nothing is posted from it
  partySize?: number; // how many people; used only to suggest a per-person price (lib/bookings.ts), never to limit or block
  membershipId?: string; // the membership whose included hours cover this booking (lib/memberships.ts); a covered booking has no sale to record
  notes?: string;
  // The sale recorded from this booking once it was Done (lib/bookings.ts). Set once, never cleared: the booking then stays Done.
  saleId?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Events: ticketed game nights and tournaments (lib/events.ts) ----
export interface GameEvent {
  id: string;
  name: string;
  date: string; // ISO date
  startTime: string; // HH:MM, 24-hour
  capacity: number; // seats
  ticketPrice: number; // per seat, base currency
  ticketProductId: string; // the service the ticket sales are posted under
  otherCosts?: number; // prizes, venue hire, staff for the night: typed by the owner, not posted
  notes?: string;
  resource?: string; // v199b: the room or stage it runs in (blank = the main lane, the same lane a blank-resource booking uses)
  durationMin?: number; // v199b: how long it runs, in minutes (default 180)
  status: "scheduled" | "cancelled";
  onlineRequests?: boolean; // show this event on the public ticket-request page (lib/publicTickets.ts); a request is not a sale
  createdAt: number;
  updatedAt: number;
}

// ---- Farm batches: a group of animals or a crop followed from stocking to harvest (lib/farm.ts) ----
export type FarmEntryKind = "mortality" | "cull" | "transfer_in" | "feed" | "sample" | "water" | "cost" | "harvest";
export interface FarmEntry {
  id: string;
  date: string; // ISO
  kind: FarmEntryKind;
  count?: number; // animals (mortality, cull, transfer_in, harvest)
  kg?: number; // feed given, or weight harvested
  avgWeightG?: number; // average weight of one animal in grams (sample, transfer_in)
  amount?: number; // a cost, base currency (cost)
  label?: string; // what a cost was for
  tempC?: number; // water readings
  oxygenMgL?: number;
  ph?: number;
  salinityPpt?: number;
  ammoniaMgL?: number;
  note?: string;
}
export interface FarmBatch {
  id: string;
  name: string; // e.g. "Cage 3, spring intake"
  species: string; // e.g. "Atlantic salmon", "Broilers", "Tomatoes"
  unitLabel?: string; // what one counted unit is: "fish" (default), "birds", "plants"
  location?: string; // cage, pond, house or plot
  startDate: string;
  startCount: number;
  startAvgWeightG: number;
  status: "active" | "closed";
  // Optional safe ranges for water readings. A reading outside one is flagged; nothing is blocked.
  tempMinC?: number; tempMaxC?: number; oxygenMinMgL?: number; phMin?: number; phMax?: number; ammoniaMaxMgL?: number;
  entries: FarmEntry[];
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Memberships: a prepaid bank of included hours that bookings draw down (lib/memberships.ts) ----
export interface Membership {
  id: string;
  customer: string; // the member, as typed on bookings and sales
  plan: string; // e.g. "Monthly 10 hours"
  hours: number; // hours included, above zero
  startDate: string; // ISO, first day it can be used
  endDate: string; // ISO, last day it can be used; unused hours lapse after it
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Mileage: a log of business trips by vehicle (lib/mileage.ts) ----
export interface Trip {
  id: string;
  date: string; // ISO date of the trip
  vehicle: string; // e.g. "Van WP-1234": any label the business uses
  purpose: string; // why it was a business trip
  from?: string;
  to?: string;
  startOdometer?: number;
  endOdometer?: number;
  km: number; // distance, above zero: typed, or worked out from the odometer readings
  ratePerKm?: number; // what a km costs the business, base currency; a memo estimate, not posted
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Cheques: a register of cheques received and issued, including post-dated ones (lib/cheques.ts) ----
export type ChequeStatus = "held" | "deposited" | "cleared" | "returned" | "cancelled";
export interface Cheque {
  id: string;
  direction: "received" | "issued";
  number: string; // the cheque number printed on the leaf
  party: string; // who gave it (received) or who it was written to (issued)
  bank?: string;
  amount: number; // base currency, above zero
  chequeDate: string; // ISO date written on the cheque (post-dated when in the future)
  entryDate: string; // ISO date it was received or written out
  status: ChequeStatus;
  statusDate?: string; // ISO date of the latest status change
  returnReason?: string; // why the bank returned it (for a returned cheque)
  bankCharge?: number; // the bank's return fee, memo only
  saleId?: string; // optional: the credit sale a received cheque is meant to settle (memo only)
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Rentals: things lent or hired out and returned (lib/rentals.ts) ----
export interface Rental {
  id: string;
  item: string;
  customer: string;
  customerContact?: string;
  outDate: string; // ISO, the day it went out
  dueBackDate: string; // ISO, the day it is due back
  dailyRate: number; // base currency per day
  incomeProductId: string; // the active service the rent and damage charges are posted under
  deposit?: number; // taken on the day it went out; held as a customer deposit, not income
  depositEntryId?: string; // the customer deposit entry that holds that money
  returnedDate?: string; // ISO, set when it comes back; absent while it is still out
  charged?: number; // rent posted as a sale on return (days charged x daily rate)
  damageCharge?: number; // damage posted as its own sale on return
  damageNotes?: string;
  depositRefunded?: number; // total refunded from the deposit on return
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Shipments: goods on their way, by reference, with proof of delivery (lib/shipments.ts) ----
export type ShipmentStage = "booked" | "shipped" | "arrived" | "cleared" | "delivered";
export interface Shipment {
  id: string;
  reference: string; // waybill, airway bill, bill of lading or tracking number
  carrier?: string;
  origin?: string;
  destination?: string;
  stage: ShipmentStage;
  supplierName?: string;
  etaDate?: string; // ISO date the goods are expected, while still open
  shippedOn?: string; // ISO dates for each stage reached
  arrivedOn?: string;
  clearedOn?: string;
  deliveredOn?: string;
  receivedBy?: string; // proof of delivery: who signed for it
  proofRef?: string; // proof of delivery reference (signed waybill or delivery note number)
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// A tab: an open order for a table, bar seat or takeaway, that collects items as they are ordered and is charged in one go
// when it is paid (lib/tabs.ts). Nothing is sold and no stock moves until the tab is closed.
export type TabStatus = "open" | "closed";
export interface TabLine {
  productId: string;
  name: string; // as shown when ordered, so the tab reads well even if the item is renamed later
  qty: number;
  unitPrice: number; // base currency
  taxRatePct?: number | null; // the item's own rate when it was ordered (Product.taxRatePct), so the sale is taxed as the sale form taxes it
}
// Kitchen ticket: the items sent to the kitchen together (lib/tabKitchen.ts). Served tickets leave the kitchen's board.
export type KitchenStatus = "new" | "preparing" | "ready" | "served";
export interface KitchenTicket {
  id: string;
  items: { productId: string; name: string; qty: number; unitPrice: number }[];
  status: KitchenStatus;
  sentAt: number;
}
export interface Tab {
  id: string;
  // Kitchen tickets sent from this tab. Only what has been put on a ticket is sent; the same item is never sent twice.
  tickets?: KitchenTicket[];
  table: string; // "Table 4", "Bar 2", "Takeaway Ann"
  status: TabStatus;
  lines: TabLine[];
  openedOn: string; // ISO date
  closedOn?: string; // ISO date, set when the tab is closed and its sales are written
  paidBy?: PaymentMethod; // how the tab was paid, set when it is closed
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

// ---- Operations (v176, lib/operations.ts): what the business runs and keeps track of beyond the money. No record here posts
// to the books or moves stock. ----

// A request to spend, an expense to be paid back, or a shift change. Staff make them; an Owner or Manager decides.
export interface BusinessRequest {
  id: string;
  kind: "spend" | "claim" | "shift" | "payment";
  title: string;
  date: string; // when it was spent, or the shift date
  payload?: Record<string, unknown>; // v283: a supplier payment waiting for a second signer: the payment to record once approved
  amount?: number; // spend and claims only
  details?: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  decidedAt?: number;
  decidedByName?: string;
  reimbursedAt?: number; // claims only: when the business paid it back (a note; the payment is on the Expenses page)
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  // shift change: the rota shift and who takes it. Approving the request moves that shift to them.
  shiftId?: string;
  coverEmployeeId?: string;
  coverEmployeeName?: string;
}

// A written procedure the team must read. Each edit to its title or steps makes a new version; acks record who has read which.
export interface StaffProcedure {
  id: string;
  title: string;
  body: string;
  version: number;
  reviewEveryDays?: number;
  lastReviewed?: string;
  videoUrl?: string; // v286: https link to a recorded video of these steps (lib/procedureTraining.ts)
  acks?: Record<string, { name: string; version: number; at: number }>;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// A licence, permit, insurance policy, certificate, training, lease or contract that expires and needs renewing.
export interface ComplianceItem {
  id: string;
  name: string;
  category: string;
  holder?: string; // a person's name or the business, free text
  issuedOn?: string;
  expiresOn: string;
  reminderDays?: number;
  documentUrl?: string; // an https link to the document (Drive, Dropbox, the supplier's site). Balancr does not store files.
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// Something that happened that should have been prevented or recorded: a near miss, an injury, damage, a customer incident.
export interface Incident {
  id: string;
  kind: string;
  date: string;
  place?: string;
  description: string;
  severity: string;
  actionTaken?: string;
  status: "open" | "closed";
  closedAt?: number;
  reportedByUid?: string;
  reportedByName?: string;
  createdAt: number;
  updatedAt: number;
}

// Equipment or a vehicle that needs servicing by date, by distance, or both.
export interface MaintenanceItem {
  id: string;
  name: string;
  intervalDays?: number;
  intervalKm?: number;
  currentKm?: number;
  lastDoneDate?: string;
  lastDoneKm?: number;
  log?: { id: string; date: string; km?: number; note?: string; cost?: number; byName?: string }[]; // capped at 200
  createdAt: number;
  updatedAt: number;
}

// A number the business tracks against a target each week or month, e.g. on-time orders, mortality, table turns.
export interface KpiMeasure {
  id: string;
  name: string;
  ownerName?: string; // who is accountable for this number moving
  timing?: "leading" | "lagging"; // leading predicts a result; lagging records one (lib/kpiFocus.ts)
  decisionQuestion?: string; // the decision this number informs; a number with none is one nobody is acting on
  source?: string; // an automatic measure (lib/salesMeasures.ts or lib/opsMeasures.ts): the KPI's figure is the live measure, not a typed reading
  amberPct?: number; // how far short of the target still counts as amber, as a percentage of the target (default 10)
  unit: string;
  target: number;
  direction: "higher" | "lower";
  period: "week" | "month";
  readings?: { id: string; period: string; value: number; note?: string }[]; // one per period; the newest 260 are kept
  createdAt: number;
  updatedAt: number;
}

// A performance review of one employee: a rating, what went well, what to improve, and goals to check next time.
export interface PerformanceReview {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  rating: number; // 1 to 5
  strengths?: string;
  improvements?: string;
  goals: { id: string; text: string; dueDate?: string; done: boolean }[];
  nextReviewOn?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Risk and quality (v177e, lib/riskQuality.ts) ----

// A risk the business could face, scored likelihood times impact, with what is done about it and when it is next looked at. The
// continuity category holds the plan for keeping the business running when the normal way fails.
export interface Risk {
  id: string;
  title: string;
  category: string;
  likelihood: number;
  impact: number;
  description?: string;
  mitigation?: string;
  ownerName?: string;
  reviewOn?: string;
  status: "open" | "mitigated" | "accepted" | "closed";
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// A check of a product, service, batch, delivery or complaint, with the result, any defects, and the corrective action if one is needed.
export interface QualityCheck {
  id: string;
  title: string;
  date: string;
  area: string;
  result: "pass" | "conditional" | "fail";
  defectsFound?: number;
  defectNote?: string;
  correctiveAction?: string;
  actionOwner?: string;
  actionDueOn?: string;
  actionDoneOn?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Business log (v182, lib/businessLog.ts): competitors, objectives, correspondence and inspections in one shape ----
export interface BusinessLogEntry {
  id: string;
  kind: "competitor" | "objective" | "correspondence" | "inspection" | "partner" | "waitlist" | "backorder" | "decision" | "handover" | "responsibility";
  title: string;
  date?: string;
  qty?: number;
  alternative?: string; // decision: the next best option passed over (opportunity cost)
  accountable?: string; // responsibility (RACI)
  consulted?: string;
  informed?: string;
  where?: string;
  offer?: string;
  priceSeen?: string;
  threat?: string;
  targetDate?: string;
  progressPct?: number;
  status?: string;
  ownerName?: string;
  linkedKpiName?: string;
  direction?: string;
  channel?: string;
  party?: string;
  summary?: string;
  steps?: string;
  frequencyDays?: number;
  lastDoneOn?: string;
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}


// ---- Web order (v183, lib/webOrders.ts): an order from the business's own shop or site, waiting for the owner to confirm it as sales ----
export interface WebOrder {
  id: string;
  externalId: string;
  customerName: string;
  contact?: string;
  note?: string;
  placedOn: string;
  promisedDate?: string; // the day the customer was promised their goods
  customerAddress?: string; // where the goods go, from the shop (optional)
  deliveredOn?: string; // the day the owner recorded it as delivered
  startedAt?: number; // v319: when the owner started working on the order (epoch ms), for cycle time (lib/orderCycle.ts)
  finishedAt?: number; // v319: when the order was finished (epoch ms); the buffer is measured against the promised day from this
  recognition?: "confirmation" | "delivery"; // v278: when the sales are recorded: at confirmation (default) or as each part is delivered
  paymentMethod?: string; // v278: how the customer pays, kept so each delivery's sales use it
  deliveryInvoices?: number; // v278: how many per-delivery invoices have been raised for this order
  driverName?: string; // v238: who takes this order on the run
  area?: string; // v238: the area or route it is delivered on
  lines: { name: string; qty: number; productId?: string; unitPrice?: number; deliveredQty?: number }[]; // v277: deliveredQty = how much of the line has gone so far
  total: number;
  status: "new" | "confirmed" | "declined";
  decidedAt?: number;
  decidedByName?: string;
  createdAt: number;
}

// ---- Accrual (v209, lib/accruals.ts): a cost incurred in a month but billed later, reversing on the first day of the next month ----
export interface Accrual {
  id: string;
  name: string;
  amount: number; // the estimate, in the business's base currency
  category: string; // one of EXPENSE_CATEGORIES
  periodMonth: string; // YYYY-MM the cost was incurred
  accrualDate: string; // last day of periodMonth: the cost is recognised here
  reversalDate: string; // first day of the next month: the cost reverses here
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
}

