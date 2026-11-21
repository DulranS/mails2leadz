// Tailor the menu: hide the pages a business does not use, so the first week is not 43 menu items.
//
// Purely cosmetic and always reversible: a hidden page is only left out of the side menu and the "More" sheet. It still works,
// every link into it still works, and "Jump to" (Ctrl or Cmd + K) still finds it. No data, permission or figure changes, and
// who may open a page is still decided by role, never by this list. The owner sets it once for everyone under Settings > Menu.
//
// Pages that can never be hidden: Home, the Assistant, Notifications, Settings, Team access and the pages on the phone's bottom
// bar (so nobody is locked out of the basics or of the way back). The page you are on is never hidden while you are on it.
// A list saved with a page that no longer exists, or a page that cannot be hidden, is quietly cleaned.
export interface HidablePage {
  href: string;
  label: string;
  group: "Overview" | "Buy & sell" | "Money" | "Team" | "Admin";
}

// The same labels and groups as the menu (components/AppShell.tsx); scripts/verify-nav-prefs.ts keeps them identical.
export const HIDABLE_PAGES: HidablePage[] = [
  { href: "/leads", label: "Leads", group: "Buy & sell" },
  { href: "/products", label: "Items", group: "Buy & sell" },
  { href: "/purchase-orders", label: "Orders", group: "Buy & sell" },
  { href: "/estimates", label: "Estimates", group: "Buy & sell" },
  { href: "/customers", label: "Customers", group: "Buy & sell" },
  { href: "/support", label: "Support", group: "Buy & sell" },
  { href: "/feedback", label: "Feedback", group: "Buy & sell" },
  { href: "/bookings", label: "Bookings", group: "Buy & sell" },
  { href: "/events", label: "Events", group: "Buy & sell" },
  { href: "/shipments", label: "Shipments", group: "Buy & sell" },
  { href: "/rentals", label: "Rentals", group: "Buy & sell" },
  { href: "/consignment", label: "Consignment", group: "Buy & sell" },
  { href: "/electronics", label: "Licences & trade-ins", group: "Buy & sell" },
  { href: "/price-control", label: "Price & condition", group: "Buy & sell" },
  { href: "/jobs", label: "Jobs (short work orders)", group: "Buy & sell" },
  { href: "/outreach", label: "Outreach", group: "Buy & sell" },
  { href: "/gift-cards", label: "Gift cards", group: "Buy & sell" },
  { href: "/tabs", label: "Tabs", group: "Buy & sell" },
  { href: "/kitchen", label: "Kitchen", group: "Buy & sell" },
  { href: "/agenda", label: "Agenda", group: "Overview" },
  { href: "/suppliers", label: "Suppliers", group: "Buy & sell" },
  { href: "/locations", label: "Locations", group: "Buy & sell" },
  { href: "/projects", label: "Projects (longer client work)", group: "Buy & sell" },
  { href: "/offers", label: "Offers", group: "Buy & sell" },
  { href: "/routines", label: "Routines", group: "Money" },
  { href: "/accountant-pack", label: "Accountant pack", group: "Money" },
  { href: "/cash-flow", label: "Cash flow", group: "Money" },
  { href: "/collections", label: "Collections", group: "Money" },
  { href: "/cheques", label: "Cheques", group: "Money" },
  { href: "/mileage", label: "Mileage", group: "Money" },
  { href: "/farm", label: "Farm batches", group: "Buy & sell" },
  { href: "/memberships", label: "Memberships", group: "Buy & sell" },
  { href: "/invoices", label: "Invoices", group: "Money" },
  { href: "/expenses", label: "Bills", group: "Money" },
  { href: "/loans", label: "Loans & credit (borrowed)", group: "Money" },
  { href: "/reconciliation", label: "Reconcile", group: "Money" },
  { href: "/assets", label: "Fixed assets", group: "Money" },
  { href: "/investments", label: "Investments", group: "Money" },
  { href: "/lending", label: "Credit given (lent out)", group: "Money" },
  { href: "/health", label: "Financial health", group: "Money" },
  { href: "/models", label: "Models", group: "Money" },
  { href: "/accounting-journal", label: "Double-entry journal", group: "Money" },
  { href: "/playbook", label: "Playbook", group: "Team" },
  { href: "/operations", label: "Operations", group: "Team" },
  { href: "/tasks", label: "Delegation", group: "Team" },
  { href: "/employees", label: "Employees", group: "Team" },
  { href: "/rota", label: "Rota", group: "Team" },
  { href: "/integrations", label: "Integrations", group: "Admin" },
  { href: "/import-export", label: "CSV", group: "Admin" },
  { href: "/activity", label: "Activity", group: "Admin" },
  { href: "/journal", label: "Journal", group: "Admin" },
  { href: "/opportunities", label: "Opportunity scoring (ideas)", group: "Overview" },
];

