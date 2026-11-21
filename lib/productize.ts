// Productizing (v240b): turning what a business does into an offer people can buy at a set price. Three helpers: starting templates for the common
// shapes (a single service, a package of sessions, a monthly retainer, a product bundle), a price worked back from what an offer costs to deliver
// and the margin the business wants, and the margin a chosen price leaves. Pure. The price is a suggestion; the owner sets the price.

export interface OfferTemplate { key: string; label: string; name: string; category: string; capacityPerDelivery?: number; capacityUnit?: string; costLabels: string[]; hint: string }

export const OFFER_TEMPLATES: OfferTemplate[] = [
  { key: "service", label: "A single service", name: "Service", category: "Services", costLabels: ["My time", "Materials used"], hint: "One job, priced per delivery." },
  { key: "sessions", label: "A package of sessions", name: "Package of 10 sessions", category: "Services", capacityPerDelivery: 10, capacityUnit: "sessions", costLabels: ["Staff time per session", "Materials per session"], hint: "Sold once, used up session by session. Set the number of sessions." },
  { key: "retainer", label: "A monthly retainer", name: "Monthly retainer", category: "Services", capacityPerDelivery: 1, capacityUnit: "month", costLabels: ["Staff time for the month", "Tools for the month"], hint: "A fixed fee each month for ongoing work." },
  { key: "bundle", label: "A product bundle", name: "Bundle", category: "Products", costLabels: ["Item 1", "Item 2", "Packaging"], hint: "Several items sold together at one price." },
];

// The price that leaves the wanted margin on what the offer costs to deliver: price = cost / (1 - margin). Null when the margin is 100% or more.
export function suggestPrice(costPerDelivery: number, targetMarginPct: number): number | null {
  if (!(costPerDelivery >= 0) || !(targetMarginPct >= 0) || targetMarginPct >= 100) return null;
  return Math.round((costPerDelivery / (1 - targetMarginPct / 100)) * 100) / 100;
}

// What a chosen price leaves after the cost of delivering it.
export function offerMargin(price: number, cost: number) {
  const profit = Math.round((price - cost) * 100) / 100;
  const marginPct = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return { profit, marginPct };
}
