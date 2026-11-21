"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { applyHiddenPages } from "@/lib/navPrefs";
import { useAssistantModal } from "@/contexts/AssistantModalContext";
import { roleLabel } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { Skeleton } from "@/components/ui";
import OfflineBanner from "@/components/OfflineBanner";
import AccountBanner from "@/components/AccountBanner";
import SupportContact from "@/components/SupportContact";
import LockedDataExport from "@/components/LockedDataExport";
import QuickAiEntryModal from "@/components/ai/QuickAiEntryModal";
import FeedbackWidget from "@/components/FeedbackWidget";
import BusinessSwitcher from "@/components/BusinessSwitcher";
import { searchScreens } from "@/lib/screenSearch";
import { orderNav, visibleForKind } from "@/lib/navOrder";
import GroupSnapshotSync from "@/components/ops/GroupSnapshotSync";

type NavItem = { href: string; label: string; icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element; roles: Role[]; group: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: GridIcon, roles: ["owner", "manager", "accountant"], group: "Overview" },
  { href: "/assistant", label: "Assistant", icon: SparkleIcon, roles: ["owner", "manager"], group: "Overview" },
  { href: "/notifications", label: "Notifications", icon: BellIcon, roles: ["owner", "manager"], group: "Overview" },
  { href: "/agenda", label: "Agenda", icon: FileIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Overview" },

  { href: "/leads", label: "Leads", icon: FunnelIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/products", label: "Items", icon: BoxIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/purchase-orders", label: "Orders", icon: ClipboardIcon, roles: ["owner", "manager"], group: "Buy & sell" },
  { href: "/purchases", label: "Buying", icon: DownIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/estimates", label: "Estimates", icon: InvoiceIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/sales", label: "Selling", icon: UpIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Buy & sell" },
  { href: "/tabs", label: "Tabs", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/kitchen", label: "Kitchen", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/customers", label: "Customers", icon: PeopleIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Buy & sell" },
  { href: "/support", label: "Support", icon: ClipboardIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/feedback", label: "Feedback", icon: TrendIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/bookings", label: "Bookings", icon: ClipboardIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Buy & sell" },
  { href: "/events", label: "Events", icon: ClipboardIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/shipments", label: "Shipments", icon: FileIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Buy & sell" },
  { href: "/rentals", label: "Rentals", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/consignment", label: "Consignment", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/electronics", label: "Licences & trade-ins", icon: FileIcon, roles: ["owner", "manager"], group: "Buy & sell" },
  { href: "/price-control", label: "Price & condition", icon: FileIcon, roles: ["owner", "manager"], group: "Buy & sell" },
  { href: "/jobs", label: "Jobs (short work orders)", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/outreach", label: "Outreach", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/gift-cards", label: "Gift cards", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/suppliers", label: "Suppliers", icon: PeopleIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/locations", label: "Locations", icon: PinIcon, roles: ["owner", "manager"], group: "Buy & sell" },
  { href: "/projects", label: "Projects (longer client work)", icon: ProjectIcon, roles: ["owner", "manager"], group: "Buy & sell" },
  { href: "/offers", label: "Offers", icon: OfferIcon, roles: ["owner", "manager"], group: "Buy & sell" },

  { href: "/cash-count", label: "Cash count", icon: WalletIcon, roles: ["owner", "manager", "staff"], group: "Money" },
  { href: "/routines", label: "Routines", icon: ChecklistIcon, roles: ["owner", "manager"], group: "Money" },
  { href: "/accountant-pack", label: "Accountant pack", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/cash-flow", label: "Cash flow", icon: RunwayIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/receivables-payables", label: "Money owed", icon: ClockIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/collections", label: "Collections", icon: PeopleIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/cheques", label: "Cheques", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/mileage", label: "Mileage", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/farm", label: "Farm batches", icon: ClipboardIcon, roles: ["owner", "manager", "staff"], group: "Buy & sell" },
  { href: "/memberships", label: "Memberships", icon: PeopleIcon, roles: ["owner", "manager", "accountant"], group: "Buy & sell" },
  { href: "/invoices", label: "Invoices", icon: InvoiceIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Money" },
  { href: "/expenses", label: "Bills", icon: RepeatIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/loans", label: "Loans & credit (borrowed)", icon: LoanIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/reconciliation", label: "Reconcile", icon: ReconcileIcon, roles: ["owner", "manager"], group: "Money" },
  { href: "/profitability", label: "Profit", icon: TrendIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/statements", label: "Reports", icon: StatementIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/assets", label: "Fixed assets", icon: AssetIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/investments", label: "Investments", icon: TrendIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/lending", label: "Credit given (lent out)", icon: LoanIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/health", label: "Financial health", icon: PulseIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/models", label: "Models", icon: PulseIcon, roles: ["owner", "manager", "accountant"], group: "Money" },
  { href: "/accounting-journal", label: "Double-entry journal", icon: BookIcon, roles: ["owner"], group: "Money" },

  { href: "/time", label: "Time", icon: TimerIcon, roles: ["owner", "manager", "staff"], group: "Team" },
  { href: "/playbook", label: "Playbook", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Team" },
  { href: "/operations", label: "Operations", icon: ChecklistIcon, roles: ["owner", "manager", "staff", "accountant"], group: "Team" },
  { href: "/tasks", label: "Delegation", icon: FileIcon, roles: ["owner", "manager", "accountant"], group: "Team" },
  { href: "/employees", label: "Employees", icon: PeopleIcon, roles: ["owner"], group: "Team" },
  { href: "/rota", label: "Rota", icon: FileIcon, roles: ["owner", "manager", "staff"], group: "Team" },
  { href: "/integrations", label: "Integrations", icon: FileIcon, roles: ["owner"], group: "Admin" },
  { href: "/team", label: "Team access", icon: TeamIcon, roles: ["owner"], group: "Team" },

  { href: "/import-export", label: "CSV", icon: FileIcon, roles: ["owner"], group: "Admin" },
  { href: "/activity", label: "Activity", icon: ClockIcon, roles: ["owner"], group: "Admin" },
  { href: "/journal", label: "Journal", icon: BookIcon, roles: ["owner"], group: "Admin" },
  { href: "/opportunities", label: "Opportunity scoring (ideas)", icon: CompassIcon, roles: ["owner"], group: "Overview" },
  { href: "/settings", label: "Settings", icon: GearIcon, roles: ["owner"], group: "Admin" },
];

const GROUP_ORDER = ["Overview", "Buy & sell", "Money", "Team", "Admin"];

// One accent color per nav section, chosen for what each section is about
// rather than picked at random — see the color comments in
// tailwind.config.ts. Reused for the group's label dot, its icon chips,
// and its active-item highlight, so a whole section reads as one color
// family instead of every item defaulting to the same gold regardless of
// what it does.
const GROUP_META: Record<
  string,
  { dot: string; iconBg: string; iconBgActive: string; iconText: string; activeBg: string; activeBorder: string }
> = {
  Overview: {
    dot: "bg-overview",
    iconBg: "bg-overview/10",
    iconBgActive: "bg-overview/20",
    iconText: "text-overview-soft",
    activeBg: "bg-overview/10",
    activeBorder: "border-overview",
  },
  "Buy & sell": {
    dot: "bg-amber",
    iconBg: "bg-amber/10",
    iconBgActive: "bg-amber/20",
    iconText: "text-amber-soft",
    activeBg: "bg-amber/10",
    activeBorder: "border-amber",
  },
  Money: {
    dot: "bg-good",
    iconBg: "bg-good/10",
    iconBgActive: "bg-good/20",
    iconText: "text-good",
    activeBg: "bg-good/10",
    activeBorder: "border-good",
  },
  Team: {
    dot: "bg-info",
    iconBg: "bg-info/10",
    iconBgActive: "bg-info/20",
    iconText: "text-info",
    activeBg: "bg-info/10",
    activeBorder: "border-info",
  },
  Admin: {
    dot: "bg-plum",
    iconBg: "bg-plum/10",
    iconBgActive: "bg-plum/20",
    iconText: "text-plum-soft",
    activeBg: "bg-plum/10",
    activeBorder: "border-plum",
  },
};
const FALLBACK_META = GROUP_META["Buy & sell"];

// A handful of items per role that earn a permanent slot in the mobile
// bottom bar — the things done most often, day to day. Everything else
// lives one tap away behind "More" rather than in a horizontally-scrolling
// row of 18 icons, which hides items with no indication there's more to
// scroll to and makes every tap a guess. This mirrors how every mobile app
// with a deep nav tree (not just 4-5 top-level sections) actually solves
// this — Instagram, Amazon, banking apps — a short fixed bar plus a "More"
// entry point.
const MOBILE_PRIMARY_HREFS: Record<Role, string[]> = {
  owner: ["/dashboard", "/sales", "/purchases", "/receivables-payables"],
  manager: ["/dashboard", "/sales", "/purchases", "/receivables-payables"],
  staff: ["/sales", "/cash-count", "/time"],
  accountant: ["/dashboard", "/statements", "/profitability", "/receivables-payables"],
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, businessId, role, memberName, memberActive, businessSuspended, businessSuspendedReason, trialExpiredLock, renewalOverdueLock, loading, signOut } =
    useAuth();
  const { settings } = useData();
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { open: assistantOpen, openAssistant, closeAssistant } = useAssistantModal();

  const isAuthPage = pathname === "/login" || pathname === "/join";
  // The public marketing site (app/page.tsx) and its "Request a trial"
  // lead-capture form (app/request-trial/page.tsx) are the front door for
  // someone who has never had an account at all — they must be visible to
  // a signed-out visitor without getting bounced to /login the way every
  // other page in this app is. Once someone does have an account, though,
  // there's nothing for them to do on either page, so a signed-in user
  // still gets sent on to their dashboard (see the effect below).
  const isMarketingPage = pathname === "/" || pathname === "/request-trial";
  // The admin-only account-provisioning tool is deliberately outside the
  // normal signed-in-user chrome: it isn't part of any business's
  // dashboard, it's gated by its own passcode rather than a login, and an
  // admin using it may or may not also be signed into a business in this
  // same browser. It must never bounce a signed-out visitor to /login
  // (that's the whole point — it's how accounts get created before anyone
  // can log in) and never bounce a signed-in owner away from it either.
  // /verify-trial is the page behind the "confirm your email" link: reached from an email by someone
  // who may not be signed in (and shouldn't be bounced to /login for it), and harmless to a signed-in one.
  // Customer-facing pages: a quote a business sent for the customer to accept or decline (/quote/<token>), and the
  // website enquiry form (/enquire/<businessId>). Opened by people with no account, so they must never bounce to /login.
  // Unlike the marketing pages they are not sent on to the dashboard for a signed-in owner, who may open their own link.
  const isCustomerPage = pathname.startsWith("/quote/") || pathname.startsWith("/enquire/") || pathname.startsWith("/invoice/") || pathname.startsWith("/book/") || pathname.startsWith("/unsubscribe/") || pathname.startsWith("/tickets/");
  const isStandalonePage =
    isAuthPage || isMarketingPage || isCustomerPage || pathname.startsWith("/admin/") || pathname === "/legal" || pathname === "/verify-trial";
  const homeForRole = role === "staff" ? "/sales" : "/dashboard";

  useEffect(() => {
    if (loading) return;
    if (!user && !isStandalonePage) router.replace("/login");
    if (user && isAuthPage) router.replace(homeForRole);
    if (user && isMarketingPage) router.replace(homeForRole);
  }, [loading, user, isAuthPage, isMarketingPage, isStandalonePage, pathname, router, homeForRole]);

  // Close the "More" sheet and the jump-to palette automatically on
  // navigation so neither ever lingers open over the next page.
  useEffect(() => {
    setMoreOpen(false);
    setPaletteOpen(false);
  }, [pathname]);

  // Global ⌘K / Ctrl+K to open the "jump to" palette from anywhere in the
  // app — the fix for the actual pain point here: 27 destinations across 5
  // sidebar sections with no way to reach one except scrolling and
  // scanning. Ignored while the user is already typing in a field (so it
  // doesn't hijack a "k" keystroke inside a form), except when the palette
  // itself is open, where Escape still needs to close it.
  useEffect(() => {
    if (isStandalonePage || !user) return;
    function onKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStandalonePage, user]);

  // Same background-scroll lock + Escape-to-close as the shared Modal
  // component (see components/ui.tsx). This sheet is hand-rolled rather
  // than built on top of Modal because it needs its own bottom-nav-aware
  // trigger, but it's still a full-screen overlay and without this the
  // page underneath keeps scrolling/rubber-banding on touch while the
  // sheet is open — the exact "stickiness" Modal was built to avoid.
  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  // The screens this person can see, for the quick jump: the same role and hidden-page rule the navigation uses, computed before any early return.
  const quickJumpScreens = useMemo(() => orderNav(visibleForKind(applyHiddenPages(NAV.filter((item) => !role || item.roles.includes(role)), settings.hiddenPages, pathname), settings.businessKind, settings.showAllScreens)), [role, settings.hiddenPages, pathname, settings.businessKind, settings.showAllScreens]);
  // Quick jump (Ctrl+K, or Cmd+K on a Mac, or / when not typing): find any screen this person can see and open it.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpQuery, setJumpQuery] = useState("");
  const [jumpIndex, setJumpIndex] = useState(0);
  const jumpResults = useMemo(() => searchScreens(quickJumpScreens.map((n) => ({ href: n.href, label: n.label, group: n.group })), jumpQuery), [quickJumpScreens, jumpQuery]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !typing && !jumpOpen) {
        e.preventDefault();
        setJumpOpen(true);
        return;
      }
      if (e.key === "Escape" && jumpOpen) setJumpOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpOpen]);
  useEffect(() => { setJumpIndex(0); }, [jumpQuery]);
  function openScreen(href: string) {
    setJumpOpen(false);
    setJumpQuery("");
    router.push(href);
  }

  if (isStandalonePage) {
    return <>{children}</>;
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 mx-auto" />
          <Skeleton className="h-2 w-20 mx-auto" />
        </div>
      </div>
    );
  }

  // Checked ahead of the per-member gate below, and ahead of `role` even
  // being loaded — this is a whole-business lockout, so it applies to the
  // owner exactly as much as anyone else. Nothing on the client can clear
  // this (see meta/account in firestore.rules); only signing out and, from
  // the business's side, sorting things out with whoever runs the platform
  // gets them back in.
  if (user && businessSuspended) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="text-sm font-medium text-fg">
            {trialExpiredLock
              ? "Your free trial has ended"
              : renewalOverdueLock
              ? "Your renewal is overdue"
              : "This account has been suspended"}
          </div>
          <div className="text-sm text-muted mt-1 max-w-sm">
            {businessSuspendedReason || "Get in touch with us to sort this out and get back in."}
          </div>
          <SupportContact
            className="mt-3"
            prefill={
              trialExpiredLock
                ? "Hi, my Balancr trial has ended and I'd like to continue — what are the next steps?"
                : renewalOverdueLock
                ? "Hi, my Balancr renewal is overdue — I'd like to pay and get back in."
                : "Hi, my Balancr account shows as suspended — can we sort it out?"
            }
          />
          {(trialExpiredLock || renewalOverdueLock) && role === "owner" && <LockedDataExport />}
          <button onClick={() => signOut()} className="text-sm text-muted hover:text-fg mt-4 underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Signed in, but not linked to any business. Accounts are created by us
  // (never by the visitor), and team members join through an invite link, so
  // the only way to land here is a login that was never provisioned — a
  // stray sign-up, a mistyped email at login, or a deleted business.
  if (user && !loading && !businessId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="text-sm font-medium text-fg">This login isn&apos;t linked to a business yet</div>
          <div className="text-sm text-muted mt-1 max-w-sm">
            Accounts are set up by us after a trial request, and team members join through an invite link from
            their owner. If you were expecting access, get in touch or sign in with the email we set up.
          </div>
          <SupportContact className="mt-3" prefill="Hi, I signed in to Balancr but my login isn't linked to a business." />
          <button onClick={() => signOut()} className="text-sm text-muted hover:text-fg mt-4 underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (user && role && !memberActive) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="text-sm font-medium text-fg">Your access has been turned off</div>
          <div className="text-sm text-muted mt-1 max-w-sm">
            Whoever runs this business has deactivated your account. Talk to them if this seems wrong.
          </div>
          <button onClick={() => signOut()} className="text-sm text-muted hover:text-fg mt-4 underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Everything this role may open (the "Jump to" palette searches all of it), then without the pages the owner tucked away.
  const roleNav = NAV.filter((item) => !role || item.roles.includes(role));
  const visibleNav = orderNav(visibleForKind(applyHiddenPages(roleNav, settings.hiddenPages, pathname), settings.businessKind, settings.showAllScreens));
  const primaryHrefs = role ? MOBILE_PRIMARY_HREFS[role] : [];
  const primaryNav = visibleNav.filter((item) => primaryHrefs.includes(item.href));
  const restNav = visibleNav.filter((item) => !primaryHrefs.includes(item.href));
  const restHasActive = restNav.some((item) => pathname.startsWith(item.href));

  const showAssistantFab = (role === "owner" || role === "manager") && pathname !== "/assistant";

  return (
    <>
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-56 shrink-0 border-r border-line flex-col justify-between h-screen sticky top-0 bg-gradient-to-b from-panel/50 to-transparent">
        <div className="overflow-y-auto scroll-touch">
          <div className="px-5 py-5 border-b border-line flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg shrink-0 bg-gradient-to-br from-amber-soft to-amber shadow-[0_2px_10px_-2px_rgba(217,164,65,0.55)] flex items-center justify-center font-display text-sm font-bold text-ink">
              B
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight">Balancr</div>
              <div className="text-[11px] text-muted mt-0.5">solo SME finance</div>
            </div>
          </div>
          <div className="px-2.5 pt-2.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-line text-muted text-sm hover:text-fg hover:border-muted transition-colors"
            >
              <SearchIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Jump to…</span>
              <span className="text-[10px] border border-line rounded px-1 py-0.5 text-muted/70">⌘K</span>
            </button>
          </div>
          <nav className="p-2.5">
            {GROUP_ORDER.map((group) => {
              const items = visibleNav.filter((item) => item.group === group);
              if (items.length === 0) return null;
              const meta = GROUP_META[group] ?? FALLBACK_META;
              return (
                <div key={group} className="mb-3.5 last:mb-1">
                  <div className="px-3 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted/70 font-semibold">
                    <span className={clsx("w-1.5 h-1.5 rounded-full", meta.dot)} />
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const active = pathname.startsWith(item.href);
                      const isAssistant = item.href === "/assistant";
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={clsx(
                            "group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all border-l-2",
                            active
                              ? clsx(meta.activeBg, meta.activeBorder, "text-fg font-medium")
                              : isAssistant
                              ? "text-amber-soft font-medium border-transparent hover:bg-panel2"
                              : "text-muted border-transparent hover:text-fg hover:bg-panel2 hover:translate-x-0.5"
                          )}
                        >
                          <span
                            className={clsx(
                              "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                              isAssistant
                                ? active
                                  ? "bg-amber/20"
                                  : "bg-amber/10 group-hover:bg-amber/15"
                                : active
                                ? meta.iconBgActive
                                : clsx(meta.iconBg, "group-hover:brightness-125")
                            )}
                          >
                            <Icon
                              className={clsx(
                                "w-3.5 h-3.5",
                                isAssistant ? "text-amber-soft" : active ? meta.iconText : clsx(meta.iconText, "opacity-70")
                              )}
                            />
                          </span>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
        <div className="p-3 border-t border-line shrink-0">
          <div className="px-1 mb-2">
            <div className="text-xs text-fg truncate font-medium">{memberName ?? user.email}</div>
            <div className="text-[11px] text-muted flex items-center gap-1.5">
              {role && <span className="px-1.5 py-0.5 rounded border border-line bg-panel2">{roleLabel(role)}</span>}
            </div>
          </div>
          <div className="px-3 pb-2"><BusinessSwitcher /></div>
          {/* One always-visible way to ask for something or flag a problem
              — no separate support page to remember, no ticket number.
              Same shared modal the marketing site's footer opens (see
              app/page.tsx), just a different-styled trigger to match this
              sidebar's other rows. */}
          <FeedbackWidget
            renderTrigger={(openFeedback) => (
              <button
                onClick={openFeedback}
                className="w-full text-left text-sm text-muted hover:text-fg px-3 py-2 rounded-md hover:bg-panel2 flex items-center gap-2"
              >
                <FeedbackIcon className="w-3.5 h-3.5 shrink-0" />
                Feedback &amp; requests
              </button>
            )}
          />
          <button
            onClick={() => signOut()}
            className="w-full text-left text-sm text-muted hover:text-fg px-3 py-2 rounded-md hover:bg-panel2"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="sm:hidden safe-top flex items-center justify-between px-4 py-3.5 border-b border-line sticky top-0 bg-ink z-30">
          <div>
            <div className="font-display text-base font-bold leading-none">Balancr</div>
            {role && <div className="text-[10px] text-muted mt-0.5">{roleLabel(role)}</div>}
          </div>
          <div className="flex items-center gap-1">
            <BusinessSwitcher compact />
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Jump to"
              className="text-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <SearchIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => signOut()} className="text-xs text-muted min-h-[44px] px-2 -mr-2">
              Sign out
            </button>
          </div>
        </header>

        <OfflineBanner />
      <GroupSnapshotSync />
      {jumpOpen && (
        <div className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center p-4 pt-[12vh]" onClick={() => setJumpOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Find a screen" className="w-full max-w-md bg-panel border border-line rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={jumpQuery}
              onChange={(e) => setJumpQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setJumpIndex((i) => Math.min(i + 1, Math.max(0, jumpResults.length - 1))); }
                if (e.key === "ArrowUp") { e.preventDefault(); setJumpIndex((i) => Math.max(i - 1, 0)); }
                if (e.key === "Enter" && jumpResults[jumpIndex]) { e.preventDefault(); openScreen(jumpResults[jumpIndex].href); }
              }}
              placeholder="Go to a screen… (type a few letters)"
              className="w-full bg-transparent px-4 py-3 text-base border-b border-line focus:outline-none"
              aria-label="Search screens"
            />
            <ul className="max-h-[50vh] overflow-y-auto py-1">
              {jumpResults.length === 0 && <li className="px-4 py-3 text-sm text-muted">No screen matches that.</li>}
              {jumpResults.map((r, i) => (
                <li key={r.href}>
                  <button type="button" onClick={() => openScreen(r.href)} className={clsx("w-full text-left px-4 py-2.5 text-sm flex justify-between gap-3 min-h-[44px]", i === jumpIndex ? "bg-panel2" : "")}>
                    <span>{r.label}</span>
                    <span className="text-xs text-muted">{r.group}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 text-[11px] text-muted border-t border-line">Ctrl+K or / to open · ↑↓ to choose · Enter to go · Esc to close</div>
          </div>
        </div>
      )}
        <AccountBanner />

        <main className="flex-1 px-4 py-5 sm:px-8 sm:py-8 pb-24 sm:pb-8 max-w-6xl w-full mx-auto overflow-x-hidden">
          {children}
        </main>

        {/* Mobile bottom nav — a short, fixed set of the most-used
            destinations for this role, plus a "More" entry point for
            everything else. Nothing scrolls or gets clipped. */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-panel border-t border-line flex safe-bottom z-30">
          {primaryNav.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            const meta = GROUP_META[item.group] ?? FALLBACK_META;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px] transition-colors",
                  active ? clsx(meta.iconText, "font-medium") : "text-muted"
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            );
          })}
          {restNav.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px]",
                restHasActive ? "text-amber-soft" : "text-muted"
              )}
              aria-label="More"
            >
              <MoreIcon className="w-[18px] h-[18px]" />
              More
            </button>
          )}
        </nav>

        {/* "More" sheet: everything not pinned to the bottom bar, grouped
            in one tap-friendly grid instead of a second layer of scrolling. */}
        {moreOpen && (
          <div className="sm:hidden fixed inset-0 z-40 flex items-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="More"
              className="relative w-full bg-panel border-t border-line rounded-t-lg max-h-[80vh] overflow-y-auto scroll-touch p-5 pb-8 safe-bottom">
              <div className="w-9 h-1 rounded-full bg-line mx-auto -mt-1 mb-4" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-medium">More</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="text-muted hover:text-fg w-11 h-11 -mr-2 flex items-center justify-center rounded-md hover:bg-panel2"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {GROUP_ORDER.map((group) => {
                const items = restNav.filter((item) => item.group === group);
                if (items.length === 0) return null;
                const meta = GROUP_META[group] ?? FALLBACK_META;
                return (
                  <div key={group} className="mb-4 last:mb-0">
                    <div className="px-1 pb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted/70 font-semibold">
                      <span className={clsx("w-1.5 h-1.5 rounded-full", meta.dot)} />
                      {group}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {items.map((item) => {
                        const active = pathname.startsWith(item.href);
                        const isAssistant = item.href === "/assistant";
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                              "flex flex-col items-center justify-center gap-1.5 rounded-lg border py-4 px-2 text-xs text-center min-h-[76px] transition-colors",
                              active
                                ? clsx(meta.activeBorder, meta.activeBg, "text-fg font-medium")
                                : isAssistant
                                ? "border-amber-soft/60 text-amber-soft font-medium hover:bg-panel2"
                                : "border-line text-muted hover:bg-panel2 hover:text-fg"
                            )}
                          >
                            <Icon className={clsx("w-5 h-5 shrink-0", active && meta.iconText)} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="mt-5 pt-4 border-t border-line">
                <div className="text-xs text-fg truncate font-medium">{memberName ?? user.email}</div>
                {role && (
                  <div className="text-[11px] text-muted mt-1">
                    <span className="px-1.5 py-0.5 rounded border border-line bg-panel2">{roleLabel(role)}</span>
                  </div>
                )}
                <FeedbackWidget
                  renderTrigger={(openFeedback) => (
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        openFeedback();
                      }}
                      className="w-full text-left text-sm text-muted hover:text-fg px-0 py-3 min-h-[44px] flex items-center gap-2"
                    >
                      <FeedbackIcon className="w-4 h-4 shrink-0" />
                      Feedback &amp; requests
                    </button>
                  )}
                />
                <button
                  onClick={() => signOut()}
                  className="w-full text-left text-sm text-muted hover:text-fg px-0 py-3 min-h-[44px]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* One floating way to reach the assistant from anywhere in the app —
        not a different door on every page. Same shared modal that
        QuickActionBar's "Tell me what happened" button opens (see
        AssistantModalContext), so there's exactly one AI entry
        experience, just multiple ways to reach it. Hidden on the
        dedicated /assistant page itself, since that page already is the
        assistant. */}
    {showAssistantFab && (
      <button
        onClick={openAssistant}
        aria-label="Open assistant"
        className="fixed z-40 right-4 bottom-20 sm:bottom-6 w-14 h-14 rounded-full bg-amber-soft text-ink shadow-lg flex items-center justify-center hover:brightness-105 active:scale-95 transition-transform"
      >
        <SparkleIcon className="w-6 h-6" />
      </button>
    )}
    <QuickAiEntryModal open={assistantOpen} onClose={closeAssistant} />
    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      items={roleNav}
      onNavigate={(href) => {
        setPaletteOpen(false);
        router.push(href);
      }}
    />
    </>
  );
}

function SparkleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...props}>
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

function GridIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function BoxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}
function ClipboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
    </svg>
  );
}
function OfferIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3.5" y="7" width="13" height="13" rx="2" />
      <path d="M7.5 7V5.5A2 2 0 0 1 9.5 3.5h9A2 2 0 0 1 20.5 5.5v9a2 2 0 0 1-2 2H17" />
    </svg>
  );
}

function ProjectIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function DownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M12 3v14" />
      <path d="m5 11 7 7 7-7" />
      <path d="M5 21h14" />
    </svg>
  );
}
function UpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M12 21V7" />
      <path d="m5 13 7-7 7 7" />
      <path d="M5 3h14" />
    </svg>
  );
}
function RepeatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function TrendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}
function PeopleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.3" />
      <path d="M16 14.6c2.4.4 4.2 2.2 4.7 4.6" />
    </svg>
  );
}
function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}
function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
function LoanIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15.5s.9 1.5 3 1.5 3-1.1 3-2.3c0-3-6-1.7-6-4.6C9 9 10.3 8 12 8s3 1 3 1" />
      <path d="M12 6.5V8M12 16.5V18" />
    </svg>
  );
}
function StatementIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M6 2h9l4 4v16H6Z" />
      <path d="M15 2v4h4" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3" />
    </svg>
  );
}
function GearIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
function AssetIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
      <path d="M3 12h18" />
    </svg>
  );
}
function PulseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 12h2.5l1.5-4 3 8 1.5-4H17.5" />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function BookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CompassIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" />
    </svg>
  );
}
function FunnelIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 4h16l-6 8v6l-4 2v-8L4 4Z" />
    </svg>
  );
}
function InvoiceIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}
function TimerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M10 2h4" />
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M18.5 6.5 20 5" />
    </svg>
  );
}

function WalletIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V8H5.5A2.5 2.5 0 0 1 3 5.5Z" />
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function ChecklistIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6.5l1.6 1.6L8.5 5" />
      <path d="M4 12.5l1.6 1.6L8.5 11" />
      <path d="M4 18.5l1.6 1.6L8.5 17" />
      <path d="M12 7h8M12 13h8M12 19h8" />
    </svg>
  );
}
function ReconcileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 7h11l-3-3M4 7l3 3" />
      <path d="M20 17H9l3 3M20 17l-3-3" />
    </svg>
  );
}

function RunwayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 20 20 4" />
      <path d="M4 4h6M4 4v6" />
      <path d="M20 20h-6M20 20v-6" />
    </svg>
  );
}
function TeamIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.4" />
      <path d="M2.5 20c.6-3.3 2.9-5.3 5.5-5.3s4.9 2 5.5 5.3" />
      <path d="M14.5 15.2c2 .2 3.7 1.9 4.2 4.8" />
    </svg>
  );
}
function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function FeedbackIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5Z" />
    </svg>
  );
}
function MoreIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Jump-to-anywhere search, opened with the trigger button in the sidebar /
// mobile top bar, or ⌘K / Ctrl+K from anywhere in the app. This is the one
// piece of navigation missing from an otherwise well-covered nav: with 27
// destinations across 5 sidebar groups, finding a specific one otherwise
// means scrolling and scanning (desktop) or drilling into "More" and
// scanning a grid (mobile). Filters by label or section name, and — since
// most people typing a query already know roughly what they want — always
// keeps the first result highlighted so Enter alone is usually enough.
function CommandPalette({
  open,
  onClose,
  items,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Reset to a clean, ready-to-type state each time the palette opens, and
  // move focus into the input so ⌘K → type → Enter works without an extra
  // click, the whole point of a keyboard-driven launcher.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted row scrolled into view as arrow keys move past the
  // edge of a long, filtered list.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) onNavigate(target.href);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center pt-16 sm:pt-0 px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        className="relative bg-panel border border-line rounded-lg w-full sm:max-w-md max-h-[70vh] flex flex-col overflow-hidden shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line shrink-0">
          <SearchIcon className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page…"
            aria-label="Jump to a page"
            className="flex-1 bg-transparent text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none"
          />
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-fg text-xs shrink-0">
            Esc
          </button>
        </div>
        <div ref={listRef} className="overflow-y-auto scroll-touch p-1.5">
          {results.length === 0 ? (
            <div className="text-sm text-muted text-center py-8">No matching page.</div>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              const meta = GROUP_META[item.group] ?? FALLBACK_META;
              const active = i === activeIndex;
              return (
                <button
                  key={item.href}
                  data-active={active}
                  onClick={() => onNavigate(item.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm text-left transition-colors",
                    active ? "bg-panel2 text-fg" : "text-muted"
                  )}
                >
                  <span className={clsx("w-6 h-6 rounded-md flex items-center justify-center shrink-0", meta.iconBg)}>
                    <Icon className={clsx("w-3.5 h-3.5", meta.iconText)} />
                  </span>
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  <span className="text-[10px] text-muted/70 shrink-0">{item.group}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