// Never hidden: the basics, the way back, and every page on any role's phone bottom bar.
export const NEVER_HIDDEN: string[] = [
  "/dashboard", "/assistant", "/notifications", "/settings", "/team",
  "/sales", "/purchases", "/receivables-payables", "/cash-count", "/time", "/statements", "/profitability",
];

export interface MenuPreset {
  id: string;
  label: string;
  description: string;
  hides: string[];
}

export const MENU_PRESETS: MenuPreset[] = [
  { id: "everything", label: "Everything", description: "Show every page in the menu. Nothing is hidden.", hides: [] },
  {
    id: "product",
    label: "Shop or product business",
    description: "You buy or make things and sell them. Hides projects, estimates, lending, investments, the journal and opportunities.",
    hides: ["/projects", "/estimates", "/lending", "/investments", "/journal", "/opportunities"],
  },
  {
    id: "service",
    label: "Service or consulting",
    description: "You sell your time and skill. Hides purchase orders, suppliers, locations, lending, investments and the journal.",
    hides: ["/purchase-orders", "/suppliers", "/locations", "/lending", "/investments", "/journal"],
  },
  {
    id: "both",
    label: "Products and services",
    description: "Hides only lending, investments and the journal.",
    hides: ["/lending", "/investments", "/journal"],
  },
  {
    id: "basics",
    label: "Just the basics",
    description: "Selling, customers, leads, invoices, bills and collecting what you are owed. Everything else is tucked away until you want it.",
    hides: HIDABLE_PAGES.map((p) => p.href).filter((h) => !["/leads", "/products", "/customers", "/invoices", "/expenses", "/collections", "/routines"].includes(h)),
  },
];

const HIDABLE = new Set(HIDABLE_PAGES.map((p) => p.href));
export const isHidable = (href: string) => HIDABLE.has(href);

// What to save: only real, hidable pages, once each, in menu order. Anything else (including a non-list) is dropped.
export function cleanHiddenPages(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const want = new Set(input.filter((x): x is string => typeof x === "string"));
  return HIDABLE_PAGES.map((p) => p.href).filter((h) => want.has(h));
}

// The menu to show. `pathname` keeps the page you are on visible, so hiding something never makes the screen you are looking at
// lose its place in the menu.
export function applyHiddenPages<T extends { href: string }>(items: T[], hidden: unknown, pathname: string): T[] {
  const set = new Set(cleanHiddenPages(hidden));
  if (set.size === 0) return items;
  return items.filter((i) => !set.has(i.href) || pathname === i.href || pathname.startsWith(i.href + "/"));
}

// Which preset the saved list equals, or "custom". An empty list is "everything".
export function activePreset(hidden: unknown): string {
  const h = cleanHiddenPages(hidden);
  const key = h.join("|");
  const hit = MENU_PRESETS.find((p) => cleanHiddenPages(p.hides).join("|") === key);
  return hit ? hit.id : "custom";
}
