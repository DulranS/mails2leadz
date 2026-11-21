// Delivery charged to the customer, as a real line on the sale.
//
// A delivery charge is income for a service you provide (getting the goods to the customer), so it is booked exactly
// that way: one extra Sale of a service item ("Delivery charge", quantity 1) sharing the goods' invoiceId, date,
// customer, payment method and credit terms. Nothing in the engine had to learn a new concept: it is revenue with no
// cost of goods, it is taxed like any other line when sales tax is on, it appears on the same invoice, and a credit
// sale's receivable covers goods and delivery together. What the delivery costs YOU stays a separate decision
// (Products -> variable costs on the delivery item), so profit is never quietly overstated or understated here.
//
// Pure functions, no I/O (see scripts/verify-delivery.ts).
import type { Sale, Settings } from "./types";
import { convertToBase } from "./fx";

export const DELIVERY_ITEM_NAME = "Delivery charge";

export type NewSaleValues = Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName">;

interface ItemLike {
  id: string;
  type: string;
  active: boolean;
}

// The item delivery is booked against, or null when the feature is off or the item has since been deleted,
// switched off or turned into something other than a service (then the sale forms simply show no delivery box).
export function resolveDeliveryItem(settings: Pick<Settings, "deliveryProductId">, items: readonly ItemLike[]): ItemLike | null {
  const id = settings.deliveryProductId;
  if (!id) return null;
  const hit = items.find((i) => i.id === id);
  return hit && hit.active && hit.type === "service" ? hit : null;
}

// What the person typed for delivery, as a clean amount: blank, negative or unreadable is no delivery at all.
export function parseDeliveryAmount(raw: string | number | undefined | null): number {
  const n = typeof raw === "number" ? raw : Number((raw ?? "").toString().trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Sales tax on a delivery amount (base currency), same flat rate as every other line. 0 when sales tax is off.
export function deliveryTaxFor(amountBase: number, settings: Pick<Settings, "salesTaxEnabled" | "salesTaxRatePct">, exempt = false): number {
  if (exempt || !settings.salesTaxEnabled || !(amountBase > 0)) return 0;
  return amountBase * ((settings.salesTaxRatePct ?? 0) / 100);
}

// The delivery Sale. `goods` supplies everything a delivery line must share with the goods it travels with, so the
// two can never disagree about who owes what, or when.
export function buildDeliverySale(args: {
  deliveryProductId: string;
  amount: number; // as typed, in `currency`
  currency?: string; // the sale's currency when it is not the business's own
  exchangeRate?: number;
  goods: Pick<NewSaleValues, "date" | "customer" | "customerContact" | "paymentMethod" | "creditTermDays" | "projectId" | "locationId" | "invoiceId" | "saleChannel">;
  taxAmount: number; // base currency, from deliveryTaxFor
}): NewSaleValues {
  const foreign = !!args.currency;
  const rate = foreign ? args.exchangeRate ?? 0 : 1;
  const base = convertToBase(args.amount, rate);
  const g = args.goods;
  return {
    productId: args.deliveryProductId,
    qty: 1,
    unitPrice: base,
    currency: foreign ? args.currency : undefined,
    exchangeRate: foreign ? rate : undefined,
    foreignUnitPrice: foreign ? args.amount : undefined,
    date: g.date,
    customer: g.customer,
    customerContact: g.customerContact,
    notes: "Delivery",
    isDelivery: true,
    paymentMethod: g.paymentMethod,
    creditTermDays: g.creditTermDays,
    projectId: g.projectId,
    locationId: g.locationId,
    invoiceId: g.invoiceId,
    ...(g.saleChannel ? { saleChannel: g.saleChannel } : {}), // Firestore refuses undefined, so only when set
    taxAmount: args.taxAmount > 0 ? args.taxAmount : undefined,
  };
}

// A fresh id for a sale that now has more than one line, in the same shape the multi-item invoice form makes.
export function newInvoiceId(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Splits an invoice's sales tax across its lines in proportion to each line's amount, the last line absorbing the
// rounding remainder so the pieces always add up to `taxTotal` exactly. Used by the multi-item invoice form for the
// goods lines and the delivery line alike.
export function allocateLineTax(amounts: number[], taxTotal: number): number[] {
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return amounts.map((amount, i) => {
    const isLast = i === amounts.length - 1;
    const share = isLast ? taxTotal - allocated : subtotal > 0 ? (amount / subtotal) * taxTotal : 0;
    allocated += share;
    return share;
  });
}
