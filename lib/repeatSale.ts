// Sell again: the details of one past sale, ready to put on a new sale form. Only what a repeat order needs is carried over
// (what, how many, at what price, to whom, how they pay). The date is today, and the notes, serial number, project and
// invoice are not copied, because they belong to the old sale. A delivery line on its own is not repeated: it only makes
// sense on the goods it travelled with.
export interface RepeatableSale {
  productId: string;
  qty: number;
  unitPrice: number;
  customer?: string;
  paymentMethod?: "cash" | "card" | "bank_transfer" | "credit";
  currency?: string;
  foreignUnitPrice?: number;
  isDelivery?: boolean;
}

export interface RepeatInitial {
  productId: string;
  qty: number;
  unitPrice: number;
  currency?: string;
  customer?: string;
  paymentMethod: "cash" | "card" | "bank_transfer" | "credit";
}

export function repeatSaleInitial(s: RepeatableSale): RepeatInitial | null {
  if (s.isDelivery) return null;
  const foreign = !!s.currency && s.foreignUnitPrice !== undefined;
  return {
    productId: s.productId,
    qty: s.qty,
    unitPrice: foreign ? (s.foreignUnitPrice as number) : s.unitPrice,
    currency: foreign ? s.currency : undefined,
    customer: s.customer || undefined,
    paymentMethod: s.paymentMethod ?? "cash",
  };
}
