"use client";

import { shouldOfferWholesale, wholesaleEntryPrice } from "@/lib/wholesale";
import { tierBasePrice, tierEntryPrice } from "@/lib/priceTiers";
import { cleanSerial, warrantyEndDate } from "@/lib/warranty";
import { cleanTip } from "@/lib/tips";
import { findPromoPercent, promoOff, promotedPrice } from "@/lib/promoCodes";
import { buyToOrderPlan } from "@/lib/buyToOrder";
import { describeTaxRates, invoiceLineTaxes, shopTaxRatePct, taxFor, taxRatePctFor } from "@/lib/tax";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import type { PaymentMethod, Product, Sale, Recurrence } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { suggestExpenseCategory } from "@/lib/expenseCategory";
import { CURRENCIES, convertToBase } from "@/lib/fx";
import { creditLimitFor, existingSaleCreditPosition, projectCreditExposure } from "@/lib/calculations";
import { Button, Field, Input, Label, Select } from "@/components/ui";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";
import OcrScanner from "@/components/OcrScanner";
import ReferenceRateHint from "@/components/ReferenceRateHint";
import { useFillReferenceRate, useReferenceRate } from "@/hooks/useReferenceRate";
import { parseReceiptDate } from "@/lib/receiptDate";
import { priceSanity } from "@/lib/priceSanity";
import { lookupBySku } from "@/lib/skuLookup";
import CameraScanButton from "@/components/CameraScan";
import { shortfall } from "@/lib/stockOuts";
import { customerIsTaxExempt } from "@/lib/tax";
import { buildDeliverySale, deliveryTaxFor, newInvoiceId, parseDeliveryAmount, resolveDeliveryItem } from "@/lib/delivery";
import { cleanSaleChannel, SALE_CHANNEL_PRESETS } from "@/lib/salesChannels";
import { baseUnitLabel, describePackEntry, entryUnitsFor, formatQtyWithUnit, resolveEntryUnit, toBaseQty, toBaseUnitAmount } from "@/lib/units";
import { landedUnitCost } from "@/lib/calculations";
import { PackUnitSelect } from "@/components/PackUnitSelect";
import { batchPickChoices, type BatchRow } from "@/lib/batchLedger";
import { consumptionUnitCost } from "@/lib/costing";

// These three forms back every "just get the data in fast" entry point in
// the app (Dashboard quick actions, Products page per-row +Stock/Sell).
// Kept in one place so the qty→profit math, the oversell warning, and the
// error handling only exist once. `onDone` closes whatever modal is
// hosting the form; each form is responsible for its own toast feedback so
// a failed write never leaves the user staring at a modal that silently
// did nothing.

// Shared by QuickSaleForm and QuickStockForm: lets a single transaction be
// entered in a currency other than the business's base currency. Only shows
// the rate input once a non-base currency is picked — the common case (same
// currency as always) stays a single dropdown, no extra fields to fill in.
function CurrencyRateFields({
  baseCurrency,
  currency,
  onCurrencyChange,
  exchangeRate,
  onExchangeRateChange,
  reference,
}: {
  baseCurrency: string;
  currency: string;
  onCurrencyChange: (c: string) => void;
  exchangeRate: string;
  onExchangeRateChange: (r: string) => void;
  reference: number | null;
}) {
  const currencyOptions = CURRENCIES.includes(baseCurrency) ? CURRENCIES : [baseCurrency, ...CURRENCIES];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field>
        <Label>Currency</Label>
        <Select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
          {currencyOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      {currency !== baseCurrency && (
        <Field>
          <Label>
            Rate (1 {currency} = ? {baseCurrency})
          </Label>
          <Input
            required
            type="number"
            // Must be above zero: lib/fx.ts treats a missing rate as 1, so a rate of 0 would silently record
            // 100 USD as 100 in the business currency.
            min="0.0001"
            step="0.0001"
            value={exchangeRate}
            onChange={(e) => onExchangeRateChange(e.target.value)}
          />
          <ReferenceRateHint currency={currency} base={baseCurrency} rate={exchangeRate} setRate={onExchangeRateChange} reference={reference} />
        </Field>
      )}
    </div>
  );
}

