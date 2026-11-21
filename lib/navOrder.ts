// Screen order (v247): the order the sidebar and the screen finder show screens in. Groups follow GROUP_ORDER; within a group, screens follow the
// list below, from the most used to the least. A screen not listed comes last in its group, by name, so a new screen is never lost.
export const GROUP_ORDER = ["Overview", "Buy & sell", "Money", "Team", "Admin"] as const;

// Order: the screens used every day first, then the ones that create and keep revenue, then the ones used to decide. Within "Buy & sell", selling and keeping
// customers come before buying and stocking. Within "Money", money in and money out come before reporting. Within "Team", the rota and the time come before
// the longer-term people records.
export const NAV_ORDER: Record<string, string[]> = {
  Overview: ["/dashboard", "/agenda", "/notifications", "/opportunities", "/assistant"],
  "Buy & sell": [
    "/leads", "/estimates", "/customers", "/support", "/feedback", "/sales", "/bookings", "/jobs", "/projects",
    "/products", "/offers", "/memberships", "/events", "/tabs", "/kitchen", "/gift-cards", "/farm", "/consignment", "/electronics", "/rentals",
    "/outreach", "/price-control", "/purchases", "/purchase-orders", "/suppliers", "/shipments", "/locations",
  ],
  Money: [
    "/invoices", "/collections", "/expenses", "/receivables-payables", "/cash-count", "/cash-flow", "/cheques", "/reconciliation", "/loans",
    "/lending", "/investments", "/assets", "/mileage", "/profitability", "/statements", "/health", "/models", "/accounting-journal", "/routines", "/accountant-pack",
  ],
  Team: ["/rota", "/time", "/tasks", "/operations", "/employees", "/playbook", "/team"],
  Admin: ["/settings", "/integrations", "/import-export", "/activity", "/journal"],
};

// The screens in the order they should show: by group, then by the list above, then by name for any not listed.
export function orderNav<T extends { href: string; label: string; group: string }>(items: T[]): T[] {
  const groupRank = (g: string) => {
    const i = (GROUP_ORDER as readonly string[]).indexOf(g);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  const itemRank = (item: T) => {
    const list = NAV_ORDER[item.group] ?? [];
    const i = list.indexOf(item.href);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...items].sort((a, b) =>
    groupRank(a.group) - groupRank(b.group) ||
    itemRank(a) - itemRank(b) ||
    a.label.localeCompare(b.label)
  );
}

// Niche screens that do not fit some types of business are kept out of the sidebar for those types (for example the kitchen for a consultancy).
// "Show every screen" in Starter setup turns this off. Screens not listed here are shown to every type.
export const NAV_NOT_FOR_KIND: Record<string, string[]> = {
  services: ["/kitchen", "/tabs", "/farm", "/consignment", "/electronics"],
  consultancy: ["/kitchen", "/tabs", "/farm", "/consignment", "/electronics", "/gift-cards"],
  membership: ["/kitchen", "/tabs", "/farm", "/consignment", "/electronics"],
  rental: ["/kitchen", "/tabs", "/farm", "/consignment"],
  trades: ["/kitchen", "/tabs", "/farm", "/consignment", "/rentals", "/gift-cards"],
  retail: ["/kitchen", "/tabs", "/farm"],
  wholesale: ["/kitchen", "/tabs", "/farm"],
  manufacturing: ["/kitchen", "/tabs", "/gift-cards"],
  food: ["/farm", "/consignment", "/electronics"],
  healthcare: ["/kitchen", "/tabs", "/farm", "/consignment", "/electronics", "/gift-cards", "/rentals"],
  venue: ["/farm", "/consignment", "/electronics"],
};
export function visibleForKind<T extends { href: string }>(items: T[], kind: string | undefined, showAll: boolean | undefined): T[] {
  if (showAll || !kind) return items;
  const hidden = NAV_NOT_FOR_KIND[kind] ?? [];
  return items.filter((i) => !hidden.includes(i.href));
}
