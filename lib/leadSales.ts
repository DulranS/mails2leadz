// A Won lead becomes one sale when the owner records it (DataContext recordLeadSale, one transaction). Nothing posts before that,
// and the lead's estimated value never counts as revenue on its own (see lib/pipelineValue.ts).
//
// Limits, all stated in the manual: one sale per lead; the lead must be Won; a Won lead cannot be moved to another stage once it
// has a sale; a lead with a sale cannot be deleted; the sale is for one unit at the price charged, paid in full (cash, card or bank
// transfer; credit goes on the Sales page), dated today, and the channel is the lead's source unless changed.
import type { Lead, PaymentMethod, Sale } from "./types";
import { cleanSaleChannel } from "./salesChannels";

export const LEAD_SALE_PAYMENTS: { value: Exclude<PaymentMethod, "credit">; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

// Why this lead cannot be recorded as a sale now, or null when it can.
export function leadSaleProblem(l: Pick<Lead, "stage" | "saleId">): string | null {
  if (l.saleId) return "A sale is already recorded for this lead.";
  if (l.stage !== "won") return "Mark the lead Won first. A sale is recorded once the deal is won.";
  return null;
}

// A Won lead keeps its Won stage while it has a sale.
export function leadStageProblem(current: Pick<Lead, "saleId">, next: string | undefined): string | null {
  if (current.saleId && next !== undefined && next !== "won") return "This lead has a sale recorded, so it stays Won.";
  return null;
}

export function leadDeleteProblem(l: Pick<Lead, "saleId">): string | null {
  return l.saleId ? "This lead has a sale recorded, so it can't be deleted. Its sale stays in the books." : null;
}

// Products a deal can be recorded against: active products and services, by name.
export function leadSaleOfferings<T extends { active: boolean; name: string }>(products: T[]): T[] {
  return products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
}

// The price to start from: the deal's estimated value when set, else the product's default selling price.
export function leadSaleDefaultPrice(estValue: number | undefined, defaultSellPrice: number | undefined): number | undefined {
  if (typeof estValue === "number" && estValue > 0) return estValue;
  return defaultSellPrice;
}

export function leadSaleDraftFor(
  l: Lead,
  productId: string,
  unitPrice: number,
  paymentMethod: Exclude<PaymentMethod, "credit">,
  date: string,
  saleChannel?: string,
): Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> {
  const draft: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName"> = {
    productId,
    qty: 1,
    unitPrice: Math.round(unitPrice * 100) / 100,
    date,
    customer: l.name,
    paymentMethod,
    notes: "From a won lead.",
  };
  if (l.contact) draft.customerContact = l.contact;
  const channel = cleanSaleChannel(saleChannel ?? l.source);
  if (channel) draft.saleChannel = channel;
  return draft;
}