function SummaryRow({ label, value, currency, muted }: { label: string; value: number; currency: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-xs ${muted ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span className="num">{formatMoney(value, currency)}</span>
    </div>
  );
}

// Pre-fill values for a fresh (non-edit) form — used by the AI Assistant to
// hand off a natural-language or scanned-receipt proposal into the exact
// same trusted form/validation/write path every other entry point uses, so
// the model never has a more direct route to the ledger than a human does.
export interface QuickSaleInitial {
  productId?: string;
  qty?: number;
  unitPrice?: number;
  // Set when the AI Assistant understood the amount above as stated in a
  // currency other than the business's base currency (see
  // lib/aiAutoConfirm.ts's isAutoConfirmable, which refuses to auto-log
  // one of these — the exchange rate below is the ONLY place one ever
  // gets collected, so a foreign-currency proposal always needs a human
  // here). `unitPrice` above is the amount IN this currency, unconverted.
  currency?: string;
  date?: string;
  customer?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export function QuickSaleForm({
  fixedProduct,
  existingSale,
  initial,
  onDone,
}: {
  fixedProduct?: Product;
  existingSale?: Sale;
  initial?: QuickSaleInitial;
  onDone: () => void;
}) {
  const {
    products, catalog, ledgers, addSale, addSales, addPurchase, addStockOut, updateSale, settings, projects, customers, addCustomer, customerCreditStatus,
    receivablesAging, receivablePayments, receivableWriteOffs, locations,
    purchases, sales, saleReturns, stockAdjustments, supplierReturns,
  } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const currency = settings.currency;
  const isStaff = role === "staff";

  // Staff never has read access to `products` (it carries cost prices) —
  // the picker for that role is built from `catalog`, a cost-stripped
  // mirror. Everyone else uses the real product list, cost preview and all.
  const sellable = useMemo(() => {
    if (isStaff) {
      return catalog
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name, sku: c.sku, type: c.type, defaultSellPrice: c.sellPrice, wholesalePrice: c.wholesalePrice ?? undefined, priceTiers: c.priceTiers ?? undefined, warrantyMonths: c.warrantyMonths ?? undefined, taxRatePct: c.taxRatePct ?? undefined, baseUnit: c.baseUnit, allowFractionalQty: c.allowFractionalQty, packSizes: c.packSizes ?? undefined }));
    }
    return products.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, sku: p.sku, type: p.type, defaultSellPrice: p.defaultSellPrice, wholesalePrice: p.wholesalePrice, priceTiers: p.priceTiers, warrantyMonths: p.warrantyMonths, taxRatePct: p.taxRatePct, baseUnit: p.baseUnit, allowFractionalQty: p.allowFractionalQty, packSizes: p.packSizes }));
  }, [isStaff, catalog, products]);

  const lockedProduct =
    fixedProduct ??
    (existingSale ? products.find((p) => p.id === existingSale.productId) : undefined) ??
    (initial?.productId ? products.find((p) => p.id === initial.productId) : undefined);
  const [productId, setProductId] = useState(lockedProduct?.id ?? existingSale?.productId ?? initial?.productId ?? sellable[0]?.id ?? "");
  const product = lockedProduct ?? sellable.find((p) => p.id === productId);
  const [qty, setQty] = useState(existingSale?.qty?.toString() ?? initial?.qty?.toString() ?? "");
  const [unitPrice, setUnitPrice] = useState(
    (existingSale?.foreignUnitPrice ?? existingSale?.unitPrice)?.toString() ?? initial?.unitPrice?.toString() ?? product?.defaultSellPrice?.toString() ?? ""
  );
  const [txCurrency, setTxCurrency] = useState(existingSale?.currency ?? initial?.currency ?? settings.currency);
  const [exchangeRate, setExchangeRate] = useState((existingSale?.exchangeRate ?? 1).toString());
  const referenceRate = useReferenceRate(txCurrency, settings.currency);
  useFillReferenceRate({ currency: txCurrency, base: settings.currency, rate: exchangeRate, setRate: setExchangeRate, reference: referenceRate });
  const [date, setDate] = useState(existingSale?.date ?? initial?.date ?? todayIso());
  const [supplyDate, setSupplyDate] = useState(existingSale?.supplyDate ?? "");
  const [customer, setCustomer] = useState(existingSale?.customer ?? initial?.customer ?? "");
  const exemptCustomer = customerIsTaxExempt(customers, customer); // tax-exempt customers pay no sales tax (lib/tax.ts)
  const [customerContact, setCustomerContact] = useState(existingSale?.customerContact ?? "");
  const [notes, setNotes] = useState(existingSale?.notes ?? initial?.notes ?? "");
  const [serialNo, setSerialNo] = useState(existingSale?.serialNo ?? "");
  const [saleChannel, setSaleChannel] = useState(existingSale?.saleChannel ?? "");
  const [tipText, setTipText] = useState(existingSale?.tipAmount?.toString() ?? "");
  const [promoText, setPromoText] = useState(existingSale?.promoCode ?? "");
  const [promoApplied, setPromoApplied] = useState(!!existingSale?.promoCode);
  const [promoBase, setPromoBase] = useState<number | null>(null); // the price before the code was applied
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(existingSale?.paymentMethod ?? initial?.paymentMethod ?? "cash");
  const [creditTermDays, setCreditTermDays] = useState(
    (existingSale?.creditTermDays ?? settings.defaultCreditTermDays).toString()
  );
  const [projectId, setProjectId] = useState(existingSale?.projectId ?? "");
  const [locationId, setLocationId] = useState(existingSale?.locationId ?? defaultLocationId(locations));
  // Optional: which delivery (batch) these units came off the shelf from. Only offered for goods that were bought with a
  // batch number or use-by date, and only to people who can see purchases (Staff cannot, so it never shows for them).
  // Memo only (lib/batchLedger.ts): no cost, stock or profit figure changes. Blank = estimated, earliest expiry first.
  const [batchPurchaseId, setBatchPurchaseId] = useState(existingSale?.batchPurchaseId ?? "");
  const [busy, setBusy] = useState(false);
  // Selling by the pack (a carton of 12): qty and price are typed per pack and converted to base units before anything
  // is saved or calculated, exactly like buying in packs (lib/units.ts). "" = the base unit. When an existing sale is
  // edited it is shown in base units, since that is all that was ever stored.
  const [entryUnitId, setEntryUnitId] = useState("");
  // Delivery charged to the customer: an extra line on the same invoice (lib/delivery.ts). Only offered once the owner
  // has turned it on in Settings, and only on a new sale of goods; an existing sale's delivery is its own line.
  const [delivery, setDelivery] = useState("");
  const deliveryItem = useMemo(() => resolveDeliveryItem(settings, isStaff ? catalog : products), [settings, isStaff, catalog, products]);
  // Notes and Project are both optional and used far less often than the
  // fields above — pre-existing values (editing a sale that already has
  // them) start expanded so nothing silently hides data that's already
  // there; a fresh sale starts collapsed so the common case is a short form.
  const [showMoreDetails, setShowMoreDetails] = useState(!!(existingSale?.notes || existingSale?.projectId || initial?.notes || existingSale?.serialNo || existingSale?.saleChannel));

  const wac = ledgers.get(productId)?.wac ?? 0;
  const qtyOnHand = ledgers.get(productId)?.qtyOnHand ?? 0;
  const isProduct = product?.type === "product";
  // Batches to pick from: only this product's records are replayed, and only when some delivery carries a batch or expiry.
  // (The same rule the multi-item invoice uses, in lib/batchLedger.ts batchPickChoices.)
  const batchOptions = useMemo(() => {
    if (isStaff || !isProduct || !productId) return [];
    return batchPickChoices(productId, { purchases, sales, saleReturns, stockAdjustments, supplierReturns }, batchPurchaseId || undefined);
  }, [isStaff, isProduct, productId, purchases, sales, saleReturns, stockAdjustments, supplierReturns, batchPurchaseId]);

  const entryUnit = resolveEntryUnit(isProduct ? product : undefined, entryUnitId);
  const factor = entryUnit.factor;
  const qtyEntered = Number(qty) || 0; // in the entry unit (a pack, or one piece)
  const qtyNum = toBaseQty(qtyEntered, factor); // always base units from here on
  const priceNum = toBaseUnitAmount(Number(unitPrice) || 0, factor); // entered price per ENTRY unit -> per base unit, in txCurrency
  const rateNum = txCurrency === settings.currency ? 1 : Number(exchangeRate) || 0;
  const basePriceNum = convertToBase(priceNum, rateNum); // base-currency equivalent — what every calc below uses
  const revenue = qtyNum * basePriceNum;
  // The cost preview follows the costing method: average cost, or (batch costing) the batch(es) this sale would draw from.
  const unitCostNow = useMemo(
    () => (isStaff || !isProduct ? wac : consumptionUnitCost(settings.costingMethod ?? "average", wac, productId, qtyNum, date, { purchases, sales, saleReturns, stockAdjustments, supplierReturns }, { batchPurchaseId: batchPurchaseId || undefined, excludeSaleId: existingSale?.id })),
    [isStaff, isProduct, wac, settings.costingMethod, productId, qtyNum, date, purchases, sales, saleReturns, stockAdjustments, supplierReturns, batchPurchaseId, existingSale?.id]
  );
  const cogs = isProduct ? qtyNum * unitCostNow : 0;
  const profit = revenue - cogs;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : null;
  // Sales tax (VAT/GST) charged to the customer — a completely separate
  // thing from profit. Off unless Settings.salesTaxEnabled, computed on
  // the untaxed revenue, and snapshotted onto Sale.taxAmount at submit
  // time so a later rate change never rewrites this sale's history.
  // The item's own rate (Product.taxRatePct) when it has one, else the shop rate; delivery below keeps the shop rate.
  const taxAmount = taxFor(revenue, product, settings, exemptCustomer);
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const totalWithTax = revenue + taxAmount;
  const deliveryEntered = deliveryItem && !existingSale && isProduct ? parseDeliveryAmount(delivery) : 0;
  const deliveryBase = convertToBase(deliveryEntered, rateNum); // base-currency equivalent
  const deliveryTax = deliveryTaxFor(deliveryBase, settings, exemptCustomer);
  const payTotal = totalWithTax + deliveryBase + deliveryTax; // everything the customer pays or owes on this sale
  // When editing a past sale, the units it already took out of stock are
  // still reflected in the current on-hand count, so the true "room" for
  // this sale is what's on hand plus what it already used. Staff can't
  // reach the edit path at all (only Owner/Manager can), so this only ever
  // applies to a role that already has full stock visibility.
  const availableForThisSale = isProduct ? qtyOnHand + (existingSale?.qty ?? 0) : Infinity;
  const oversell = isProduct && !isStaff && qtyNum > availableForThisSale;
  // Advisory only: flags a price far from the product's usual one (a dropped or extra zero), never blocks.
  // A customer marked wholesale, on an item that has a wholesale price: offer it as a one-tap suggestion (never applied
  // by itself). Only for a sale in the shop currency, where the entered price is directly comparable.
  const wholesaleCustomer = customers.find((c) => c.wholesale && c.name.trim().toLowerCase() === customer.trim().toLowerCase());
  const wholesaleBase = product?.wholesalePrice && product.wholesalePrice > 0 ? product.wholesalePrice : undefined;
  const wholesaleSuggestion = wholesaleCustomer && rateNum === 1 ? wholesaleEntryPrice(wholesaleBase, factor) : undefined;
  const atWholesalePrice = wholesaleBase !== undefined && Math.abs(basePriceNum - wholesaleBase) < 0.005;
  // Quantity price breaks: when the quantity reaches one, offer that price (never applied by itself, shop currency only).
  const tierSuggestion = rateNum === 1 ? tierEntryPrice(product?.priceTiers, qtyNum, factor) : undefined;
  const tierBase = tierBasePrice(product?.priceTiers, qtyNum);
  const atTierPrice = tierBase !== undefined && Math.abs(basePriceNum - tierBase) < 0.005;
  // The usual-price warning would fire on a deliberate wholesale or price-break price, so it stays quiet when that is what was entered.
  const priceHint = atWholesalePrice || atTierPrice ? null : priceSanity(basePriceNum, product?.defaultSellPrice);
  // Serial number / IMEI (lib/warranty.ts): shown up front for an item that carries a warranty, under more details otherwise.
  const warrantyEnds = warrantyEndDate(date, product?.warrantyMonths);
  const showSerialTop = isProduct && ((product?.warrantyMonths ?? 0) > 0 || serialNo.trim() !== "");
  const serialField = (
    <Field>
      <Label>Serial number / IMEI (optional)</Label>
      <Input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} placeholder="Several units: separate with commas" />
      {warrantyEnds && (
        <div className="text-[11px] text-muted mt-1">Warranty: {product?.warrantyMonths} months, to {warrantyEnds}.</div>
      )}
    </Field>
  );

  // Advisory only (see Customer.creditLimit) — this never blocks the sale,
  // it just surfaces what extending more credit here would mean before you
  // commit to it. Only applies to a credit sale for a customer who actually
  // has a limit set; everyone else sees nothing here. When editing a sale that
  // is already on this customer's balance, that balance is replaced, not added
  // to (projectCreditExposure), or every edit would look like double the debt.
  const creditKey = customer.trim().toLowerCase();
  const creditStatusForCustomer = paymentMethod === "credit" && creditKey ? customerCreditStatus.get(creditKey) : undefined;
  const existingCredit = existingSale
    ? {
        ...existingSaleCreditPosition(existingSale.id, receivablesAging, receivablePayments, receivableWriteOffs),
        sameCustomer: (existingSale.customer ?? "").trim().toLowerCase() === creditKey,
      }
    : undefined;
  const creditExposure = projectCreditExposure(creditStatusForCustomer, payTotal, existingCredit);
  const overLimitBy = creditExposure?.overBy ?? 0;
  // Staff can't see what a customer owes across everyone's sales, so all they
  // can honestly be told is that a limit exists.
  const staffLimitNote = isStaff && paymentMethod === "credit" ? creditLimitFor(customers, customer) : undefined;

  function handleProductChange(id: string) {
    setProductId(id);
    setEntryUnitId("");
    setBatchPurchaseId("");
    const p = sellable.find((pr) => pr.id === id);
    if (p?.defaultSellPrice !== undefined) setUnitPrice(p.defaultSellPrice.toString());
  }
  // Switching between pieces and a pack: carry the usual price across (usual price x pack size) unless the person
  // typed their own, so a carton of 12 does not stay priced as one piece.
  function handleEntryUnitChange(id: string) {
    const next = resolveEntryUnit(product, id);
    const d = product?.defaultSellPrice;
    const current = Number(unitPrice);
    if (d !== undefined && (unitPrice === "" || Math.abs(current - d * factor) < 0.005)) setUnitPrice((Math.round(d * next.factor * 100) / 100).toString());
    setEntryUnitId(id);
  }

  // Wanted more than is in stock: record the part you can't supply as a lost sale (a memo, see lib/stockOuts.ts) and
  // shrink this sale to what you do have. Owner/Manager only (they are the ones who see stock), and never on an edit.
  const short = shortfall(qtyNum, availableForThisSale);
  const canLogShort = oversell && short > 0 && !isStaff && !existingSale;
  // Selling before buying (dropshipping, made-to-order): buy the missing units for this order, recorded BEFORE the sale so
  // the sale is costed at what they really cost (lib/buyToOrder.ts). Same people and same cases as logging the lost sale.
  const [buyToOrder, setBuyToOrder] = useState(false);
  const [buyCost, setBuyCost] = useState("");
  const [buySupplier, setBuySupplier] = useState("");
  async function logShortfall() {
    try {
      await addStockOut({
        productId,
        qty: short,
        unitPrice: basePriceNum,
        unitCost: wac > 0 ? wac : undefined,
        date,
        notes: customer.trim() ? `Wanted by ${customer.trim()}` : undefined,
      });
      const have = Math.max(0, availableForThisSale);
      const inEntryUnits = product?.allowFractionalQty ? have / factor : Math.floor(have / factor + 1e-9);
      setQty(inEntryUnits > 0 ? String(Math.round(inEntryUnits * 10000) / 10000) : "");
      toast.success("Lost sale logged", `${product?.name ?? "Item"}: ${formatQtyWithUnit(short, product)} you couldn't supply`);
    } catch (err) {
      toast.error("Couldn't log that", toastableErrorMessage(err));
    }
  }

  // Scan (or type) an item's code to pick it. Scanners press Enter after the code, which would otherwise submit the form.
  const [scanCode, setScanCode] = useState("");
  const [scanNote, setScanNote] = useState("");
  const anySku = sellable.some((p) => (p.sku ?? "").trim() !== "");
  function applyScan(code: string = scanCode) {
    setScanCode(code);
    const hit = lookupBySku(sellable, code);
    if (hit.status === "found") {
      handleProductChange(hit.product.id);
      setScanNote(`Picked ${hit.product.name}`);
      setScanCode("");
      document.getElementById("sale-qty")?.focus();
    } else if (hit.status === "none") {
      setScanNote("No item has that code. Check the code, or pick the item from the list below.");
    } else if (hit.status === "ambiguous") {
      setScanNote("More than one item has that code. Pick the item from the list below.");
    }
  }

  if (!product) return <div className="text-sm text-muted">Add a product or service first.</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const values = {
            productId,
            supplyDate: supplyDate || undefined,
            qty: qtyNum,
            unitPrice: basePriceNum,
            currency: txCurrency !== settings.currency ? txCurrency : undefined,
            exchangeRate: txCurrency !== settings.currency ? rateNum : undefined,
            foreignUnitPrice: txCurrency !== settings.currency ? priceNum : undefined,
            date,
            customer: customer || undefined,
            customerContact: customerContact || undefined,
            notes: [notes, describePackEntry(qtyEntered, entryUnit, product)].filter(Boolean).join(" · ") || undefined,
            serialNo: cleanSerial(serialNo),
            saleChannel: cleanSaleChannel(saleChannel),
            tipAmount: cleanTip(tipText),
            promoCode: promoApplied && promoText.trim() ? promoText.trim().toUpperCase() : undefined,
            promoOffAmount: promoApplied
              ? promoBase !== null
                ? promoOff(promoBase, Number(unitPrice) || 0, qtyEntered)
                : existingSale?.promoOffAmount
              : undefined,
            paymentMethod,
            creditTermDays: paymentMethod === "credit" ? Number(creditTermDays) || settings.defaultCreditTermDays : undefined,
            projectId: projectId || undefined,
            taxAmount: taxAmount > 0 ? taxAmount : undefined,
            locationId: locationId || undefined,
            batchPurchaseId: batchPurchaseId || undefined,
          };
          if (buyToOrder && canLogShort && !existingSale) {
            const bp = buyToOrderPlan(short, buyCost);
            if (!bp.ok) {
              toast.error("Check the cost of the units you are buying", bp.error);
              setBusy(false);
              return;
            }
            // The purchase goes in first (earlier createdAt on the same date), so the ledger sees stock arrive, then leave.
            await addPurchase({
              productId,
              qty: bp.plan.qty,
              unitCost: bp.plan.unitCost,
              date,
              supplier: buySupplier.trim() || undefined,
              notes: `Bought to order${customer.trim() ? ` for ${customer.trim()}` : ""}`,
              paymentMethod: "cash",
              locationId: locationId || undefined,
            });
            toast.success("Purchase recorded first", `${product?.name ?? "Item"}: ${formatQtyWithUnit(bp.plan.qty, product)} at ${formatMoney(bp.plan.unitCost, currency)} each`);
          }
          if (existingSale) {
            await updateSale(existingSale.id, values);
            toast.success("Updated", `${product.name}: ${formatMoney(revenue, currency)} revenue`);
          } else {
            if (deliveryEntered > 0 && deliveryItem) {
              // Goods and delivery share one invoice id and are saved together, so a failure cannot leave one without the other.
              const invoiceId = newInvoiceId();
              await addSales([
                { ...values, invoiceId },
                buildDeliverySale({
                  deliveryProductId: deliveryItem.id,
                  amount: deliveryEntered,
                  currency: txCurrency !== settings.currency ? txCurrency : undefined,
                  exchangeRate: rateNum,
                  goods: { date, customer: values.customer, customerContact: values.customerContact, paymentMethod, creditTermDays: values.creditTermDays, projectId: values.projectId, locationId: values.locationId, invoiceId, saleChannel: values.saleChannel },
                  taxAmount: deliveryTax,
                }),
              ]);
            } else {
              await addSale(values);
            }
            toast.success(
              "Sold!",
              isStaff
                ? `${product.name}: ${formatMoney(payTotal, currency)}${deliveryEntered > 0 ? " incl. delivery" : ""}${paymentMethod === "credit" ? " (on credit)" : ""}`
                : `${product.name}: ${formatMoney(payTotal, currency)}${deliveryEntered > 0 ? " incl. delivery" : ""} revenue, ${formatMoney(profit, currency)} profit${marginPct !== null ? ` (${marginPct.toFixed(0)}%)` : ""}`
            );
          }
          // Quietly grow the customer directory: if the name typed here
          // doesn't match anyone already in it, add them — so next time
          // they're one tap in the autocomplete instead of a retyped (and
          // possibly differently-spelled) name. Best-effort and silent: a
          // failed directory write should never block or surface an error
          // for a sale that already saved successfully.
          if (customer.trim() && !customers.some((c) => c.name.trim().toLowerCase() === customer.trim().toLowerCase())) {
            addCustomer({ name: customer.trim(), contact: customerContact || undefined }).catch(() => {});
          }
          onDone();
        } catch (err) {
          toast.error("Couldn't save that sale", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      {!lockedProduct && anySku && (
        <Field>
          <Label>Scan or type a code (optional)</Label>
          <Input
            value={scanCode}
            onChange={(e) => {
              setScanCode(e.target.value);
              if (scanNote) setScanNote("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyScan();
              }
            }}
            placeholder="Scan a barcode, or type the item's SKU, then press Enter"
            autoComplete="off"
          />
          <CameraScanButton onCode={(code) => applyScan(code)} />
          {scanNote && <div className="text-xs text-muted mt-1" role="status">{scanNote}</div>}
        </Field>
      )}
      {!lockedProduct && (
        <Field>
          <Label>What did you sell?</Label>
          <Select required value={productId} onChange={(e) => handleProductChange(e.target.value)}>
            {sellable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.type === "service" ? "(service)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {isProduct && <PackUnitSelect product={product} value={entryUnitId} onChange={handleEntryUnitChange} label="Selling in" />}
      {batchOptions.length > 0 && (
        <Field>
          <Label>Which batch? (optional)</Label>
          <Select value={batchPurchaseId} onChange={(e) => setBatchPurchaseId(e.target.value)}>
            <option value="">Not sure: earliest expiry first</option>
            {batchOptions.map((b) => (
              <option key={b.purchaseId} value={b.purchaseId}>
                {b.batchRef ? `Batch ${b.batchRef}` : `Bought ${b.receivedDate}`}
                {b.expiryDate ? ` · expires ${b.expiryDate}` : ""} · {formatNumber(b.remaining)} left
              </option>
            ))}
          </Select>
          <div className="text-[11px] text-muted mt-1">Pick it only if you know which one left the shelf. It is kept for recalls and changes no figure.</div>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>
            {!isProduct
              ? "How many hours / jobs?"
              : entryUnit.id !== ""
                ? `How many ${entryUnit.name}s did you sell?`
                : `How many did you sell?${baseUnitLabel(product) ? ` (${baseUnitLabel(product)})` : ""}`}
          </Label>
          <Input id="sale-qty" required autoFocus={!!fixedProduct} type="number" inputMode="decimal" min="0" step={product.allowFractionalQty ? "any" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>{!isProduct ? "Price for each hour / job" : entryUnit.id !== "" ? `Price for each ${entryUnit.name}` : "Price for each one"}</Label>
          <Input required type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </Field>
      </div>
      {entryUnit.id !== "" && qtyEntered > 0 && (
        <div className="text-xs text-muted -mt-2">
          = {formatQtyWithUnit(qtyNum, product)} at {formatMoney(basePriceNum, settings.currency)} each. Stock is counted in {baseUnitLabel(product) || "single units"}.
        </div>
      )}
      <CurrencyRateFields
        baseCurrency={settings.currency}
        currency={txCurrency}
        onCurrencyChange={setTxCurrency}
        exchangeRate={exchangeRate}
        onExchangeRateChange={setExchangeRate}
        reference={referenceRate}
      />
      {txCurrency !== settings.currency && priceNum > 0 && rateNum > 0 && (
        <div className="text-xs text-muted -mt-2">
          = {formatMoney(basePriceNum, settings.currency)} per unit at this rate
        </div>
      )}
      {deliveryItem && !existingSale && isProduct && (
        <Field>
          <Label>Delivery charged to the customer (optional)</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="0" />
          <div className="text-xs text-muted mt-1">Added to the same invoice as its own line. Leave blank for no delivery charge.</div>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Date of supply (only if different from the date)</Label>
          <Input type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Sold from" />
        <Field>
          <Label>How did they pay?</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="credit">Credit — they&apos;ll pay later</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Customer {paymentMethod === "credit" ? "" : "(optional)"}</Label>
          <Input
            required={paymentMethod === "credit"}
            value={customer}
            list="customer-directory"
            onChange={(e) => {
              const v = e.target.value;
              setCustomer(v);
              // Picked (or typed exactly) a name already in the directory —
              // carry over their saved contact so it doesn't need retyping.
              const match = customers.find((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase());
              if (match?.contact && !customerContact) setCustomerContact(match.contact);
            }}
          />
          <datalist id="customer-directory">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        {paymentMethod === "credit" ? (
          <Field>
            <Label>Days until due</Label>
            <Input required type="number" min="1" step="1" value={creditTermDays} onChange={(e) => setCreditTermDays(e.target.value)} />
          </Field>
        ) : (
          <Field>
            <Label>Phone (optional)</Label>
            <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
          </Field>
        )}
      </div>
      {paymentMethod === "credit" && (
        <Field>
          <Label>Their phone / contact (so you can chase this)</Label>
          <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
        </Field>
      )}
      <Field>
        <button
          type="button"
          onClick={() => setShowMoreDetails((v) => !v)}
          className="text-xs text-amber-soft font-medium -mb-1"
        >
          {showMoreDetails ? "− Hide notes & project" : "+ Add notes / project"}
        </button>
      </Field>
      {showMoreDetails && (
        <>
          <Field>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {!showSerialTop && isProduct && serialField}
          <SoldThroughField value={saleChannel} onChange={setSaleChannel} />
          {txCurrency === settings.currency && Object.keys(settings.promoCodes ?? {}).length > 0 && (() => {
            const pct = findPromoPercent(settings.promoCodes, promoText);
            return (
              <Field>
                <Label>Promo code (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={promoText}
                    onChange={(e) => {
                      setPromoText(e.target.value);
                      setPromoApplied(false);
                      setPromoBase(null);
                    }}
                    placeholder="e.g. SAVE10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={promoApplied || pct === null}
                    onClick={() => {
                      if (pct === null) return;
                      const current = Number(unitPrice) || 0;
                      setPromoBase(current);
                      setUnitPrice(promotedPrice(current, pct).toString());
                      setPromoApplied(true);
                    }}
                  >
                    {promoApplied ? "Applied" : "Apply"}
                  </Button>
                </div>
                <div className="text-[11px] text-muted mt-1">
                  {promoApplied
                    ? "The lower price is filled in. The sale is saved at that price."
                    : promoText.trim() === ""
                    ? "Type one of your promo codes to fill in the lower price."
                    : pct === null
                    ? "That is not one of your promo codes."
                    : `${promoText.trim().toUpperCase()} takes ${pct}% off. Press Apply.`}
                </div>
              </Field>
            );
          })()}
          <Field>
            <Label>Tip (optional)</Label>
            <Input type="number" min="0" step="0.01" value={tipText} onChange={(e) => setTipText(e.target.value)} />
            <div className="text-[11px] text-muted mt-1">
              Passed on to your staff. A tip is not revenue or profit, and it does not change any figure. The Sales page adds up the tips.
            </div>
          </Field>
          {!isStaff && projects.length > 0 && (
            <Field>
              <Label>Project (optional)</Label>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— not part of a project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}

      {showSerialTop && serialField}

      {qtyNum > 0 && (
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 space-y-1.5">
          <SummaryRow label={paymentMethod === "credit" ? "Owed to you" : "Money coming in"} value={revenue} currency={currency} />
          {isProduct && !isStaff && (
            <SummaryRow label={`What it cost you (${formatMoney(unitCostNow, currency)} each)`} value={cogs} currency={currency} muted />
          )}
          {deliveryBase > 0.005 && <SummaryRow label="Delivery charge" value={deliveryBase} currency={currency} muted />}
          {taxAmount + deliveryTax > 0.005 && (
            <SummaryRow label={`${taxLabel} (${describeTaxRates([taxRatePctFor(product, settings), ...(deliveryBase > 0 ? [shopTaxRatePct(settings)] : [])])})`} value={taxAmount + deliveryTax} currency={currency} muted />
          )}
          {(taxAmount + deliveryTax > 0.005 || deliveryBase > 0.005) && (
            <SummaryRow label={paymentMethod === "credit" ? "Total owed to you" : "Total money coming in"} value={payTotal} currency={currency} />
          )}
          {!isStaff && (
            <div className="flex items-center justify-between text-sm pt-1.5 border-t border-line">
              <span className="font-medium">Your profit</span>
              <span className={`num font-semibold ${profit >= 0 ? "text-good" : "text-bad"}`}>
                {formatMoney(profit, currency)}
                {marginPct !== null && <span className="text-xs font-normal text-muted ml-1.5">({marginPct.toFixed(0)}%)</span>}
              </span>
            </div>
          )}
          {oversell && (
            <div className="text-xs text-bad pt-1">You only have {formatQtyWithUnit(availableForThisSale, product)} left — this is more than you have.</div>
          )}
          {canLogShort && (
            <div className="text-xs pt-1">
              <button type="button" onClick={logShortfall} className="text-amber-soft font-medium underline">
                Log the {formatQtyWithUnit(short, product)} you can&apos;t supply as a lost sale, and sell only what you have
              </button>
            </div>
          )}
          {canLogShort && (
            <div className="mt-2 rounded-md border border-line px-3 py-2 space-y-2">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={buyToOrder} onChange={(e) => setBuyToOrder(e.target.checked)} />
                <span>
                  I am buying the missing {formatQtyWithUnit(short, product)} from my supplier for this order (dropshipping, made to order).
                  The purchase is recorded first, so this sale&apos;s cost and profit are exact.
                </span>
              </label>
              {buyToOrder && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input type="number" inputMode="decimal" min="0" step="any" placeholder="Supplier's price per unit" value={buyCost} onChange={(e) => setBuyCost(e.target.value)} />
                  <Input placeholder="Supplier (optional)" value={buySupplier} onChange={(e) => setBuySupplier(e.target.value)} />
                </div>
              )}
            </div>
          )}
          {wholesaleSuggestion !== undefined && shouldOfferWholesale(wholesaleSuggestion, Number(unitPrice) || 0) && (
            <div className="text-xs pt-1 flex flex-wrap items-center gap-x-2">
              <span className="text-muted">
                {wholesaleCustomer!.name} is a wholesale customer. Wholesale price: {formatMoney(wholesaleSuggestion, currency)}.
              </span>
              <button type="button" onClick={() => setUnitPrice(wholesaleSuggestion.toString())} className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 text-amber-soft hover:underline">
                Use it
              </button>
            </div>
          )}
          {tierSuggestion !== undefined && shouldOfferWholesale(tierSuggestion, Number(unitPrice) || 0) && (
            <div className="text-xs pt-1 flex flex-wrap items-center gap-x-2">
              <span className="text-muted">
                Price break for {formatQtyWithUnit(qtyNum, product)}: {formatMoney(tierSuggestion, currency)} each.
              </span>
              <button type="button" onClick={() => setUnitPrice(tierSuggestion.toString())} className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 text-amber-soft hover:underline">
                Use it
              </button>
            </div>
          )}
          {priceHint && product?.defaultSellPrice !== undefined && (
            <div className="text-xs text-amber-soft pt-1">
              Usual price for {product.name} is {formatMoney(product.defaultSellPrice, currency)} — you entered {formatMoney(basePriceNum, currency)}
              {priceHint.kind === "low" ? " (much lower)" : " (much higher)"}. Check for a missing or extra zero. Just a heads-up, nothing&apos;s blocked.
            </div>
          )}
          {!existingSale && !isStaff && product && "recipeLines" in product && (product.recipeLines?.length ?? 0) > 0 && (
            <div className="text-xs text-amber-soft pt-1">
              This is a packaged offer with a cost recipe. Selling it here won&apos;t log what it costs to deliver, so your profit will look too high. Use{" "}
              <a href="/offers" className="underline">Offers → Fulfill</a> to log the cost and the sale together.
            </div>
          )}
          {creditStatusForCustomer && creditExposure && overLimitBy > 0 && (
            <div className="text-xs text-bad pt-1">
              With this sale {customer.trim()} would owe {formatMoney(creditExposure.projectedOutstanding, currency)} in total —{" "}
              {formatMoney(overLimitBy, currency)} over their {formatMoney(creditStatusForCustomer.creditLimit, currency)} credit limit.
              Just a heads-up, nothing&apos;s blocked.
            </div>
          )}
          {staffLimitNote !== undefined && (
            <div className="text-xs text-amber-soft pt-1">
              {customer.trim()} has a credit limit of {formatMoney(staffLimitNote, currency)}. You can&apos;t see what they already owe, so
              check with a manager before giving them more on credit.
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !productId}>
          {busy ? "Saving…" : existingSale ? "Save changes" : "Sell"}
        </Button>
      </div>
    </form>
  );
}

// A single line on a multi-item invoice, before it becomes a Sale. Also
// reused by the Estimates page (app/estimates/page.tsx) for the same
// product/qty/price line-editing UI, since an Estimate line is the same
// shape before it's ever committed anywhere.
export interface InvoiceLineDraft {
  key: string; // stable React key — not persisted
  productId: string;
  qty: string;
  unitPrice: string;
  // Pack the qty/price were typed in (a carton), "" or absent = the base unit. Only the multi-item invoice form
  // offers it; estimates and repeating invoices stay in base units. Converted before anything is saved.
  unitId?: string;
  // Serial number / IMEI typed for this line (only offered for an item that carries a warranty).
  serialNo?: string;
  // Which delivery (batch) this line came off the shelf from, picked the same way as on the single sale form (v315).
  // Blank = estimated, earliest expiry first. Memo only: no cost, stock or profit figure changes because of it.
  batchPurchaseId?: string;
}

// "Sold through": how the sale reached the customer (lib/salesChannels.ts). Optional; presets are suggestions, any name works.
function SoldThroughField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field>
      <Label>Sold through (optional)</Label>
      <Input list="sale-channel-presets" placeholder="Walk-in, Wholesale, Online…" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="sale-channel-presets">
        {SALE_CHANNEL_PRESETS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Field>
  );
}

export function newLineDraft(defaultProductId: string, defaultPrice?: number): InvoiceLineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    productId: defaultProductId,
    qty: "1",
    unitPrice: defaultPrice?.toString() ?? "",
  };
}

// Bills several products to one customer as a single invoice with one
// total, instead of the one-product-at-a-time QuickSaleForm above. Writes
// one Sale per line — same collection, same WAC/COGS/receivables math as
// always — tagged with a shared Sale.invoiceId so the Invoices/Receivables
// pages group them back into one row and one payment (see
// computeReceivablesAging and RecordPaymentForm). Deliberately base-currency
// only: QuickSaleForm still handles a single foreign-currency sale: mixing
// per-line currencies on one invoice isn't a case worth the extra fields
// for how rarely a multi-item bill would need it.
export function MultiItemInvoiceForm({ onDone }: { onDone: () => void }) {
  const { products, ledgers, addSales, settings, customers, addCustomer, customerCreditStatus, locations, purchases, sales, saleReturns, stockAdjustments, supplierReturns } = useData();
  const { role: invoiceRole } = useAuth();
  const toast = useToast();
  const currency = settings.currency;

  const sellable = useMemo(() => products.filter((p) => p.active), [products]);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([newLineDraft(sellable[0]?.id ?? "")]);
  // The batch choices for each product on the invoice (v315): the same picker as the single sale form. Staff never see
  // purchases, so they get none. Only products with a batch number or use-by date on some delivery get a list.
  const batchChoicesByProduct = useMemo(() => {
    const out = new Map<string, BatchRow[]>();
    if (invoiceRole === "staff") return out;
    const data = { purchases, sales, saleReturns, stockAdjustments, supplierReturns };
    for (const l of lines) {
      if (!l.productId || out.has(l.productId)) continue;
      if (sellable.find((p) => p.id === l.productId)?.type !== "product") continue;
      out.set(l.productId, batchPickChoices(l.productId, data));
    }
    return out;
  }, [invoiceRole, lines, sellable, purchases, sales, saleReturns, stockAdjustments, supplierReturns]);
  const [date, setDate] = useState(todayIso());
  const [supplyDate, setSupplyDate] = useState("");
  const [customer, setCustomer] = useState("");
  const exemptCustomer = customerIsTaxExempt(customers, customer); // tax-exempt customers pay no sales tax (lib/tax.ts)
  const [customerContact, setCustomerContact] = useState("");
  const [saleChannel, setSaleChannel] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credit");
  const [creditTermDays, setCreditTermDays] = useState(settings.defaultCreditTermDays.toString());
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);
  // Delivery charged to the customer: one more line on this invoice (lib/delivery.ts). Only once Settings turns it on.
  const [delivery, setDelivery] = useState("");
  const deliveryItem = useMemo(() => resolveDeliveryItem(settings, products), [settings, products]);
  const deliveryAmount = deliveryItem ? parseDeliveryAmount(delivery) : 0;

  function updateLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, newLineDraft(sellable[0]?.id ?? "")]);
  }

  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  function handleProductChange(key: string, productId: string) {
    const p = sellable.find((pr) => pr.id === productId);
    updateLine(key, { productId, unitId: "", unitPrice: p?.defaultSellPrice?.toString() ?? "", batchPurchaseId: "" });
  }
  // Switching a line between pieces and a pack carries the usual price across (usual price x pack size) unless the
  // person typed their own.
  function handleUnitChange(key: string, unitId: string) {
    const l = lines.find((x) => x.key === key);
    if (!l) return;
    const p = sellable.find((pr) => pr.id === l.productId);
    const from = resolveEntryUnit(p, l.unitId ?? "").factor;
    const to = resolveEntryUnit(p, unitId).factor;
    const d = p?.defaultSellPrice;
    const patch: Partial<InvoiceLineDraft> = { unitId };
    if (d !== undefined && (l.unitPrice === "" || Math.abs(Number(l.unitPrice) - d * from) < 0.005)) patch.unitPrice = (Math.round(d * to * 100) / 100).toString();
    updateLine(key, patch);
  }

  // qty and unitPrice below are always BASE units; qtyEntered/priceEntered are what was typed (a pack, or one piece).
  const parsedLines = lines.map((l) => {
    const product = sellable.find((p) => p.id === l.productId);
    const entryUnit = resolveEntryUnit(product?.type === "product" ? product : undefined, l.unitId ?? "");
    const qtyEntered = Number(l.qty) || 0;
    const priceEntered = Number(l.unitPrice) || 0;
    const qty = toBaseQty(qtyEntered, entryUnit.factor);
    const unitPrice = toBaseUnitAmount(priceEntered, entryUnit.factor);
    return { ...l, product, entryUnit, qtyEntered, qty, unitPrice, amount: qtyEntered * priceEntered };
  });
  const total = parsedLines.reduce((sum, l) => sum + l.amount, 0);
  const oversellLines = parsedLines.filter(
    (l) => l.product?.type === "product" && l.qty > (ledgers.get(l.productId)?.qtyOnHand ?? 0)
  );
  // Sales tax (VAT/GST) on the whole invoice, distributed across lines
  // proportional to each line's share of the subtotal (with the last
  // valid line absorbing any rounding remainder) so each underlying Sale
  // still carries its own accurate Sale.taxAmount — same as a single-item
  // sale, just split across however many lines share this invoiceId.
  // Each line is taxed at its own item's rate (Product.taxRatePct, else the shop rate); the delivery line at the shop
  // rate. The invoice's tax is the sum of the lines, so what is shown here is exactly what gets saved on the Sales.
  const subtotal = total + deliveryAmount; // goods plus delivery
  const taxPlan = invoiceLineTaxes(
    [...parsedLines.map((l) => ({ amount: l.amount, item: l.product })), ...(deliveryAmount > 0 && deliveryItem ? [{ amount: deliveryAmount }] : [])],
    settings,
    exemptCustomer
  );
  const taxTotal = taxPlan.total;
  const taxRateText = describeTaxRates([
    ...parsedLines.filter((l) => l.amount > 0).map((l) => taxRatePctFor(l.product, settings, exemptCustomer)),
    ...(deliveryAmount > 0 && deliveryItem ? [shopTaxRatePct(settings)] : []),
  ]);
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const grandTotal = subtotal + taxTotal;

  // A customer marked wholesale: offer to put each line that has a wholesale price at that price. A one-tap button,
  // never applied by itself, and it leaves lines without a wholesale price alone.
  const wholesaleInvoiceCustomer = customers.find((c) => c.wholesale && c.name.trim().toLowerCase() === customer.trim().toLowerCase());
  const wholesaleTargets = wholesaleInvoiceCustomer
    ? parsedLines.flatMap((l) => {
        const target = l.product ? wholesaleEntryPrice(l.product.wholesalePrice, l.entryUnit.factor) : undefined;
        return shouldOfferWholesale(target, Number(l.unitPrice) || 0) ? [{ key: l.key, price: target! }] : [];
      })
    : [];
  // Quantity price breaks: each line whose quantity reaches a break and is not already at it. One tap applies them all.
  const tierTargets = parsedLines.flatMap((l) => {
    const target = l.product ? tierEntryPrice(l.product.priceTiers, l.qty, l.entryUnit.factor) : undefined;
    return shouldOfferWholesale(target, Number(l.unitPrice) || 0) ? [{ key: l.key, price: target! }] : [];
  });

  // Advisory only (see Customer.creditLimit) — mirrors the same check in
  // QuickSaleForm, just against the whole invoice total instead of one line.
  const creditKey = customer.trim().toLowerCase();
  const creditStatusForCustomer = paymentMethod === "credit" && creditKey ? customerCreditStatus.get(creditKey) : undefined;
  const creditExposure = projectCreditExposure(creditStatusForCustomer, grandTotal);
  const overLimitBy = creditExposure?.overBy ?? 0;
  const staffLimitNote = invoiceRole === "staff" && paymentMethod === "credit" ? creditLimitFor(customers, customer) : undefined;

  if (sellable.length === 0) return <div className="text-sm text-muted">Add a product or service first.</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const validLines = parsedLines.filter((l) => l.product && l.qty > 0 && l.unitPrice >= 0);
        if (validLines.length === 0) return;
        setBusy(true);
        try {
          const invoiceId = newInvoiceId();
          const termDays = paymentMethod === "credit" ? Number(creditTermDays) || settings.defaultCreditTermDays : undefined;
          // Goods lines first, then the delivery line. Each goods line is taxed at its own item's rate (the shop rate unless
          // the item sets one) and the delivery line at the shop rate, so the per-line taxAmounts add up to taxTotal, the
          // figure shown above. All lines are saved in one batch: an invoice is never left half-written.
          const entries = [
            ...validLines.map((l) => ({ amount: l.amount, goods: l as (typeof validLines)[number] | null })),
            ...(deliveryAmount > 0 && deliveryItem ? [{ amount: deliveryAmount, goods: null }] : []),
          ];
          const lineTaxes = entries.map((e) => taxFor(e.amount, e.goods?.product, settings, exemptCustomer));
          const rows = entries.map((e, i) => {
            const lineTax = lineTaxes[i];
            if (!e.goods) {
              return buildDeliverySale({
                deliveryProductId: deliveryItem!.id,
                amount: deliveryAmount,
                goods: { date, customer: customer || undefined, customerContact: customerContact || undefined, paymentMethod, creditTermDays: termDays, locationId: locationId || undefined, invoiceId, saleChannel: cleanSaleChannel(saleChannel) },
                taxAmount: lineTax,
              });
            }
            const l = e.goods;
            return {
              productId: l.productId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              date,
              customer: customer || undefined,
              customerContact: customerContact || undefined,
              notes: [notes, describePackEntry(l.qtyEntered, l.entryUnit, l.product)].filter(Boolean).join(" · ") || undefined,
              serialNo: cleanSerial(l.serialNo),
              batchPurchaseId: l.batchPurchaseId || undefined,
              saleChannel: cleanSaleChannel(saleChannel),
              paymentMethod,
              creditTermDays: termDays,
              invoiceId,
              taxAmount: lineTax > 0 ? lineTax : undefined,
              locationId: locationId || undefined,
              supplyDate: supplyDate || undefined,
            };
          });
          await addSales(rows);
          toast.success("Invoice created", `${validLines.length} item${validLines.length === 1 ? "" : "s"}${deliveryAmount > 0 ? " + delivery" : ""}, ${formatMoney(grandTotal, currency)} total`);
          if (customer.trim() && !customers.some((c) => c.name.trim().toLowerCase() === customer.trim().toLowerCase())) {
            addCustomer({ name: customer.trim(), contact: customerContact || undefined }).catch(() => {});
          }
          onDone();
        } catch (err) {
          toast.error("Couldn't save that invoice", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Customer {paymentMethod === "credit" ? "" : "(optional)"}</Label>
          <Input
            required={paymentMethod === "credit"}
            value={customer}
            list="customer-directory-multi"
            onChange={(e) => {
              const v = e.target.value;
              setCustomer(v);
              const match = customers.find((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase());
              if (match?.contact && !customerContact) setCustomerContact(match.contact);
            }}
          />
          <datalist id="customer-directory-multi">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Date of supply (only if different from the date)</Label>
          <Input type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Sold from" />
      </div>

      <div className="space-y-2">
        <Label>Items</Label>
        {lines.map((l) => {
          const parsed = parsedLines.find((x) => x.key === l.key);
          const product = sellable.find((p) => p.id === l.productId);
          const entryUnit = parsed?.entryUnit ?? resolveEntryUnit(undefined, "");
          const packUnits = product?.type === "product" ? entryUnitsFor(product) : [];
          const qty = parsed?.qty ?? 0;
          const unitPrice = parsed?.unitPrice ?? 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_70px_100px_24px] gap-2 items-end">
              <Select value={l.productId} onChange={(e) => handleProductChange(l.key, e.target.value)}>
                {sellable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.type === "service" ? "(service)" : ""}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step={sellable.find((p) => p.id === l.productId)?.allowFractionalQty ? "any" : "1"}
                placeholder="Qty"
                value={l.qty}
                onChange={(e) => updateLine(l.key, { qty: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={l.unitPrice}
                onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                disabled={lines.length === 1}
                className="text-muted hover:text-bad text-sm disabled:opacity-30"
                title="Remove line"
              >
                ✕
              </button>
              {(product?.warrantyMonths ?? 0) > 0 && (
                <div className="col-span-4 -mt-1">
                  <Input
                    aria-label="Serial number / IMEI"
                    placeholder={`Serial number / IMEI (optional, ${product?.warrantyMonths}-month warranty)`}
                    value={l.serialNo ?? ""}
                    onChange={(e) => updateLine(l.key, { serialNo: e.target.value })}
                  />
                </div>
              )}
              {packUnits.length > 1 && (
                <div className="col-span-4 -mt-1">
                  <Select aria-label="Selling in" value={l.unitId ?? ""} onChange={(e) => handleUnitChange(l.key, e.target.value)}>
                    {packUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id === "" ? `Selling by the ${u.name}` : `Selling by the ${u.name} (${u.factor} ${packUnits[0].name} each)`}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {(batchChoicesByProduct.get(l.productId) ?? []).length > 0 && (
                <div className="col-span-4 -mt-1">
                  <Select aria-label="Which batch?" value={l.batchPurchaseId ?? ""} onChange={(e) => updateLine(l.key, { batchPurchaseId: e.target.value })}>
                    <option value="">Not sure: earliest expiry first</option>
                    {(batchChoicesByProduct.get(l.productId) ?? []).map((b) => (
                      <option key={b.purchaseId} value={b.purchaseId}>
                        {b.batchRef ? `Batch ${b.batchRef}` : `Bought ${b.receivedDate}`}
                        {b.expiryDate ? ` · expires ${b.expiryDate}` : ""} · {formatNumber(b.remaining)} left
                      </option>
                    ))}
                    {l.batchPurchaseId && !(batchChoicesByProduct.get(l.productId) ?? []).some((b) => b.purchaseId === l.batchPurchaseId) && (
                      <option value={l.batchPurchaseId}>Batch picked earlier (no longer open)</option>
                    )}
                  </Select>
                </div>
              )}
              {product?.type === "product" && qty > (ledgers.get(l.productId)?.qtyOnHand ?? 0) && qty > 0 && (
                <div className="col-span-4 text-xs text-bad -mt-1">
                  Only {formatQtyWithUnit(ledgers.get(l.productId)?.qtyOnHand ?? 0, product)} of {product.name} left.
                </div>
              )}
              {qty > 0 && unitPrice >= 0 && (
                <div className="col-span-4 text-xs text-muted -mt-1 text-right">
                  {entryUnit.id !== "" && <>{formatQtyWithUnit(qty, product)} · </>}= {formatMoney(qty * unitPrice, currency)}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-xs text-amber-soft font-medium">
          + Add another item
        </button>
        {wholesaleTargets.length > 0 && (
          <div className="text-xs flex flex-wrap items-center gap-x-2">
            <span className="text-muted">{wholesaleInvoiceCustomer!.name} is a wholesale customer.</span>
            <button
              type="button"
              onClick={() => setLines((ls) => ls.map((l) => { const t = wholesaleTargets.find((x) => x.key === l.key); return t ? { ...l, unitPrice: t.price.toString() } : l; }))}
              className="text-amber-soft hover:underline"
            >
              Use wholesale prices ({wholesaleTargets.length} item{wholesaleTargets.length === 1 ? "" : "s"})
            </button>
          </div>
        )}
        {tierTargets.length > 0 && (
          <div className="text-xs flex flex-wrap items-center gap-x-2">
            <span className="text-muted">Some quantities reach a price break.</span>
            <button
              type="button"
              onClick={() => setLines((ls) => ls.map((l) => { const t = tierTargets.find((x) => x.key === l.key); return t ? { ...l, unitPrice: t.price.toString() } : l; }))}
              className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 text-amber-soft hover:underline"
            >
              Use price breaks ({tierTargets.length} item{tierTargets.length === 1 ? "" : "s"})
            </button>
          </div>
        )}
      </div>
      {deliveryItem && (
        <Field>
          <Label>Delivery charged to the customer (optional)</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="0" />
          <div className="text-xs text-muted mt-1">Added as its own line on this invoice. Leave blank for no delivery charge.</div>
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How will they pay?</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="credit">Credit — they&apos;ll pay later</option>
          </Select>
        </Field>
        {paymentMethod === "credit" ? (
          <Field>
            <Label>Days until due</Label>
            <Input required type="number" min="1" step="1" value={creditTermDays} onChange={(e) => setCreditTermDays(e.target.value)} />
          </Field>
        ) : (
          <Field>
            <Label>Phone (optional)</Label>
            <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
          </Field>
        )}
      </div>
      {paymentMethod === "credit" && (
        <Field>
          <Label>Their phone / contact (so you can chase this)</Label>
          <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
        </Field>
      )}
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <SoldThroughField value={saleChannel} onChange={setSaleChannel} />

      <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 space-y-1.5">
        <SummaryRow
          label={taxTotal > 0.005 ? "Subtotal" : paymentMethod === "credit" ? "Owed to you" : "Money coming in"}
          value={subtotal}
          currency={currency}
          muted={taxTotal > 0.005}
        />
        {deliveryAmount > 0 && <div className="text-xs text-muted">Includes {formatMoney(deliveryAmount, currency)} delivery.</div>}
        {taxTotal > 0.005 && (
          <>
            <SummaryRow label={`${taxLabel} (${taxRateText})`} value={taxTotal} currency={currency} muted />
            <SummaryRow label={paymentMethod === "credit" ? "Total owed to you" : "Total money coming in"} value={grandTotal} currency={currency} />
          </>
        )}
        {oversellLines.length > 0 && (
          <div className="text-xs text-bad pt-1">Some lines are more than you have in stock — check the items above.</div>
        )}
        {creditStatusForCustomer && creditExposure && overLimitBy > 0 && (
          <div className="text-xs text-bad pt-1">
            With this invoice {customer.trim()} would owe {formatMoney(creditExposure.projectedOutstanding, currency)} in total —{" "}
            {formatMoney(overLimitBy, currency)} over their {formatMoney(creditStatusForCustomer.creditLimit, currency)} credit limit.
            Just a heads-up, nothing&apos;s blocked.
          </div>
        )}
        {staffLimitNote !== undefined && (
          <div className="text-xs text-amber-soft pt-1">
            {customer.trim()} has a credit limit of {formatMoney(staffLimitNote, currency)}. You can&apos;t see what they already owe, so
            check with a manager before giving them more on credit.
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || total <= 0}>
          {busy ? "Saving…" : "Create invoice"}
        </Button>
      </div>
    </form>
  );
}

// Sets up a billing schedule for a repeat-billing customer (a retainer, a
// monthly service contract) instead of a one-off invoice. Reuses the exact
// same line-item shape as MultiItemInvoiceForm above — this form only
// saves the template + recurrence; DataContext generates a real invoice
// (real Sales, shared invoiceId, credit terms, receivables aging, the
// works) automatically each time the schedule comes due. See
// generateInvoiceForSchedule in contexts/DataContext.tsx.
export function RecurringInvoiceForm({ onDone }: { onDone: () => void }) {
  const { products, addRecurringInvoice, settings, customers, addCustomer, customerCreditStatus, locations } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const sellable = useMemo(() => products.filter((p) => p.active), [products]);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([newLineDraft(sellable[0]?.id ?? "")]);
  const [customer, setCustomer] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [recurrence, setRecurrence] = useState<Exclude<Recurrence, "none">>("monthly");
  const [startDate, setStartDate] = useState(todayIso());
  const [creditTermDays, setCreditTermDays] = useState(settings.defaultCreditTermDays.toString());
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);

  function updateLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLineDraft(sellable[0]?.id ?? "")]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }
  function handleProductChange(key: string, productId: string) {
    const p = sellable.find((pr) => pr.id === productId);
    updateLine(key, { productId, unitPrice: p?.defaultSellPrice?.toString() ?? "" });
  }

  const parsedLines = lines.map((l) => {
    const product = sellable.find((p) => p.id === l.productId);
    const qty = Number(l.qty) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    return { ...l, product, qty, unitPrice, amount: qty * unitPrice };
  });
  const total = parsedLines.reduce((sum, l) => sum + l.amount, 0);

  // Advisory only (see Customer.creditLimit) — mirrors QuickSaleForm/
  // MultiItemInvoiceForm's check. Every recurring invoice is a credit sale
  // (it has a due date, no payment-method choice), and unlike those two
  // forms this one recurs unattended after setup — so this is the one
  // moment a person reviews the exposure before it starts compounding
  // automatically each cycle.
  const creditStatusForCustomer = customer.trim() ? customerCreditStatus.get(customer.trim().toLowerCase()) : undefined;
  const creditExposure = projectCreditExposure(creditStatusForCustomer, total);
  const overLimitBy = creditExposure?.overBy ?? 0;

  if (sellable.length === 0) return <div className="text-sm text-muted">Add a product or service first.</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const validLines = parsedLines.filter((l) => l.product && l.qty > 0 && l.unitPrice >= 0);
        if (validLines.length === 0 || !customer.trim()) return;
        setBusy(true);
        try {
          await addRecurringInvoice({
            customer: customer.trim(),
            customerContact: customerContact || undefined,
            lines: validLines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
            recurrence,
            startDate,
            creditTermDays: Number(creditTermDays) || settings.defaultCreditTermDays,
            notes: notes || undefined,
            active: true,
            nextDueDate: startDate,
            locationId: locationId || undefined,
          });
          toast.success(
            "Recurring invoice scheduled",
            `${formatMoney(total, currency)} ${recurrence}, starting ${startDate}`
          );
          if (!customers.some((c) => c.name.trim().toLowerCase() === customer.trim().toLowerCase())) {
            addCustomer({ name: customer.trim(), contact: customerContact || undefined }).catch(() => {});
          }
          onDone();
        } catch (err) {
          toast.error("Couldn't save that schedule", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Customer</Label>
          <Input
            required
            value={customer}
            list="customer-directory-recurring"
            onChange={(e) => {
              const v = e.target.value;
              setCustomer(v);
              const match = customers.find((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase());
              if (match?.contact && !customerContact) setCustomerContact(match.contact);
            }}
          />
          <datalist id="customer-directory-recurring">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field>
          <Label>Their phone / contact (optional)</Label>
          <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        <Label>Items billed each cycle</Label>
        {lines.map((l) => {
          const qty = Number(l.qty) || 0;
          const unitPrice = Number(l.unitPrice) || 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_70px_100px_24px] gap-2 items-end">
              <Select value={l.productId} onChange={(e) => handleProductChange(l.key, e.target.value)}>
                {sellable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.type === "service" ? "(service)" : ""}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step={sellable.find((p) => p.id === l.productId)?.allowFractionalQty ? "any" : "1"}
                placeholder="Qty"
                value={l.qty}
                onChange={(e) => updateLine(l.key, { qty: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={l.unitPrice}
                onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                disabled={lines.length === 1}
                className="text-muted hover:text-bad text-sm disabled:opacity-30"
                title="Remove line"
              >
                ✕
              </button>
              {qty > 0 && unitPrice >= 0 && (
                <div className="col-span-4 text-xs text-muted -mt-1 text-right">
                  = {formatMoney(qty * unitPrice, currency)}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-xs text-amber-soft font-medium">
          + Add another item
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Bill every</Label>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Exclude<Recurrence, "none">)}>
            <option value="weekly">Week</option>
            <option value="monthly">Month</option>
            <option value="yearly">Year</option>
          </Select>
        </Field>
        <Field>
          <Label>First invoice on</Label>
          <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Days until each invoice is due</Label>
          <Input required type="number" min="1" step="1" value={creditTermDays} onChange={(e) => setCreditTermDays(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Sold from" />
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 space-y-1.5">
        <SummaryRow label={`Per ${recurrence === "weekly" ? "week" : recurrence === "yearly" ? "year" : "month"}`} value={total} currency={currency} />
        <div className="text-xs text-muted pt-0.5">
          An invoice for {formatMoney(total, currency)} is created automatically on {startDate || "the start date"}, and every {recurrence.replace("ly", "")} after that until you pause or delete this schedule.
        </div>
      </div>

      {creditStatusForCustomer && creditExposure && overLimitBy > 0 && (
        <div className="text-xs text-bad pt-1">
          With the first invoice on this schedule {customer.trim()} would owe {formatMoney(creditExposure.projectedOutstanding, currency)}{" "}
          in total — {formatMoney(overLimitBy, currency)} over their {formatMoney(creditStatusForCustomer.creditLimit, currency)} credit
          limit. Nothing&apos;s blocked, but each cycle after that bills again automatically.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || total <= 0 || !customer.trim()}>
          {busy ? "Saving…" : "Create schedule"}
        </Button>
      </div>
    </form>
  );
}

export interface QuickStockInitial {
  productId?: string;
  qty?: number;
  unitCost?: number;
  // See QuickSaleInitial.currency's doc comment — same rule, purchase side.
  currency?: string;
  date?: string;
  supplier?: string;
  notes?: string;
  // Purchase-side mirror of QuickSaleInitial.paymentMethod — lets an AI
  // proposal that read "on 30-day terms" arrive at the review form still
  // marked as a credit purchase instead of silently becoming cash.
  paymentMethod?: PaymentMethod;
}

export function QuickStockForm({
  fixedProduct,
  initial,
  onDone,
}: {
  fixedProduct?: Product;
  initial?: QuickStockInitial;
  onDone: () => void;
}) {
  const { products, addPurchase, settings, projects, locations } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const restockable = useMemo(() => products.filter((p) => p.active && p.type === "product"), [products]);

  const [productId, setProductId] = useState(fixedProduct?.id ?? initial?.productId ?? restockable[0]?.id ?? "");
  const product = fixedProduct ?? products.find((p) => p.id === productId);
  const [qty, setQty] = useState(initial?.qty?.toString() ?? "");
  const [unitCost, setUnitCost] = useState(initial?.unitCost?.toString() ?? product?.defaultCostPrice?.toString() ?? "");
  const [txCurrency, setTxCurrency] = useState(initial?.currency ?? currency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const referenceRate = useReferenceRate(txCurrency, currency);
  useFillReferenceRate({ currency: txCurrency, base: currency, rate: exchangeRate, setRate: setExchangeRate, reference: referenceRate });
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [projectId, setProjectId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "cash");
  const [creditTermDays, setCreditTermDays] = useState(settings.defaultCreditTermDays.toString());
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Buying in packs (a carton of 12): qty and price are entered per pack, then converted to base units before
  // anything is saved or calculated — see lib/units.ts. "" = the base unit, i.e. nothing changes.
  const [entryUnitId, setEntryUnitId] = useState("");
  // One optional total for delivery / freight / import costs on this buy; the full Purchase form splits it three ways.
  const [deliveryCost, setDeliveryCost] = useState("");

  function applyScan(data: { text: string; extracted: any }) {
    const { extracted } = data;
    if (extracted?.vendor) setSupplier(extracted.vendor);
    if (extracted?.date) {
      // Timezone-free, day-first parse (lib/receiptDate.ts); leaves the date alone if it isn't a real date.
      const iso = parseReceiptDate(extracted.date);
      if (iso) setDate(iso);
    }
    // Deliberately NOT auto-filling unitCost: the OCR'd amount is the
    // invoice total, and unitCost = total / qty needs a quantity we can't
    // reliably read off a receipt. Guessing that division would silently
    // produce a wrong cost basis whenever qty isn't 1. Surface it as a note
    // instead so the user can do the division themselves with the number
    // in front of them.
    if (typeof extracted?.amount === "number") {
      const hint = `Receipt total: ${formatMoney(extracted.amount, txCurrency)}`;
      setNotes((prev) => (prev ? `${prev} — ${hint}` : hint));
    }
    toast.success("Receipt scanned", "Check supplier/date, and work out the per-unit cost from the total noted below.");
  }

  const entryUnit = resolveEntryUnit(product, entryUnitId);
  const factor = entryUnit.factor;
  const unitText = baseUnitLabel(product) || "unit";
  const costNum = Number(unitCost) || 0; // entered cost, in txCurrency, per ENTRY unit (a pack, or one piece)
  const costPerBaseNum = toBaseUnitAmount(costNum, factor); // in txCurrency, per base unit
  const qtyBase = toBaseQty(Number(qty) || 0, factor);
  const rateNum = txCurrency === currency ? 1 : Number(exchangeRate) || 0;
  const goodsBaseCostNum = convertToBase(costPerBaseNum, rateNum); // base-currency price per base unit, goods only
  const deliveryNum = Math.max(Number(deliveryCost) || 0, 0); // base currency, total for this delivery
  const baseCostNum = landedUnitCost(goodsBaseCostNum, qtyBase, 0, 0, deliveryNum); // all-in per base unit — what everything downstream uses
  const subtotal = qtyBase * goodsBaseCostNum; // the supplier's charge; input tax is worked out on this alone
  // Input tax (VAT/GST) on what you paid — mirrors the Sale-side
  // computation in QuickSaleForm above: off unless Settings.salesTaxEnabled,
  // computed on the untaxed cost, snapshotted onto Purchase.taxAmount at
  // submit. One flat rate assumed on both sides — see the taxAmount doc
  // comment on Purchase in lib/types.ts.
  const taxAmount = taxFor(subtotal, product, settings); // the item's own rate if it has one, else the shop rate
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const total = subtotal + deliveryNum + taxAmount; // delivery counts in what you paid / owe, same as on the full Purchase form

  function handleProductChange(id: string) {
    setProductId(id);
    setEntryUnitId("");
    const p = products.find((pr) => pr.id === id);
    if (p?.defaultCostPrice !== undefined) setUnitCost(p.defaultCostPrice.toString());
  }
  // Switching between pieces and a pack: carry the usual price across (default x pack size) unless the person typed their own.
  function handleEntryUnitChange(id: string) {
    const next = resolveEntryUnit(product, id);
    const d = product?.defaultCostPrice;
    if (d !== undefined && (unitCost === "" || Math.abs(costNum - d * factor) < 0.005)) setUnitCost((Math.round(d * next.factor * 100) / 100).toString());
    setEntryUnitId(id);
  }

  if (!product) return <div className="text-sm text-muted">Add something to sell first — services don&apos;t have stock.</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const packNote = describePackEntry(Number(qty), entryUnit, product);
          await addPurchase({
            productId,
            qty: qtyBase,
            unitCost: baseCostNum,
            ...(deliveryNum > 0 ? { goodsUnitCost: goodsBaseCostNum, freightCost: 0, customsCost: 0, otherLandedCost: deliveryNum } : {}),
            currency: txCurrency !== currency ? txCurrency : undefined,
            exchangeRate: txCurrency !== currency ? rateNum : undefined,
            foreignUnitCost: txCurrency !== currency ? costPerBaseNum : undefined,
            date,
            supplier: supplier || undefined,
            notes: [notes, packNote].filter(Boolean).join(" · ") || undefined,
            projectId: projectId || undefined,
            taxAmount: taxAmount > 0 ? taxAmount : undefined,
            paymentMethod,
            creditTermDays:
              paymentMethod === "credit" ? Number(creditTermDays) || settings.defaultCreditTermDays : undefined,
            locationId: locationId || undefined,
          });
          toast.success("Added to your stock", `${product.name}: +${formatNumber(qtyBase)}${baseUnitLabel(product) ? " " + baseUnitLabel(product) : ""} at ${formatMoney(baseCostNum, currency)} each`);
          onDone();
        } catch (err) {
          toast.error("Couldn't add that stock", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <OcrScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={applyScan}
        title="Scan Supplier Invoice"
        hint="Runs on your device — free, and the photo never leaves it."
      />
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-line hover:border-amber-dim hover:bg-panel2 transition-colors py-2.5 text-sm font-medium text-muted hover:text-fg"
      >
        📷 Scan an invoice to fill this in
      </button>
      {!fixedProduct && (
        <Field>
          <Label>What are you buying?</Label>
          <Select required value={productId} onChange={(e) => handleProductChange(e.target.value)}>
            {restockable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <PackUnitSelect product={product} value={entryUnitId} onChange={handleEntryUnitChange} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>{entryUnit.id === "" ? "How many did you buy?" : `How many ${entryUnit.name}s did you buy?`}</Label>
          <Input required autoFocus={!!fixedProduct} type="number" inputMode="decimal" min="0" step={product.allowFractionalQty ? "any" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>{entryUnit.id === "" ? "Price you paid for each one" : `Price you paid per ${entryUnit.name}`}</Label>
          <Input required type="number" inputMode="decimal" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
      </div>
      {entryUnit.id !== "" && qtyBase > 0 && costNum > 0 && (
        <div className="text-xs text-muted -mt-2" aria-live="polite">
          = {formatNumber(qtyBase)} {unitText} in stock, at {formatMoney(baseCostNum, currency)} per {unitText}
        </div>
      )}
      <CurrencyRateFields
        baseCurrency={currency}
        currency={txCurrency}
        onCurrencyChange={setTxCurrency}
        exchangeRate={exchangeRate}
        onExchangeRateChange={setExchangeRate}
        reference={referenceRate}
      />
      {txCurrency !== currency && costNum > 0 && rateNum > 0 && (
        <div className="text-xs text-muted -mt-2">= {formatMoney(goodsBaseCostNum, currency)} per {entryUnit.id === "" ? "unit" : unitText} at this rate</div>
      )}
      <Field>
        <Label>Delivery / freight / import costs (optional)</Label>
        <Input type="number" inputMode="decimal" min="0" step="0.01" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} placeholder={`Total for this delivery, in ${currency}`} />
        {deliveryNum > 0 && qtyBase > 0 && (
          <div className="text-[11px] text-muted mt-1" aria-live="polite">
            Adds {formatMoney(deliveryNum / qtyBase, currency)} to each, so it costs you {formatMoney(baseCostNum, currency)} all-in.
          </div>
        )}
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Received into" />
        <Field>
          <Label>Supplier (optional)</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
      </div>
      {/* See the same selector on app/purchases/page.tsx's PurchaseForm for
          why this had to exist before supplier payables could ever hold a
          row. Kept on this form too so the quick "I bought stock" path and
          the AI review form aren't a back door that silently downgrades a
          credit purchase to cash. */}
      <Field>
        <Label>How did you pay?</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="credit">On credit — you&apos;ll pay the supplier later</option>
        </Select>
      </Field>
      {paymentMethod === "credit" && (
        <Field>
          <Label>Pay within (days)</Label>
          <Input
            required
            type="number"
            min="1"
            step="1"
            value={creditTermDays}
            onChange={(e) => setCreditTermDays(e.target.value)}
          />
        </Field>
      )}
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {projects.length > 0 && (
        <Field>
          <Label>Project (optional)</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— not part of a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 space-y-1">
        {taxAmount > 0.005 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Subtotal</span>
            <span className="num text-xs text-muted">{formatMoney(subtotal, currency)}</span>
          </div>
        )}
        {taxAmount > 0.005 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{taxLabel} ({taxRatePctFor(product, settings)}%) — reclaimable</span>
            <span className="num text-xs text-muted">{formatMoney(taxAmount, currency)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{paymentMethod === "credit" ? "Total you owe the supplier" : "Total you paid"}</span>
          <span className="num text-sm font-medium">{formatMoney(total, currency)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !productId}>
          {busy ? "Saving…" : "Buy"}
        </Button>
      </div>
    </form>
  );
}

// Fast path for the dashboard: the common case (a recurring monthly cost)
// in the fewest fields. The Expenses page keeps the full form (one-off vs.
// recurring, revenue vs. expense, end dates) for anyone who needs it.
export interface QuickExpenseInitial {
  name?: string;
  amount?: number;
  category?: string;
  isRecurring?: boolean;
  date?: string;
}

export function QuickExpenseForm({ initial, onDone }: { initial?: QuickExpenseInitial; onDone: () => void }) {
  const { addExpense, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Best-effort match of the OCR'd vendor/description line against the
  // fixed category list — a receipt will never spell a category exactly,
  // so this only fires on a clear substring hit and otherwise leaves the
  // field for the user to pick, rather than guessing wrong silently.
  function matchCategory(text: string): string {
    const lower = text.toLowerCase();
    return EXPENSE_CATEGORIES.find((c) => lower.includes(c.toLowerCase())) ?? suggestExpenseCategory(text) ?? "";
  }

  // Automatic: once a name is typed, an empty category is filled with the suggestion. A category already chosen is never changed.
  useEffect(() => {
    if (!category && name.trim()) {
      const suggested = suggestExpenseCategory(name);
      if (suggested) setCategory(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  function applyScan(data: { text: string; extracted: any }) {
    const { extracted } = data;
    if (extracted?.vendor) setName(extracted.vendor);
    if (typeof extracted?.amount === "number") setAmount(String(extracted.amount));
    if (extracted?.date) {
      // Timezone-free, day-first parse (lib/receiptDate.ts); leaves the date alone if it isn't a real date.
      const iso = parseReceiptDate(extracted.date);
      if (iso) setDate(iso);
    }
    const guessedCategory = matchCategory(`${extracted?.vendor ?? ""} ${data.text}`);
    if (guessedCategory) setCategory(guessedCategory);
    toast.success("Receipt scanned", "Check the fields below before saving — OCR isn't always perfect.");
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addExpense({
            name,
            amount: Number(amount),
            category,
            kind: "expense",
            isRecurring,
            recurrence: isRecurring ? "monthly" : "none",
            startDate: date,
          });
          toast.success("Expense added", `${name}: ${formatMoney(Number(amount), currency)}${isRecurring ? " / month" : ""}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't add expense", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <OcrScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={applyScan}
        title="Scan Bill/Receipt"
        hint="Runs on your device — free, and the photo never leaves it."
      />
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-line hover:border-amber-dim hover:bg-panel2 transition-colors py-2.5 text-sm font-medium text-muted hover:text-fg"
      >
        📷 Scan a receipt to fill this in
      </button>
      <Field>
        <Label>What is it?</Label>
        <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse rent" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Amount</Label>
          <Input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">— none —</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field>
        <Label>Date</Label>
        <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="accent-amber" />
        Repeats every month (uncheck for a one-off cost)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add expense"}
        </Button>
      </div>
    </form>
  );
}
