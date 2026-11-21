// The one place plan names, prices and the trial length are defined.
//
// Before this file, the landing page's pricing cards, the request-trial form's
// plan list and the admin's billing form each carried their own copy — so
// changing a price meant editing three files and hoping nobody forgot one. Now
// the public pricing cards (components/PricingSection.tsx), the trial-request
// form (app/request-trial/page.tsx), the admin's billing/payment forms
// (app/admin/new-business/page.tsx) and the pure billing logic (lib/billing.ts)
// all read from here, so what a visitor is shown is exactly what the admin
// invoices by default.
//
// Prices are LKR. Annual is 10 × monthly ("2 months free"). Plans differ in team
// size guidance, support and onboarding — never in features (nothing in the app
// is gated by plan; see AccountStatus.plan in lib/types.ts).

export type BillingCycle = "monthly" | "annual";

export const PRICING_CURRENCY = "LKR";

// Length of the free trial the admin form pre-fills and the public pages promise.
export const TRIAL_DAYS = 14;

export interface Tier {
  id: string; // also the value carried in /request-trial?plan=… and stored as AccountStatus.plan
  name: string;
  tagline: string;
  monthly: number;
  annual: number; // total per year, already discounted
  teamSize: string;
  // Logins the plan is built for, or null when there is no stated number. ADVISORY ONLY: the app
  // never blocks an invite over it; the admin console flags an account that is over it (lib/seats.ts).
  seatGuide: number | null;
  support: string;
  onboarding: string;
  recommended?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: "Starter",
    name: "Starter",
    tagline: "For one owner, or a very small team, moving off spreadsheets.",
    monthly: 2900,
    annual: 29000,
    teamSize: "Built for 1–2 logins",
    seatGuide: 2,
    support: "Email support",
    onboarding: "Set it up yourself, with a checklist inside the app",
  },
  {
    id: "Growth",
    name: "Growth",
    tagline: "For a small team that wants the whole business in one place.",
    monthly: 4900,
    annual: 49000,
    teamSize: "Built for a full team: Owner, Manager and Staff logins, plus a view-only login for your accountant",
    seatGuide: null,
    support: "Priority email support",
    onboarding: "A short setup call with a real person to get your data in",
    recommended: true,
  },
  {
    id: "Business",
    name: "Business",
    tagline: "For a growing business that wants extra hands-on help.",
    monthly: 8900,
    annual: 89000,
    teamSize: "Built for a growing team, with no limit on logins",
    seatGuide: null,
    support: "Dedicated priority support",
    onboarding: "Full setup help: we move your existing records in for you",
  },
];

export function tierById(id: string | null | undefined): Tier | null {
  if (!id) return null;
  const wanted = id.trim().toLowerCase();
  return TIERS.find((t) => t.id.toLowerCase() === wanted) ?? null;
}

// What the plan costs for one billing period (the amount actually invoiced).
export function periodAmount(tier: Tier, cycle: BillingCycle): number {
  return cycle === "annual" ? tier.annual : tier.monthly;
}

// The "/ month" figure shown on the pricing cards.
export function monthlyEquivalent(tier: Tier, cycle: BillingCycle): number {
  return cycle === "annual" ? Math.round(tier.annual / 12) : tier.monthly;
}

// How much cheaper annual is than twelve monthly payments.
export function annualSaving(tier: Tier): number {
  return tier.monthly * 12 - tier.annual;
}

// /request-trial stores what the visitor was looking at as "Growth — annual"
// (see app/request-trial/page.tsx). This reads that back so the admin doesn't
// have to retype it: the plan and cycle become the account's billing defaults
// the moment it is provisioned. Anything it can't recognise returns null — the
// admin can always set billing by hand, this is only a head start.
export function parseInterest(
  interested: string | null | undefined
): { tier: Tier; cycle: BillingCycle | null } | null {
  if (!interested) return null;
  const [rawPlan, rawCycle] = interested.split(/\s+[—–-]\s+/);
  const tier = tierById(rawPlan);
  if (!tier) return null;
  const c = (rawCycle ?? "").trim().toLowerCase();
  return { tier, cycle: c === "monthly" || c === "annual" ? c : null };
}
