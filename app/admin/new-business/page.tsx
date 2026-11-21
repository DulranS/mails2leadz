"use client";

// ---------------------------------------------------------------------------
// PRIVATE — account provisioning for admins only.
//
// This is the only place a new business (and its owner login) gets
// created. There's no public "Create account" anymore (see app/login) —
// letting anyone with the URL sign themselves up would mean any random
// visitor could spin up a business and start poking at the app, which is
// exactly the kind of noise/support-load/abuse surface a business selling
// seats to real SME customers wants zero of. Instead: an admin creates the
// account here, the new owner gets an email with a link to set their own
// password, and that's their first and only "signup" step.
//
// This route is deliberately:
//   - not linked anywhere in the app's own nav (see components/AppShell.tsx)
//   - excluded from search indexing (see layout.tsx + public/robots.txt)
//   - gated behind a shared passcode, verified server-side (ADMIN_PASSCODE)
//
// Be honest with yourself about what that last point does and doesn't
// buy you: this is a Firebase project with no server of its own (no
// Cloud Functions — see firebase.json), so the client always ends up
// holding the real Firebase Web API key regardless, and Firebase Auth's
// REST API would accept a createUser call from anyone who had it, gate or
// no gate. The passcode below is a business/UX control — it stops a
// random visitor from finding a "Create account" button and using it, and
// stops this URL from being casually stumbled into — it is NOT a
// cryptographic security boundary. If that stronger guarantee ever
// matters (e.g. once this is worth attacking), the fix is to add Firebase
// App Check plus a Cloud Function that performs the actual account
// creation server-side, and have this page call that function instead of
// touching Firebase Auth directly.
//
// The passcode lives ONLY in the server-only ADMIN_PASSCODE env var (see
// .env.local.example) and is verified by /api/admin/verify — this file
// never contains it, so it is not in the client bundle. (It used to be
// NEXT_PUBLIC_ADMIN_PASSCODE, which Next.js inlines into the bundle, so
// any customer could read it in dev tools; that name is no longer used.)
// The Firebase Auth createUser caveat above still stands for account
// creation itself, but everything that touches OTHER businesses' data —
// listing, suspending, billing — goes through app/api/admin/*, which
// checks the passcode server-side on every call. Rotate it by changing the
// env var and redeploying; use a different value per deployment.
// ---------------------------------------------------------------------------

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { provisionBusinessOwner } from "@/lib/provisioning";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebase } from "@/lib/firebase";
import { formatMoney, todayIso } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import { PaymentHistory, RecordPaymentForm } from "@/components/AdminBilling";
import { monthlyRecurringRevenue } from "@/lib/billing";
import { seatCheck } from "@/lib/seats";
import { healthExceptions, type HealthSnapshot } from "@/lib/healthSnapshot";
import { PRICING_CURRENCY, TIERS, TRIAL_DAYS, parseInterest, periodAmount, tierById, type BillingCycle } from "@/lib/pricing";
import type { AccountStatus, Feedback, TrialRequest } from "@/lib/types";

// Platform billing is priced and collected in LKR regardless of which
// currency a given business books its own sales in — those are unrelated
// (see Settings.currency vs this), so this is a constant here rather than
// anything read off a business's own settings doc.
const PLATFORM_CURRENCY = PRICING_CURRENCY;
const PAYMENT_INSTRUCTIONS = (process.env.NEXT_PUBLIC_PAYMENT_INSTRUCTIONS ?? "").trim();

const LOCK_KEY = "admin-provision-lock";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

// Keeps the passcode for THIS TAB only (sessionStorage — gone when the tab closes) and drops it
// after 30 idle minutes, so a refresh or a tap on an email link doesn't mean typing it again.
// It is verified with the server on every restore, so a rotated passcode just shows the form.
const SESSION_KEY = "admin-session";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function readSession(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { p?: string; t?: number };
    if (typeof parsed.p !== "string" || !parsed.p || typeof parsed.t !== "number" || Date.now() - parsed.t > SESSION_IDLE_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed.p;
  } catch {
    return null;
  }
}

function writeSession(passcode: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ p: passcode, t: Date.now() }));
  } catch {
    /* storage unavailable (private mode) — the passcode just has to be typed after a refresh */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

interface LockState {
  attempts: number;
  lockedUntil: number | null;
}

function readLock(): LockState {
  if (typeof window === "undefined") return { attempts: 0, lockedUntil: null };
  try {
    const raw = window.sessionStorage.getItem(LOCK_KEY);
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw) as LockState;
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function writeLock(state: LockState) {
  window.sessionStorage.setItem(LOCK_KEY, JSON.stringify(state));
}

export default function NewBusinessAdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [lock, setLock] = useState<LockState>({ attempts: 0, lockedUntil: null });
  const [now, setNow] = useState(() => Date.now());
  const [verifying, setVerifying] = useState(false);
  // True while a passcode saved earlier in this tab is being re-checked with the server, so the
  // form doesn't flash up for a second before the panel appears.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    setLock(readLock());
    const saved = readSession();
    if (!saved) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/admin/verify", { method: "POST", headers: { "x-admin-passcode": saved } });
        if (res.ok) {
          setPasscodeInput(saved);
          setUnlocked(true);
          writeSession(saved);
        } else {
          clearSession();
        }
      } catch {
        /* offline — fall back to the passcode form */
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  function lockNow() {
    clearSession();
    setUnlocked(false);
    setPasscodeInput("");
  }

  // While unlocked: any activity keeps the session fresh; 30 idle minutes locks it again.
  useEffect(() => {
    if (!unlocked) return;
    let lastActivity = Date.now();
    let lastWrite = 0;
    const touch = () => {
      lastActivity = Date.now();
      if (lastActivity - lastWrite > 15_000) {
        lastWrite = lastActivity;
        writeSession(passcodeInput);
      }
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_IDLE_MS) lockNow();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, passcodeInput]);

  // Tick while locked out so the "try again in Xs" message counts down and
  // re-enables the form on its own once the lockout expires.
  useEffect(() => {
    if (!lock.lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lock.lockedUntil]);

  const isLocked = !!lock.lockedUntil && lock.lockedUntil > now;
  const lockSecondsLeft = isLocked ? Math.ceil((lock.lockedUntil! - now) / 1000) : 0;

  async function handlePasscodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLocked || verifying) return;
    setVerifying(true);
    let serverMessage: string | null = null;
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "x-admin-passcode": passcodeInput },
      });
      if (res.ok) {
        writeLock({ attempts: 0, lockedUntil: null });
        setLock({ attempts: 0, lockedUntil: null });
        writeSession(passcodeInput);
        setUnlocked(true);
        setPasscodeError(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      serverMessage = body.error ?? null;
    } catch {
      setPasscodeError("Couldn't reach the server. Check your connection and try again.");
      return;
    } finally {
      setVerifying(false);
    }
    // The server holds the real lockout (per-IP, in Firestore); this
    // counter is just the friendly in-browser version of it.
    const attempts = lock.attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
    const next = { attempts, lockedUntil };
    writeLock(next);
    setLock(next);
    setPasscodeInput("");
    setPasscodeError(
      lockedUntil ? "Too many attempts. Try again in a few minutes." : serverMessage ?? "That's not the passcode."
    );
  }

  if (restoring) {
    return (
      <Centered>
        <div className="text-sm text-muted text-center">Checking your session…</div>
      </Centered>
    );
  }

  if (!unlocked) {
    return (
      <Centered>
        <div className="mb-6 text-center">
          <div className="font-display text-xl font-bold">Admin access</div>
          <div className="text-sm text-muted mt-1">Enter the passcode to continue.</div>
        </div>
        <div className="bg-panel border border-line rounded-lg p-6 w-full">
          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div>
              <Label>Passcode</Label>
              <Input
                type="password"
                required
                autoFocus
                disabled={isLocked}
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>
            {passcodeError && (
              <div className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">
                {passcodeError}
                {isLocked ? ` (${lockSecondsLeft}s)` : ""}
              </div>
            )}
            <Button type="submit" disabled={isLocked || verifying} className="w-full">
              {verifying ? "Checking…" : "Continue"}
            </Button>
          </form>
        </div>
      </Centered>
    );
  }

  return (
    <Wide>
      <AdminPanel passcode={passcodeInput} onLock={lockNow} />
    </Wide>
  );
}

// Once unlocked, the passcode entered above is reused as this browser's
// credential for the admin API routes (app/api/admin/*) for the rest of
// this page's lifetime — see lib/adminAuth.ts. There's nothing more
// privileged about it than the form input it came from; it's just carried
// forward so "Manage accounts" doesn't ask for it a second time.
// A trial request selected from the "Trial requests" tab, carried into
// the "Create account" tab to prefill the provisioning form — see
// TrialRequestsPanel's "Use for account" button below. Keeping this at
// the AdminPanel level (rather than inside either tab) is what lets one
// tab hand data to the other, and lets ProvisionForm report back which
// request it was created from so that request can be marked provisioned.
interface ProvisionPrefill {
  requestId: string;
  email: string;
  ownerName: string;
  businessName: string;
  // What the visitor was looking at ("Growth — annual"); becomes the new account's
  // billing defaults so the first payment is one step.
  interestedPlan?: string;
}

// One accent color per pipeline stage, same idea as the main app sidebar
// (components/AppShell.tsx): gold for the create/action step, sapphire for
// the steady-state "manage what already exists" step (trust/oversight),
// periwinkle for incoming trial requests (new, not yet decided — the same
// calm-orientation color the app uses for its own "Overview" nav section).
// Urgency badges (overdue billing, unread requests) stay red regardless of
// tab color — that's a separate "needs attention" signal, not a section
// identity, so it shouldn't get diluted by whichever tab it's sitting in.
const TAB_META = {
  today: {
    icon: TodayIcon,
    dot: "bg-overview",
    iconBg: "bg-overview/10",
    iconBgActive: "bg-overview/20",
    iconText: "text-overview-soft",
    activeBg: "bg-overview/10",
    activeBorder: "border-overview",
    solid: "bg-overview text-white",
  },
  create: {
    icon: PlusIcon,
    dot: "bg-amber",
    iconBg: "bg-amber/10",
    iconBgActive: "bg-amber/20",
    iconText: "text-amber-soft",
    activeBg: "bg-amber/10",
    activeBorder: "border-amber",
    solid: "bg-amber text-ink",
  },
  manage: {
    icon: FolderIcon,
    dot: "bg-info",
    iconBg: "bg-info/10",
    iconBgActive: "bg-info/20",
    iconText: "text-info",
    activeBg: "bg-info/10",
    activeBorder: "border-info",
    solid: "bg-info text-white",
  },
  requests: {
    icon: InboxIcon,
    dot: "bg-overview",
    iconBg: "bg-overview/10",
    iconBgActive: "bg-overview/20",
    iconText: "text-overview-soft",
    activeBg: "bg-overview/10",
    activeBorder: "border-overview",
    solid: "bg-overview text-white",
  },
  feedback: {
    icon: FeedbackIcon,
    dot: "bg-good",
    iconBg: "bg-good/10",
    iconBgActive: "bg-good/20",
    iconText: "text-good",
    activeBg: "bg-good/10",
    activeBorder: "border-good",
    solid: "bg-good text-white",
  },
} as const;

type AdminTab = "today" | "create" | "manage" | "requests" | "feedback";

// Links in your notification emails point straight at a lead: /admin/new-business?tab=requests&lead=<id>.
// Read once when the panel opens (after unlocking), then tidied out of the address bar.
function readDeepLink(): { tab: AdminTab; lead: string | null } {
  if (typeof window === "undefined") return { tab: "today", lead: null };
  const q = new URLSearchParams(window.location.search);
  const valid: AdminTab[] = ["today", "create", "manage", "requests", "feedback"];
  const rawLead = q.get("lead") ?? "";
  const lead = rawLead && rawLead.length <= 120 ? rawLead : null;
  const t = q.get("tab") as AdminTab | null;
  return { tab: lead ? "requests" : t && valid.includes(t) ? t : "today", lead };
}

function AdminPanel({ passcode, onLock }: { passcode: string; onLock: () => void }) {
  const [deepLink] = useState(readDeepLink);
  // Opens on "Today" (what needs you right now) unless an email link says otherwise.
  const [tab, setTab] = useState<AdminTab>(deepLink.tab);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(deepLink.lead);
  const [prefill, setPrefill] = useState<ProvisionPrefill | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [billingAlertCount, setBillingAlertCount] = useState<number | null>(null);
  const [newFeedbackCount, setNewFeedbackCount] = useState<number | null>(null);

  const counts: Record<AdminTab, number | null> = {
    today: null,
    create: null,
    manage: billingAlertCount,
    requests: pendingCount,
    feedback: newFeedbackCount,
  };
  const labels: Record<AdminTab, string> = {
    today: "Today",
    create: "Create account",
    manage: "Manage accounts",
    requests: "Trial requests",
    feedback: "Feedback",
  };

  // Tidy the deep link out of the address bar once it has been read.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Leads waiting show in the browser tab, so a pinned tab tells you without opening it.
  useEffect(() => {
    const original = document.title;
    document.title = pendingCount ? `(${pendingCount}) Pipeline — leads waiting` : "Pipeline";
    return () => {
      document.title = original;
    };
  }, [pendingCount]);

  return (
    <div className="w-full flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
      {/* Desktop sidebar — one color per pipeline stage, same language as
          the main app's own nav (see components/AppShell.tsx). */}
      <aside className="hidden sm:block w-52 shrink-0 sm:sticky sm:top-10">
        <div className="flex items-center gap-2.5 px-1 mb-4">
          <div className="w-8 h-8 rounded-lg shrink-0 bg-gradient-to-br from-amber-soft to-amber shadow-[0_2px_10px_-2px_rgba(217,164,65,0.55)] flex items-center justify-center font-display text-sm font-bold text-ink">
            P
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-tight">Pipeline</div>
            <div className="text-[11px] text-muted">account admin</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {(["today", "create", "manage", "requests", "feedback"] as const).map((key) => {
            const meta = TAB_META[key];
            const Icon = meta.icon;
            const active = tab === key;
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  "group flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm text-left transition-all border-l-2",
                  active
                    ? clsx(meta.activeBg, meta.activeBorder, "text-fg font-medium")
                    : "text-muted border-transparent hover:text-fg hover:bg-panel2 hover:translate-x-0.5"
                )}
              >
                <span
                  className={clsx(
                    "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                    active ? meta.iconBgActive : clsx(meta.iconBg, "group-hover:brightness-125")
                  )}
                >
                  <Icon className={clsx("w-3.5 h-3.5", active ? meta.iconText : clsx(meta.iconText, "opacity-70"))} />
                </span>
                <span className="flex-1">{labels[key]}</span>
                {!!count && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-bad/20 text-bad">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onLock}
          className="mt-6 px-2.5 py-2 text-xs text-muted hover:text-fg underline underline-offset-2 text-left"
        >
          Lock admin
        </button>
      </aside>

      {/* Mobile: compact colored tab row instead of the sidebar */}
      <div className="flex sm:hidden gap-2 w-full overflow-x-auto scroll-touch pb-1">
        {(["today", "create", "manage", "requests", "feedback"] as const).map((key) => {
          const meta = TAB_META[key];
          const active = tab === key;
          const count = counts[key];
          return (
            <TabButton key={key} active={active} onClick={() => setTab(key)} activeClass={meta.solid}>
              {labels[key]}
              {!!count && ` (${count})`}
            </TabButton>
          );
        })}
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 px-3 min-h-[44px] text-xs text-muted hover:text-fg underline underline-offset-2"
        >
          Lock
        </button>
      </div>

      <div className="flex-1 min-w-0 w-full">
        {tab === "today" ? (
          <TodayPanel
            passcode={passcode}
            onNavigate={setTab}
            onCounts={(c) => {
              setPendingCount(c.pendingLeads);
              setBillingAlertCount(c.needAction);
            }}
          />
        ) : tab === "create" ? (
          <div className="max-w-sm mx-auto">
            <ProvisionForm passcode={passcode} prefill={prefill} onDone={() => setPrefill(null)} />
            <DemoBusinessCard passcode={passcode} />
          </div>
        ) : tab === "manage" ? (
          <ManageAccountsPanel passcode={passcode} onBillingAlertCountChange={setBillingAlertCount} />
        ) : tab === "requests" ? (
          <TrialRequestsPanel
            passcode={passcode}
            focusLeadId={focusLeadId}
            onFocusHandled={() => setFocusLeadId(null)}
            onPendingCountChange={setPendingCount}
            onUseForAccount={(req) => {
              setPrefill({
                requestId: req.id,
                email: req.email,
                ownerName: req.name,
                businessName: req.businessName ?? "",
                interestedPlan: req.interestedPlan,
              });
              setTab("create");
            }}
          />
        ) : (
          <FeedbackPanel passcode={passcode} onNewCountChange={setNewFeedbackCount} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
        active ? activeClass ?? "bg-amber text-ink" : "bg-transparent border border-line text-fg hover:border-muted"
      )}
    >
      {children}
    </button>
  );
}

function TodayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5Z" />
      <path d="M4 9.5h16M8.5 14l2 2 4-4" />
    </svg>
  );
}
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8A2 2 0 0 1 21 9.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 12h4.5l1.5 3h6l1.5-3H21" />
      <path d="M5.5 6h13l2.5 6v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-7Z" />
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

interface AdminBusinessSummary {
  businessId: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string | null;
  createdAt: number | null;
  suspended: boolean;
  suspendedAt: number | null;
  // Locked by an expired trial (computed server-side, lib/accountAccess.ts).
  autoLocked: boolean;
  autoLockKind: "trial_expired" | "renewal_overdue" | null;
  autoLockOverdue: boolean;
  complimentary: boolean;
  adminAccount: boolean;
  trialLockDate: string | null;
  reason: string | null;
  plan: string | null;
  billingAmount: number | null;
  billingCycle: AccountStatus["billingCycle"] | null;
  lastPaidAt: number | null;
  renewalDueDate: string | null;
  trialEndsAt: string | null;
  lastActiveAt: number | null;
  // Owner's last sign-in (Firebase Auth). signedIn === false: never signed in. null: unknown.
  lastSignInAt: number | null;
  signedIn: boolean | null;
  convertedAt: number | null;
  // This month's AI Assistant use (turns, tokens, conservative $ estimate). Null: not used this month.
  aiMonth: { turns: number; inputTokens: number; outputTokens: number; cachedTokens: number; estCostUsd: number } | null;
  // Active logins incl. the owner. Null: unknown.
  activeLogins: number | null;
  health: HealthSnapshot | null;
  notes: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "Send sign-in link" — shared by the Today and Manage tabs. Emails the owner a fresh, long-lived
// link to choose their password (app/api/admin/businesses/[id]/invite). When email isn't switched
// on, or fails, the same link is copied to the clipboard so it can go out by WhatsApp instead.
// Returns the sentence to show the admin.
async function requestSignInLink(
  passcode: string,
  b: Pick<AdminBusinessSummary, "businessId" | "businessName" | "ownerName">
): Promise<string> {
  const res = await fetch(`/api/admin/businesses/${b.businessId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
    body: JSON.stringify({ send: true }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    email?: string | null;
    emailError?: string | null;
    to?: string;
    link?: string | null;
    warning?: string | null;
  };
  if (!res.ok) throw new Error(data.error || "Couldn't create a sign-in link.");
  if (data.email === "sent") return `Sign-in link emailed to ${data.to}.${data.warning ? ` ${data.warning}` : ""}`;
  const who = b.businessName || b.ownerName;
  let copied = false;
  if (data.link) {
    try {
      await navigator.clipboard.writeText(data.link);
      copied = true;
    } catch {
      /* clipboard blocked — the link is shown below instead */
    }
  }
  const why =
    data.email === "failed"
      ? `The email couldn't be sent${data.emailError ? ` (${data.emailError})` : ""}`
      : "Email isn't switched on";
  const note = data.warning ? ` ${data.warning}` : "";
  return copied
    ? `${why}, so the link for ${who} is copied — paste it to them on WhatsApp.${note}`
    : `${why}. Link for ${who}: ${data.link ?? "(none)"}${note}`;
}
const DUE_SOON_DAYS = 7;

// How many whole days from now until `renewalDueDate`, negative once
// overdue. Compared at UTC-midnight granularity (not exact ms) so "due
// today" doesn't flicker between "0 days" and "-1 day" depending on what
// time the admin happens to load the page.
function daysUntil(renewalDueDate: string, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = new Date(renewalDueDate + "T00:00:00Z").getTime();
  return Math.round((due - today) / DAY_MS);
}

// The single label + tone every billing-aware view (the "Manage accounts"
// badge count, the tab count, each business card) derives its display
// from, so "what counts as overdue/due soon" only has one definition.
function renewalStatus(
  b: Pick<AdminBusinessSummary, "renewalDueDate" | "trialEndsAt" | "complimentary">,
  now: Date
): { label: string; tone: "default" | "good" | "bad" | "amber"; urgency: number } {
  // Never invoiced on purpose (your own business, a partner) — nothing to chase.
  if (b.complimentary) return { label: "Complimentary", tone: "default", urgency: 0 };
  if (!b.renewalDueDate) {
    // Still on a trial: the trial badge carries the story, and Record first payment is the next step.
    if (b.trialEndsAt) return { label: "Trial — not billed yet", tone: "default", urgency: 0 };
    // Past the trial (or created directly) with no renewal date: nothing will ever chase or lock
    // this account, which is exactly how a customer ends up using it for free by accident.
    return { label: "Billing not set up", tone: "amber", urgency: 2 };
  }
  const days = daysUntil(b.renewalDueDate, now);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, tone: "bad", urgency: 3 };
  if (days <= DUE_SOON_DAYS) return { label: days === 0 ? "Due today" : `Due in ${days}d`, tone: "amber", urgency: 2 };
  return { label: `Renews ${new Date(b.renewalDueDate + "T00:00:00Z").toLocaleDateString()}`, tone: "good", urgency: 0 };
}

// Same shape and same "flag, don't act" philosophy as renewalStatus below,
// for the other clock a business can be running against: a trial. Kept as
// a separate function (rather than folded into renewalStatus) because the
// two are independent — a business can be mid-trial with no billing set up
// yet at all, or on a normal billing cycle with no trial in its history —
// and conflating them would make "what does urgency 3 mean" ambiguous.
function trialStatus(
  b: Pick<AdminBusinessSummary, "trialEndsAt" | "autoLocked">,
  now: Date
): { label: string; tone: "default" | "good" | "bad" | "amber"; urgency: number } | null {
  if (!b.trialEndsAt) return null;
  const days = daysUntil(b.trialEndsAt, now);
  if (days < 0) {
    return {
      label: `Trial ended ${Math.abs(days)}d ago · ${b.autoLocked ? "locked" : "grace period"}`,
      tone: "bad",
      urgency: 3,
    };
  }
  if (days <= DUE_SOON_DAYS) return { label: days === 0 ? "Trial ends today" : `Trial ends in ${days}d`, tone: "amber", urgency: 2 };
  return { label: `Trial ends ${new Date(b.trialEndsAt + "T00:00:00Z").toLocaleDateString()}`, tone: "default", urgency: 0 };
}

// "Does this account need you today?" — the one definition behind the tab badge,
// the Needs-action filter and the queue order. Suspended accounts are already
// dealt with; complimentary ones never need chasing.
function needsAction(b: AdminBusinessSummary, now: Date): boolean {
  if (b.suspended || b.complimentary) return false;
  return Math.max(renewalStatus(b, now).urgency, trialStatus(b, now)?.urgency ?? 0) >= 2;
}

// ---------------------------------------------------------------------------------------
// "Today" — the admin's landing tab. One screen answering: what needs me right now, how is the
// pipeline doing, and is the automation actually running? It reads the same endpoints the other
// tabs use (no new data model) and hands the real counts to the sidebar badges, which used to stay
// blank until each tab had been opened once.
// ---------------------------------------------------------------------------------------
interface AutomationStatus {
  emailConfigured: boolean;
  adminInboxConfigured: boolean;
  schedulerConfigured: boolean;
  schedulerMode?: "secret" | "open" | "misconfigured";
  autoActivate?: { enabled: boolean; maxPerDay: number };
  durableLinks?: boolean;
  senderProblem?: string | null;
  emailHealth?: { trialConfirmation?: { ok: boolean; reason: string | null; at: string } };
  lastRunAt: number | null;
  lastRun: { remindersSent?: number; digest?: string } | null;
}

interface AutomationRun {
  dryRun: boolean;
  emailConfigured: boolean;
  reminders: { label: string; kind: string; status: string }[];
  nudges?: { label: string; status: string }[];
  neverSignedIn?: { label: string; days: number }[];
  attention: { label: string; reason: string }[];
  waitingLeads: number;
}

const REMINDER_LABELS: Record<string, string> = {
  trial_ending: "trial ending soon",
  trial_ended: "trial ended",
  renewal_due: "renewal due",
  renewal_overdue: "renewal overdue",
};

function agoLabel(ms: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - ms) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function TodayPanel({
  passcode,
  onNavigate,
  onCounts,
}: {
  passcode: string;
  onNavigate: (tab: AdminTab) => void;
  onCounts: (c: { pendingLeads: number; needAction: number }) => void;
}) {
  const [leads, setLeads] = useState<TrialRequest[] | null>(null);
  const [businesses, setBusinesses] = useState<AdminBusinessSummary[] | null>(null);
  const [auto, setAuto] = useState<AutomationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState<"preview" | "run" | null>(null);
  const [runResult, setRunResult] = useState<AutomationRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmLeadId, setConfirmLeadId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setError(null);
    const headers = { "x-admin-passcode": passcode };
    const [leadsRes, bizRes, autoRes] = await Promise.allSettled([
      fetch("/api/trial-requests", { headers }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
      fetch("/api/admin/businesses", { headers }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
      fetch("/api/admin/automation", { headers }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
    ]);
    const nowMs = Date.now();
    setNow(nowMs);
    let pending = 0;
    let needing = 0;
    if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
      const list = leadsRes.value.d.requests as TrialRequest[];
      setLeads(list);
      pending = list.filter((r) => r.status === "pending").length;
    } else setError("Couldn't load trial requests.");
    if (bizRes.status === "fulfilled" && bizRes.value.ok) {
      const list = bizRes.value.d.businesses as AdminBusinessSummary[];
      setBusinesses(list);
      needing = list.filter((b) => needsAction(b, new Date(nowMs))).length;
    } else setError("Couldn't load accounts.");
    // The automation card is a bonus — its failure never hides the rest of the screen.
    if (autoRes.status === "fulfilled" && autoRes.value.ok) setAuto(autoRes.value.d as AutomationStatus);
    onCounts({ pendingLeads: pending, needAction: needing });
  }

  useEffect(() => {
    load();
    // A new lead should appear without anyone pressing reload: refresh every minute while this
    // tab is visible (a hidden tab does nothing, so a forgotten tab costs nothing).
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activate a waiting lead right from Today: login, trial on the plan they asked about, welcome
  // email — the same server call as the Trial requests tab.
  async function activateLead(req: TrialRequest) {
    setActionBusy(req.id);
    setError(null);
    setNotice(null);
    try {
      const interest = parseInterest(req.interestedPlan);
      const result = await provisionBusinessOwner({
        email: req.email,
        ownerName: req.name,
        businessName: req.businessName,
        trialDays: TRIAL_DAYS,
        plan: interest?.tier.id ?? null,
        billingCycle: interest?.cycle ?? "annual",
        requestId: req.id,
        passcode,
      });
      setNotice(
        result.welcomeVia === "branded"
          ? `${result.email} is live — their welcome email is on its way.`
          : result.welcomeVia === "firebase"
          ? `${result.email} is live. Your branded welcome email isn't switched on, so Firebase's standard password email was sent.`
          : `${result.email} is live, but no email could be sent — use “Send sign-in link” on their card.`
      );
      setConfirmLeadId(null);
      await load();
    } catch (err) {
      setError(readableProvisionError(err));
    } finally {
      setActionBusy(null);
    }
  }

  async function sendLink(b: AdminBusinessSummary) {
    setActionBusy(b.businessId);
    setError(null);
    setNotice(null);
    try {
      setNotice(await requestSignInLink(passcode, b));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a sign-in link.");
    } finally {
      setActionBusy(null);
    }
  }

  async function runAutomation(dryRun: boolean) {
    if (!dryRun && !window.confirm("Send every reminder that is due today? Each customer is only ever emailed once per date.")) return;
    setRunBusy(dryRun ? "preview" : "run");
    setRunError(null);
    try {
      const res = await fetch("/api/admin/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't run the automation.");
      setRunResult(data as AutomationRun);
      if (!dryRun) load();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Couldn't run the automation.");
    } finally {
      setRunBusy(null);
    }
  }

  if (!leads && !businesses) {
    return error ? (
      <Card className="max-w-lg mx-auto text-center">
        <div className="text-sm text-bad">{error}</div>
        <Button variant="ghost" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    ) : (
      <div className="text-sm text-muted text-center">Loading today&apos;s picture…</div>
    );
  }

  const nowDate = new Date(now);
  const open = (leads ?? []).filter((r) => r.status === "pending" || r.status === "contacted");
  const pendingLeads = open.filter((r) => r.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const list = businesses ?? [];
  const activeTrials = list.filter((b) => b.trialEndsAt && !b.suspended && !b.complimentary && !b.autoLocked);
  const paying = list.filter((b) => !!b.lastPaidAt && !b.trialEndsAt && !b.complimentary && !b.suspended);
  const attention = list
    .filter((b) => needsAction(b, nowDate))
    .sort(
      (a, b) =>
        Math.max(renewalStatus(b, nowDate).urgency, trialStatus(b, nowDate)?.urgency ?? 0) -
        Math.max(renewalStatus(a, nowDate).urgency, trialStatus(a, nowDate)?.urgency ?? 0)
    );
  // Exactly the figure the Manage accounts tab shows (same rule, same inputs) — two different
  // revenue numbers on one admin page would be worse than none.
  const mrr = monthlyRecurringRevenue(list.filter((b) => !b.suspended && !b.autoLocked));
  const oldest = pendingLeads[0];
  const oldestAge = oldest ? now - oldest.createdAt : 0;
  // Activated more than a day ago and the owner still hasn't signed in: the customers most likely
  // to vanish. The daily job also sends them a fresh link on day 2 and day 6 by itself.
  const neverSignedIn = list
    .filter((b) => b.signedIn === false && !b.suspended && !b.complimentary && b.createdAt != null && now - b.createdAt > DAY_MS)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  // The pipeline from "has an account" to "pays", counted over real customers only (your own and
  // demo accounts are complimentary). Sign-in is "—" when Firebase couldn't be asked.
  const real = list.filter((b) => !b.complimentary);
  const signInKnown = real.some((b) => b.signedIn !== null);
  const funnel = [
    { label: "Activated", n: real.length },
    { label: "Signed in", n: signInKnown ? real.filter((b) => b.signedIn === true).length : null },
    { label: "Logged something", n: real.filter((b) => b.lastActiveAt != null).length },
    { label: "Paying", n: paying.length },
  ];
  const nothingToDo = pendingLeads.length === 0 && attention.length === 0 && neverSignedIn.length === 0;
  const staleRun = !!auto?.schedulerConfigured && !!auto.lastRunAt && now - auto.lastRunAt > 36 * 60 * 60 * 1000;

  const check = (ok: boolean, warn = false) => (
    <span className={clsx("w-4 text-center font-semibold", ok ? "text-good" : warn ? "text-amber" : "text-muted")}>{ok ? "✓" : "–"}</span>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {error && <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>}
      {notice && (
        <div role="status" className="text-xs text-good bg-good/10 border border-good/30 rounded-md px-3 py-2 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-fg shrink-0" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Pipeline at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Leads waiting" value={String(pendingLeads.length)} tone="bad" />
        <StatTile label="Trials running" value={String(activeTrials.length)} />
        <StatTile label="Paying" value={String(paying.length)} />
        <StatTile label="MRR" value={formatMoney(mrr, PLATFORM_CURRENCY)} />
      </div>

      {/* Where customers drop off: activated -> signed in -> actually used it -> paying */}
      {real.length > 0 && (
        <Card>
          <div className="text-xs uppercase tracking-wider text-muted font-medium mb-3">Customer funnel</div>
          <div className="grid grid-cols-4 gap-2">
            {funnel.map((stage) => {
              const pct = stage.n === null || real.length === 0 ? null : Math.round((stage.n / real.length) * 100);
              return (
                <div key={stage.label} className="min-w-0">
                  <div className="num text-lg font-semibold text-fg">{stage.n ?? "—"}</div>
                  <div className="text-[11px] text-muted truncate">{stage.label}</div>
                  <div className="h-1 rounded-full bg-line mt-1.5 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-overview" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                  <div className="text-[10px] text-muted mt-1">{pct === null ? "" : `${pct}%`}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* What needs the admin, in order */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Needs you today</div>
        {nothingToDo ? (
          <Card>
            <div className="text-sm text-good font-medium">All clear ✓</div>
            <div className="text-xs text-muted mt-1">
              No leads waiting and no account needs chasing. Customers are reminded automatically before a trial ends or a
              renewal is due.
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {pendingLeads.length > 0 && (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">
                      {pendingLeads.length} trial request{pendingLeads.length === 1 ? "" : "s"} waiting
                    </div>
                    <div className={clsx("text-xs mt-0.5", oldestAge > 2 * DAY_MS ? "text-bad" : oldestAge > DAY_MS ? "text-amber" : "text-muted")}>
                      Oldest: {oldest.businessName || oldest.name} — waiting {waitingLabel(oldest.createdAt, now)}
                    </div>
                  </div>
                  <Button onClick={() => onNavigate("requests")}>Open queue</Button>
                </div>
                <div className="mt-3 pt-3 border-t border-line space-y-2.5">
                  {pendingLeads.slice(0, 3).map((r) => {
                    const interest = parseInterest(r.interestedPlan);
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-fg truncate">{r.businessName || r.name}</div>
                          <div className="text-[11px] text-muted truncate">
                            {r.name} · waiting {waitingLabel(r.createdAt, now)}
                            {interest ? ` · ${interest.tier.name}${interest.cycle ? ` ${interest.cycle}` : ""}` : ""}
                          </div>
                        </div>
                        {r.hasAccount ? (
                          <span className="text-[11px] text-bad shrink-0">Already has a login</span>
                        ) : confirmLeadId === r.id ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button disabled={actionBusy === r.id} onClick={() => activateLead(r)}>
                              {actionBusy === r.id ? "Activating…" : "Confirm"}
                            </Button>
                            <Button variant="ghost" disabled={actionBusy === r.id} onClick={() => setConfirmLeadId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button className="shrink-0" onClick={() => setConfirmLeadId(r.id)}>
                            Activate
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {pendingLeads.length > 3 && (
                    <button
                      type="button"
                      onClick={() => onNavigate("requests")}
                      className="text-xs text-muted hover:text-fg underline underline-offset-2 min-h-[44px] sm:min-h-0"
                    >
                      +{pendingLeads.length - 3} more in Trial requests
                    </button>
                  )}
                  {confirmLeadId && (
                    <div className="text-[11px] text-amber">
                      Confirm creates the account, starts a {TRIAL_DAYS}-day trial and emails them a welcome message with a link to choose their password.
                    </div>
                  )}
                </div>
              </Card>
            )}
            {attention.slice(0, 6).map((b) => {
              const r = renewalStatus(b, nowDate);
              const t = trialStatus(b, nowDate);
              const worst = (t?.urgency ?? 0) >= r.urgency && t ? t : r;
              return (
                <Card key={b.businessId}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{b.businessName || b.ownerName}</div>
                      <div className="mt-1">
                        <Badge tone={worst.tone}>{worst.label}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => onNavigate("manage")}>
                      Manage
                    </Button>
                  </div>
                </Card>
              );
            })}
            {attention.length > 6 && (
              <button type="button" onClick={() => onNavigate("manage")} className="text-xs text-muted hover:text-fg underline underline-offset-2 min-h-[44px] sm:min-h-0">
                +{attention.length - 6} more in Manage accounts
              </button>
            )}
            {neverSignedIn.length > 0 && (
              <Card>
                <div className="text-sm font-medium text-fg">
                  {neverSignedIn.length} {neverSignedIn.length === 1 ? "customer hasn't" : "customers haven't"} signed in yet
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  They get a fresh link automatically after 2 and 6 days. Send one now if you&apos;d rather not wait.
                </div>
                <div className="mt-3 pt-3 border-t border-line space-y-2.5">
                  {neverSignedIn.slice(0, 4).map((b) => (
                    <div key={b.businessId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-fg truncate">{b.businessName || b.ownerName}</div>
                        <div className="text-[11px] text-muted truncate">
                          {b.ownerEmail} · activated {waitingLabel(b.createdAt as number, now)} ago
                        </div>
                      </div>
                      <Button variant="ghost" className="shrink-0" disabled={actionBusy === b.businessId} onClick={() => sendLink(b)}>
                        {actionBusy === b.businessId ? "Sending…" : "Send sign-in link"}
                      </Button>
                    </div>
                  ))}
                  {neverSignedIn.length > 4 && (
                    <button
                      type="button"
                      onClick={() => onNavigate("manage")}
                      className="text-xs text-muted hover:text-fg underline underline-offset-2 min-h-[44px] sm:min-h-0"
                    >
                      +{neverSignedIn.length - 4} more in Manage accounts
                    </button>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Automation: what runs by itself, and proof that it is alive */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Automation</div>
        <Card>
          {auto ? (
            <>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  {check(auto.emailConfigured)}
                  <span className="text-fg">Customer emails</span>
                  <span className="text-xs text-muted">
                    {auto.emailConfigured ? "on — welcome, receipts, trial and renewal reminders" : "off — set RESEND_API_KEY and TRIAL_NOTIFICATION_FROM_EMAIL"}
                  </span>
                </div>
                {auto.senderProblem && <div className="pl-6 text-xs text-amber">{auto.senderProblem}</div>}
                {auto.emailHealth?.trialConfirmation && (
                  <div className={clsx("pl-6 text-xs", auto.emailHealth.trialConfirmation.ok ? "text-muted" : "text-amber")}>
                    Last trial confirmation {auto.emailHealth.trialConfirmation.ok ? "sent" : "failed"} {agoLabel(Date.parse(auto.emailHealth.trialConfirmation.at), now)}
                    {!auto.emailHealth.trialConfirmation.ok && auto.emailHealth.trialConfirmation.reason ? ` — ${auto.emailHealth.trialConfirmation.reason}` : ""}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {check(auto.adminInboxConfigured)}
                  <span className="text-fg">Your morning digest</span>
                  <span className="text-xs text-muted">
                    {auto.adminInboxConfigured ? "on — new leads and the daily summary reach your inbox" : "off — set ADMIN_NOTIFICATION_EMAIL (or NEXT_PUBLIC_SUPPORT_EMAIL, which is used when it is blank)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {check(auto.schedulerConfigured && !staleRun, staleRun)}
                  <span className="text-fg">Daily reminders</span>
                  <span className={clsx("text-xs", staleRun ? "text-amber" : "text-muted")}>
                    {!auto.schedulerConfigured
                      ? "off — CRON_SECRET is set but too short (use 16+ characters, or remove it)"
                      : auto.lastRunAt
                      ? staleRun
                        ? `last ran ${agoLabel(auto.lastRunAt, now)} — check the scheduler`
                        : `last ran ${agoLabel(auto.lastRunAt, now)}${
                            auto.lastRun?.remindersSent != null ? ` · ${auto.lastRun.remindersSent} reminder${auto.lastRun.remindersSent === 1 ? "" : "s"} sent` : ""
                          }`
                      : `on${auto.schedulerMode === "open" ? " without a CRON_SECRET (works; set one to lock the URL down)" : ""} — hasn't run yet (first run is at the next scheduled time)`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {check(auto.durableLinks !== false)}
                  <span className="text-fg">Sign-in links</span>
                  <span className="text-xs text-muted">
                    {auto.durableLinks !== false
                      ? "on — the link in the welcome email stays valid for 7 days"
                      : "limited — links last about an hour (set LINK_SIGNING_SECRET)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {check(!!auto.autoActivate?.enabled)}
                  <span className="text-fg">Instant activation</span>
                  <span className="text-xs text-muted">
                    {auto.autoActivate?.enabled
                      ? `on — new requests get their account straight away (max ${auto.autoActivate.maxPerDay}/day)`
                      : "off — you press Activate (set AUTO_ACTIVATE_TRIALS=true to skip that step)"}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-muted mt-3 pt-3 border-t border-line leading-relaxed">
                Automatic: welcome email on activation · receipt when you record a payment · notice when a trial is extended or an
                account switched back on · fresh sign-in link on day 2 and 6 if they haven&apos;t signed in · reminder 3 days before a trial ends and 7 days before a renewal · overdue notice. It never
                locks, charges or deletes anything — you stay in control of money and access.
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button variant="ghost" disabled={runBusy !== null} onClick={() => runAutomation(true)}>
                  {runBusy === "preview" ? "Checking…" : "Preview today’s emails"}
                </Button>
                <Button variant="ghost" disabled={runBusy !== null || !auto.emailConfigured} onClick={() => runAutomation(false)}>
                  {runBusy === "run" ? "Sending…" : "Send due reminders now"}
                </Button>
              </div>
              {runError && <div role="alert" className="text-xs text-bad mt-2">{runError}</div>}
              {runResult && (
                <div className="mt-3 text-xs text-muted space-y-1">
                  <div className="text-fg font-medium">
                    {runResult.dryRun ? "Preview — nothing was sent." : "Done."}{" "}
                    {runResult.reminders.length === 0 && (runResult.nudges ?? []).length === 0
                      ? "No customer reminder is due today."
                      : `${runResult.reminders.length} customer reminder${runResult.reminders.length === 1 ? "" : "s"} ${runResult.dryRun ? "would go out" : "processed"}:`}
                  </div>
                  {runResult.reminders.map((r, i) => (
                    <div key={i}>
                      • {r.label} — {REMINDER_LABELS[r.kind] ?? r.kind}
                      {!runResult.dryRun && r.status !== "sent" ? ` (${r.status === "not_configured" ? "email is off" : r.status.replace("_", " ")})` : ""}
                    </div>
                  ))}
                  {(runResult.nudges ?? []).map((n, i) => (
                    <div key={`n${i}`}>
                      • {n.label} — sign-in reminder with a fresh link
                      {!runResult.dryRun && n.status !== "sent" ? ` (${n.status === "not_configured" ? "email is off" : n.status.replace("_", " ")})` : ""}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted">Couldn&apos;t load the automation status — everything else on this screen still works.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Lists every business and lets the admin work the renewal end of the
// pipeline: suspend/reactivate access without touching data (the one
// lever firestore.rules deliberately keeps out of the app itself — see
// the meta/account rule and AccountStatus in lib/types.ts), and record
// billing by hand against the same doc — no payment gateway anywhere in
// this project, so "mark paid" and a renewal date are the entire billing
// system. Businesses are sorted overdue-first so this doubles as the
// admin's renewal queue, not just a directory.
// "Set password" (pass 305): sets an owner's password directly from the admin panel, with no email link.
// The password is sent once, cleared after saving, and never shown again.
// Creates the key a POS signs its daily sales with (pass 309). Shown once.
function PosKeyRow({ passcode, businessId }: { passcode: string; businessId: string }) {
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function generate() {
    if (!window.confirm("Create a new POS key? A POS still using the old key will stop working.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/pos-key`, {
        method: "POST",
        headers: { "x-admin-passcode": passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the POS key.");
      setSecret(data.secret);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create the POS key.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-1 text-[11px] text-muted">
      <button type="button" disabled={busy} onClick={generate} className="underline underline-offset-2 disabled:opacity-50">
        {busy ? "Creating…" : "POS key"}
      </button>
      {secret && (
        <div className="mt-1 break-all font-mono text-fg rounded bg-black/5 dark:bg-white/5 p-2">
          {secret}
          <div className="mt-1 font-sans">Copy it now. It is shown once.</div>
        </div>
      )}
      {msg && <div className="mt-1">{msg}</div>}
    </div>
  );
}

function SetPasswordRow({ passcode, businessId, email }: { passcode: string; businessId: string; email: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ password: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't set the password.");
      setValue("");
      setMsg(`Password set for ${email}. Send it to them, and they sign in at ${window.location.origin}/login.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't set the password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-[240px]"
        />
        <Button variant="ghost" disabled={busy || value.length < 8} onClick={save}>
          {busy ? "Saving…" : "Set password"}
        </Button>
      </div>
      {msg && <div className="text-[11px] text-fg">{msg}</div>}
      {err && <div className="text-[11px] text-bad">{err}</div>}
    </div>
  );
}

// The operator's own DeepSeek key, saved from the admin panel (pass 308). Encrypted; never shown back in full.
function OperatorAiKeyCard({ passcode }: { passcode: string }) {
  const [hint, setHint] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function refresh() {
    try {
      const res = await fetch("/api/admin/operator-ai-key", { headers: { "x-admin-passcode": passcode } });
      const data = await res.json();
      setHint(res.ok ? (data.hint ?? null) : null);
    } catch {
      setHint(null);
    }
  }
  useEffect(() => { void refresh(); }, [passcode]);
  async function save(clear: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/operator-ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ deepseekKey: clear ? "" : draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the key.");
      setDraft("");
      setMsg(clear ? "Removed." : "Saved. Admin accounts now use this key.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-line p-3 space-y-2 text-sm">
      <div className="font-medium">Operator DeepSeek key</div>
      <div className="text-[11px] text-muted">
        Used only by admin accounts (and any listed in AI_OPERATOR_BUSINESS_IDS). {hint ? `Current key ends ${hint}.` : "No key saved yet."}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-…" />
        <button type="button" disabled={busy || !draft.trim()} onClick={() => save(false)} className="px-3 py-2 rounded-md border border-line text-xs disabled:opacity-50">Save key</button>
        {hint && (
          <button type="button" disabled={busy} onClick={() => save(true)} className="px-3 py-2 rounded-md border border-line text-xs disabled:opacity-50">Remove</button>
        )}
      </div>
      {msg && <div className="text-[11px] text-muted">{msg}</div>}
    </div>
  );
}

function ManageAccountsPanel({
  passcode,
  onBillingAlertCountChange,
}: {
  passcode: string;
  onBillingAlertCountChange: (count: number) => void;
}) {
  const [businesses, setBusinesses] = useState<AdminBusinessSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A positive confirmation of what the system just did for the customer ("they've been emailed").
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [expandedBillingId, setExpandedBillingId] = useState<string | null>(null);
  // Which card has its Record-payment form / payment history open (one of each at a time),
  // and a counter that makes an open history list reload after a payment is recorded or undone.
  const [recordId, setRecordId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [search, setSearch] = useState("");
  // Accounts ticked for a bulk action (pass 308).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "action" | "trial" | "paying" | "locked">("all");

  // Recomputed each render is fine — this is a display-only reference
  // point rebuilt at most as often as a re-render happens, not a formula.
  const now = new Date();

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/businesses", {
        headers: { "x-admin-passcode": passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load accounts.");
      const list: AdminBusinessSummary[] = data.businesses;
      setBusinesses(list);
      onBillingAlertCountChange(list.filter((b) => needsAction(b, new Date())).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Permanent: removes the business and all its data. Needs the business ID typed exactly.
  async function deleteBusiness(b: AdminBusinessSummary) {
    const typed = prompt(`This permanently deletes ${b.businessName || b.ownerName} and ALL its data. There is no undo.\n\nTo confirm, type the business ID:\n${b.businessId}`);
    if (typed === null) return;
    setBusyId(b.businessId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/businesses/${b.businessId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete this account.");
      setNotice(`${b.businessName || b.ownerName} was deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete this account.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuspend(b: AdminBusinessSummary) {
    if (!b.suspended) {
      const label = b.businessName || b.ownerName;
      if (!confirm(`Suspend ${label}? They'll immediately lose access until reactivated.`)) return;
    }
    setBusyId(b.businessId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/businesses/${b.businessId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify(
          b.suspended ? { suspended: false } : { suspended: true, reason: reasonDraft[b.businessId] ?? "" }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update this account.");
      setNotice(data.reactivationEmail === "sent" ? `${b.businessName || b.ownerName} is back on — they've been emailed.` : null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update this account.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveTrial(businessId: string, patch: { extendDays: number } | { clear: true }) {
    setBusyId(businessId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update the trial.");
      setNotice(data.trialEmail === "sent" ? "Trial extended — they've been emailed the new end date." : null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the trial.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendSignInLink(b: AdminBusinessSummary) {
    setBusyId(b.businessId);
    setError(null);
    setNotice(null);
    try {
      setNotice(await requestSignInLink(passcode, b));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a sign-in link.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveBilling(businessId: string, patch: Record<string, unknown>) {
    setBusyId(businessId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update billing.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update billing.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !businesses) {
    return (
      <Card className="max-w-lg mx-auto text-center">
        <div className="text-sm text-bad">{error}</div>
        <Button variant="ghost" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!businesses) {
    return <div className="text-sm text-muted text-center">Loading accounts…</div>;
  }

  // Working queue order, not creation order: whichever account needs the
  // admin's attention next (overdue, then due soon, then everything else)
  // floats to the top — the same "full pipeline" idea as the Trial
  // requests tab's pending/resolved split, just for the renewal end of it.
  const sorted = [...businesses].sort((a, b) => {
    const ua = Math.max(renewalStatus(a, now).urgency, trialStatus(a, now)?.urgency ?? 0);
    const ub = Math.max(renewalStatus(b, now).urgency, trialStatus(b, now)?.urgency ?? 0);
    if (ua !== ub) return ub - ua;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });

  // Client-side filter over the already-sorted queue — the list is small
  // enough (one fetch, no pagination) that this is just a plain string
  // match, not a search feature in its own right. Doesn't touch queue
  // order or the stat tiles below, which stay based on every account.
  const isLockedAcct = (b: AdminBusinessSummary) => b.suspended || b.autoLocked;
  const isTrialAcct = (b: AdminBusinessSummary) => !isLockedAcct(b) && !!b.trialEndsAt;
  const isPayingAcct = (b: AdminBusinessSummary) => !isLockedAcct(b) && !b.trialEndsAt && !b.complimentary;
  const filterCounts = {
    all: sorted.length,
    action: sorted.filter((b) => needsAction(b, now)).length,
    trial: sorted.filter(isTrialAcct).length,
    paying: sorted.filter(isPayingAcct).length,
    locked: sorted.filter(isLockedAcct).length,
  };
  const byFilter = sorted.filter((b) =>
    filter === "action"
      ? needsAction(b, now)
      : filter === "trial"
      ? isTrialAcct(b)
      : filter === "paying"
      ? isPayingAcct(b)
      : filter === "locked"
      ? isLockedAcct(b)
      : true
  );
  const query = search.trim().toLowerCase();
  const filtered = query
    ? byFilter.filter((b) =>
        [b.businessName, b.ownerName, b.ownerEmail].some((v) => v?.toLowerCase().includes(query))
      )
    : byFilter;

  // A glance-able summary of the whole book, not another queue — this
  // deliberately doesn't factor in urgency/sort order below it, just plain
  // counts and a revenue total so "how's the business doing" doesn't
  // require mentally tallying the cards underneath. MRR normalizes annual
  // plans to a monthly figure (÷12) purely for this one number; nothing
  // else in the app treats annual and monthly billing as equivalent.
  const activeBusinesses = businesses.filter((b) => !b.suspended && !b.autoLocked);
  const trialCount = activeBusinesses.filter((b) => !!b.trialEndsAt).length;
  // Trials that reached a decision: converted, or ran out without converting. Still-running
  // trials aren't counted either way. Accounts converted before this was tracked aren't included.
  const convertedCount = businesses.filter((b) => b.convertedAt != null).length;
  const lostCount = businesses.filter(
    (b) => b.convertedAt == null && !!b.trialEndsAt && daysUntil(b.trialEndsAt, now) < 0
  ).length;
  const conversionLabel =
    convertedCount + lostCount > 0 ? `${Math.round((convertedCount / (convertedCount + lostCount)) * 100)}%` : "—";
  const atRiskTrials = businesses.filter(
    (b) => isIdleTrial(b, now) && daysUntil(b.trialEndsAt as string, now) <= 5
  ).length;
  const overdueCount = activeBusinesses.filter((b) => renewalStatus(b, now).urgency === 3).length;
  // Only accounts that actually pay: a free trial carries its plan's list price as a
  // default and a complimentary account may too, so summing every amount overstated
  // revenue. The rule lives in lib/billing.ts (verified by scripts/verify-billing.ts).
  const mrr = monthlyRecurringRevenue(activeBusinesses);

  async function setAdminAccounts(adminAccount: boolean) {
    if (picked.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/businesses/bulk-admin-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ businessIds: [...picked], adminAccount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update those accounts.");
      setNotice(`${data.updated} account${data.updated === 1 ? "" : "s"} ${adminAccount ? "marked as admin accounts (never billed)" : "unmarked"}.`);
      setPicked(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update those accounts.");
    } finally {
      setBulkBusy(false);
    }
  }
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {notice && (
        <div role="status" className="text-xs text-good bg-good/10 border border-good/30 rounded-md px-3 py-2">{notice}</div>
      )}
      {error && (
        <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
      )}
      {businesses.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
          <StatTile label="Active" value={String(activeBusinesses.length)} />
          <StatTile label="On trial" value={String(trialCount)} />
          <StatTile label="Overdue" value={String(overdueCount)} tone={overdueCount > 0 ? "bad" : "default"} />
          <StatTile label="MRR" value={formatMoney(mrr, PLATFORM_CURRENCY)} />
          <StatTile label="Trial → paid" value={conversionLabel} />
        </div>
      )}
      {atRiskTrials > 0 && (
        <div className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-md px-3 py-2">
          {atRiskTrials} trial{atRiskTrials === 1 ? "" : "s"} ending within 5 days with nothing logged yet —
          worth a personal message (use Copy reminder on the card).
        </div>
      )}
      {businesses.length > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => exportAccountsCsv(sorted, now)}>
            Export accounts (CSV)
          </Button>
        </div>
      )}
      {businesses.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-touch pb-0.5" role="tablist" aria-label="Filter accounts">
          {(
            [
              ["all", "All"],
              ["action", "Needs action"],
              ["trial", "Trials"],
              ["paying", "Paying"],
              ["locked", "Locked"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={clsx(
                "shrink-0 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-full border text-xs transition-colors",
                filter === key
                  ? key === "action" && filterCounts.action > 0
                    ? "bg-bad/15 border-bad/40 text-bad font-medium"
                    : "bg-panel2 border-muted text-fg font-medium"
                  : "border-line text-muted hover:text-fg hover:border-muted"
              )}
            >
              {label} <span className="num opacity-80">{filterCounts[key]}</span>
            </button>
          ))}
        </div>
      )}
      <OperatorAiKeyCard passcode={passcode} />
      {picked.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-line p-2 text-xs">
          <span className="text-muted">{picked.size} selected</span>
          <button type="button" disabled={bulkBusy} onClick={() => setAdminAccounts(true)} className="px-3 py-1.5 rounded-md border border-line disabled:opacity-50">Mark as admin accounts</button>
          <button type="button" disabled={bulkBusy} onClick={() => setAdminAccounts(false)} className="px-3 py-1.5 rounded-md border border-line disabled:opacity-50">Remove admin status</button>
          <button type="button" onClick={() => setPicked(new Set())} className="px-3 py-1.5 text-muted underline">Clear</button>
        </div>
      )}
      {businesses.length > 3 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, owner, or email…"
        />
      )}
      {sorted.length === 0 && (
        <div className="text-sm text-muted text-center">No accounts yet.</div>
      )}
      {sorted.length > 0 && filtered.length === 0 && (
        <div className="text-sm text-muted text-center py-4">
          {query
            ? <>No accounts match &quot;{search}&quot;.</>
            : filter === "action"
            ? "Nothing needs you right now. 🎉"
            : "No accounts in this view."}
        </div>
      )}
      {filtered.map((b) => {
        const status = renewalStatus(b, now);
        const trial = trialStatus(b, now);
        return (
          <Card key={b.businessId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg truncate">
                  {b.businessName || b.ownerName}
                </div>
                <div className="text-xs text-muted mt-0.5 truncate">
                  {b.ownerName} · {b.ownerEmail}
                </div>
                <div className={`text-[11px] mt-0.5 ${isIdleTrial(b, now) ? "text-amber" : "text-muted"}`}>
                  {activityLabel(b.lastActiveAt, now)}
                </div>
                {b.aiMonth && (
                  <div className="text-[11px] mt-0.5 text-muted" title="AI Assistant use this month (UTC). The cost is an estimate at the provider's peak list price, so it errs high.">
                    AI this month: {b.aiMonth.turns} message{b.aiMonth.turns === 1 ? "" : "s"} · ~${b.aiMonth.estCostUsd < 0.01 ? "<0.01" : b.aiMonth.estCostUsd.toFixed(2)}
                  </div>
                )}
                {(() => {
                  const ex = b.health ? healthExceptions(b.health, todayIso()) : [];
                  if (!b.health) {
                    return <div className="text-[11px] mt-0.5 text-muted" title="The owner's app writes a small summary once a day while it is open.">No health summary yet</div>;
                  }
                  if (ex.length === 0) return <div className="text-[11px] mt-0.5 text-muted">Health summary {b.health.asOf}: nothing stands out</div>;
                  return (
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {ex.map((e) => (
                        <Badge key={e.code} tone="amber">{e.text}</Badge>
                      ))}
                    </div>
                  );
                })()}
                {(() => {
                  const seats = seatCheck(b.plan, b.activeLogins);
                  if (!seats) return null;
                  return (
                    <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap text-muted" title="Active logins, owner included. Advisory: nothing is blocked. A plan with no stated number is never flagged.">
                      Logins: {seats.used}{seats.guide != null ? ` of ${seats.guide} on ${b.plan}` : ""}
                      {seats.over && <Badge tone="amber">Over plan: upgrade talk</Badge>}
                    </div>
                  );
                })()}
                {b.signedIn === false && !b.complimentary && (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <Badge tone="amber">Never signed in</Badge>
                    <button
                      type="button"
                      disabled={busyId === b.businessId}
                      onClick={() => sendSignInLink(b)}
                      className="text-[11px] text-muted hover:text-fg underline underline-offset-2 min-h-[44px] sm:min-h-0"
                    >
                      {busyId === b.businessId ? "Sending…" : "Send sign-in link"}
                    </button>
                  </div>
                )}
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked.has(b.businessId)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(b.businessId); else next.delete(b.businessId);
                        return next;
                      });
                    }}
                  />
                  Select{b.adminAccount ? " · admin account (never billed)" : ""}
                </label>
                <PosKeyRow key={`pos-${b.businessId}`} passcode={passcode} businessId={b.businessId} />
                <SetPasswordRow key={`pw-${b.businessId}`} passcode={passcode} businessId={b.businessId} email={b.ownerEmail} />
                {b.notes && <div className="text-xs text-muted mt-1 italic truncate">{b.notes}</div>}
                {b.suspended && (
                  <div className="text-xs text-bad mt-1.5">
                    Suspended{b.reason ? ` — ${b.reason}` : ""}
                  </div>
                )}
                {!b.suspended && b.autoLocked && (
                  <div className="text-xs text-bad mt-1.5">
                    {b.autoLockKind === "renewal_overdue"
                      ? "Locked automatically — renewal overdue. Press Record payment below (or move the renewal date in Edit billing) to let them back in."
                      : "Locked automatically — trial ended. Extend the trial or press Record first payment below to let them back in."}
                  </div>
                )}
              </div>
              <Button
                variant={b.suspended ? "primary" : "danger"}
                disabled={busyId === b.businessId}
                onClick={() => toggleSuspend(b)}
                className="shrink-0"
              >
                {busyId === b.businessId ? "Working…" : b.suspended ? "Reactivate" : "Suspend"}
              </Button>
              <Button
                variant="danger"
                disabled={busyId === b.businessId}
                onClick={() => deleteBusiness(b)}
                className="shrink-0"
              >
                Delete
              </Button>
            </div>
            {!b.suspended && (
              <Input
                className="mt-3"
                placeholder="Reason shown to them (optional)"
                value={reasonDraft[b.businessId] ?? ""}
                onChange={(e) => setReasonDraft((prev) => ({ ...prev, [b.businessId]: e.target.value }))}
              />
            )}

            {/* Trial — an expired trial locks itself automatically after a
                short grace period (lib/accountAccess.ts). Nothing is
                written on expiry, so Extend / Convert to paid below
                unlock the account instantly with no extra step. */}
            {trial && (
              <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3 flex-wrap">
                <Badge tone={trial.tone}>{trial.label}</Badge>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Button
                    variant="ghost"
                    disabled={busyId === b.businessId}
                    onClick={() => saveTrial(b.businessId, { extendDays: 7 })}
                  >
                    Extend 7 days
                  </Button>
                  <Button
                    disabled={busyId === b.businessId}
                    onClick={() => setRecordId(recordId === b.businessId ? null : b.businessId)}
                  >
                    Record first payment
                  </Button>
                </div>
              </div>
            )}

            {/* Billing — see the billing fields on AccountStatus in lib/types.ts.
                Payments are recorded as records (lib/billing.ts): amount, method,
                reference, and what they replaced, so the latest can be undone. */}
            <div className="mt-3 pt-3 border-t border-line">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-muted">
                    {b.plan || "No plan set"}
                    {b.billingAmount != null
                      ? ` · ${formatMoney(b.billingAmount, PLATFORM_CURRENCY)}${b.billingCycle === "annual" ? "/yr" : "/mo"}`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <CopyReminderButton business={b} now={now} />
                  <EmailReminderLink business={b} now={now} />
                  {!b.complimentary && (
                    <Button
                      variant={status.urgency >= 2 || !!b.trialEndsAt ? "primary" : "ghost"}
                      onClick={() => setRecordId(recordId === b.businessId ? null : b.businessId)}
                    >
                      {recordId === b.businessId ? "Cancel" : "Record payment"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setExpandedBillingId(expandedBillingId === b.businessId ? null : b.businessId)
                    }
                  >
                    {expandedBillingId === b.businessId ? "Close" : "Edit billing"}
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                {b.lastPaidAt && <span>Last paid {new Date(b.lastPaidAt).toLocaleDateString()}</span>}
                {b.renewalDueDate && !b.complimentary && (
                  <span className={b.autoLockOverdue ? "" : "text-amber"}>
                    {b.autoLockOverdue
                      ? "Auto-lock on — locks 7 days after an unpaid renewal"
                      : "Auto-lock off — an overdue renewal only flags"}
                  </span>
                )}
                {!b.complimentary && (
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-fg min-h-[44px] sm:min-h-0"
                    onClick={() => setHistoryId(historyId === b.businessId ? null : b.businessId)}
                  >
                    {historyId === b.businessId ? "Hide payments" : "Payment history"}
                  </button>
                )}
              </div>
              {recordId === b.businessId && (
                <RecordPaymentForm
                  key={b.businessId}
                  business={b}
                  passcode={passcode}
                  onRecorded={() => {
                    setHistoryKey((k) => k + 1);
                    load();
                  }}
                  onCancel={() => setRecordId(null)}
                />
              )}
              {historyId === b.businessId && (
                <PaymentHistory
                  business={b}
                  passcode={passcode}
                  reloadKey={historyKey}
                  onChanged={() => {
                    setHistoryKey((k) => k + 1);
                    load();
                  }}
                />
              )}
              {expandedBillingId === b.businessId && (
                <BillingEditForm
                  business={b}
                  busy={busyId === b.businessId}
                  onSave={(patch) => saveBilling(b.businessId, patch)}
                />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// One number in the "Manage accounts" summary bar above the list.
function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="bg-panel border border-line rounded-lg px-2.5 py-2 text-center">
      <div className={clsx("text-sm font-semibold", tone === "bad" && value !== "0" ? "text-bad" : "text-fg")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted mt-0.5">{label}</div>
    </div>
  );
}

// Inline edit form for a single account's billing fields — opened via
// "Edit billing" on the card above rather than a modal, since the admin
// usually wants to glance at the card it belongs to (name, suspend state)
// while setting it, same reasoning as the inline suspend-reason Input.
// "3d ago" / "today" for the account cards. Null timestamp = never logged anything.
function activityLabel(lastActiveAt: number | null, now: Date): string {
  if (lastActiveAt == null) return "No activity logged yet";
  const days = Math.floor((now.getTime() - lastActiveAt) / DAY_MS);
  if (days <= 0) return "Active today";
  if (days === 1) return "Last active yesterday";
  return `Last active ${days}d ago`;
}

// A trial still running whose owner has logged nothing — the customers most worth
// a personal nudge, because they haven't reached the moment the product proves itself.
function isIdleTrial(b: AdminBusinessSummary, now: Date): boolean {
  if (!b.trialEndsAt || b.suspended || b.autoLocked || b.lastActiveAt != null) return false;
  return daysUntil(b.trialEndsAt, now) >= 0;
}

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A ready-to-send, polite nudge for whichever thing needs chasing on this
// account — copied to the clipboard, sent by whatever channel you already use
// (WhatsApp, email, a call). Nothing is sent from here. Null when there is
// nothing time-sensitive, so the button only appears when it's useful.
function reminderMessage(b: AdminBusinessSummary, now: Date): string | null {
  const first = (b.ownerName || b.businessName || "there").trim().split(/\s+/)[0];
  if (b.complimentary) return null;
  // Where to send the money. Set once in NEXT_PUBLIC_PAYMENT_INSTRUCTIONS (bank name,
  // account, reference to quote) and it rides along on every reminder, so nobody has to
  // ask "how do I pay?" and you never retype it. Also shown on the customer's plan card.
  const how = PAYMENT_INSTRUCTIONS ? ` To pay: ${PAYMENT_INSTRUCTIONS}` : "";

  if (b.trialEndsAt) {
    const days = daysUntil(b.trialEndsAt, now);
    if (days < 0) {
      return `Hi ${first}, your Balancr trial ended on ${longDate(b.trialEndsAt)}. If you'd like to keep using it, just let me know and I'll get your plan set up.${how} Your data is safe, and you can download a copy of it any time.`;
    }
    if (days <= 3) {
      return `Hi ${first}, a quick heads-up that your Balancr trial ${
        days === 0 ? "ends today" : `ends on ${longDate(b.trialEndsAt)}`
      }. ${
        b.lastActiveAt == null
          ? "I noticed you haven't logged anything yet — happy to walk you through it in 10 minutes so you can see whether it fits. "
          : ""
      }If you'd like to continue afterwards, let me know and I'll set up your plan.${how}`;
    }
    // Mid-trial and nothing logged: help them get started rather than ask for money.
    const ageDays = b.createdAt ? Math.floor((now.getTime() - b.createdAt) / DAY_MS) : 0;
    if (b.lastActiveAt == null && ageDays >= 2) {
      return `Hi ${first}, hope you're settling in with Balancr! I noticed you haven't added anything yet — if it helps, I can walk you through setting up your products and your first few sales in about 10 minutes. Just tell me a time that suits you.`;
    }
  }

  if (b.renewalDueDate) {
    const days = daysUntil(b.renewalDueDate, now);
    if (days <= DUE_SOON_DAYS) {
      const what = `${b.plan ? `${b.plan} ` : ""}renewal${
        b.billingAmount != null ? ` of ${formatMoney(b.billingAmount, PLATFORM_CURRENCY)}` : ""
      }`;
      return days < 0
        ? `Hi ${first}, a friendly reminder that your Balancr ${what} was due on ${longDate(b.renewalDueDate)}.${how} Once payment is made, send me a quick note and I'll update your account right away. Thank you!`
        : `Hi ${first}, a friendly reminder that your Balancr ${what} is due ${
            days === 0 ? "today" : `on ${longDate(b.renewalDueDate)}`
          }.${how} Once payment is made, send me a quick note and I'll update your account. Thank you!`;
    }
  }
  return null;
}

function CopyReminderButton({ business, now }: { business: AdminBusinessSummary; now: Date }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const message = reminderMessage(business, now);
  if (!message) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message as string);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <Button variant="ghost" onClick={copy} title={message}>
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : "Copy reminder"}
    </Button>
  );
}

// Same message as Copy reminder, opened in the admin's own mail app addressed to the
// owner — one tap instead of copy, switch app, find the customer, paste. Nothing is sent
// from here; the admin still presses Send.
function EmailReminderLink({ business, now }: { business: AdminBusinessSummary; now: Date }) {
  const message = reminderMessage(business, now);
  if (!message || !business.ownerEmail || business.ownerEmail === "(unknown)") return null;
  const subject = business.renewalDueDate && !business.trialEndsAt ? "Your Balancr renewal" : "Your Balancr trial";
  return (
    <a
      href={`mailto:${business.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
      className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-md text-sm font-medium border border-line text-fg hover:border-muted transition-all active:scale-[0.98]"
    >
      Email
    </a>
  );
}

// A name typed by a customer could start with = + - @ and be run as a formula
// when this CSV is opened in Excel/Sheets; a leading apostrophe defuses it.
function csvSafe(v: string | number | null | undefined): string {
  const t = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

function exportAccountsCsv(list: AdminBusinessSummary[], now: Date) {
  const rows = list.map((b) => ({
    business: csvSafe(b.businessName),
    owner: csvSafe(b.ownerName),
    email: csvSafe(b.ownerEmail),
    status: b.suspended
      ? "Suspended"
      : b.complimentary
      ? "Complimentary"
      : b.autoLocked
      ? b.autoLockKind === "renewal_overdue"
        ? "Locked (renewal overdue)"
        : "Locked (trial ended)"
      : b.trialEndsAt
      ? "Trial"
      : "Active",
    plan: csvSafe(b.plan),
    amount: b.billingAmount ?? "",
    cycle: b.billingCycle ?? "",
    renewal_due: b.renewalDueDate ?? "",
    last_paid: b.lastPaidAt ? new Date(b.lastPaidAt).toISOString().slice(0, 10) : "",
    trial_ends: b.trialEndsAt ?? "",
    converted: b.convertedAt ? new Date(b.convertedAt).toISOString().slice(0, 10) : "",
    last_active: b.lastActiveAt ? new Date(b.lastActiveAt).toISOString().slice(0, 10) : "",
    last_sign_in: b.lastSignInAt ? new Date(b.lastSignInAt).toISOString().slice(0, 10) : b.signedIn === false ? "never" : "",
    created: b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : "",
    active_logins: b.activeLogins ?? "",
    needs_attention: b.health ? healthExceptions(b.health, todayIso()).map((e) => e.text).join("; ") : "",
    ai_msgs_this_month: b.aiMonth?.turns ?? 0,
    ai_est_usd_this_month: b.aiMonth ? Number(b.aiMonth.estCostUsd.toFixed(4)) : 0,
  }));
  downloadCsv(`balancr-accounts-${now.toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

function BillingEditForm({
  business,
  busy,
  onSave,
}: {
  business: AdminBusinessSummary;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  // Plan is a pick-list of the public plans (lib/pricing.ts) so the name always
  // matches what the website shows, with "Other" for a negotiated one-off. The
  // amount follows the plan and cycle as a suggestion — never forced.
  const OTHER = "__other__";
  const existingTier = tierById(business.plan);
  const [planChoice, setPlanChoice] = useState<string>(existingTier ? existingTier.id : business.plan ? OTHER : "");
  const [customPlan, setCustomPlan] = useState(existingTier ? "" : business.plan ?? "");
  const [amount, setAmount] = useState(business.billingAmount != null ? String(business.billingAmount) : "");
  const [cycle, setCycle] = useState<NonNullable<AccountStatus["billingCycle"]>>(business.billingCycle ?? "monthly");
  const [renewalDueDate, setRenewalDueDate] = useState(business.renewalDueDate ?? "");
  const [notes, setNotes] = useState(business.notes ?? "");
  const [autoLockOverdue, setAutoLockOverdue] = useState(business.autoLockOverdue);
  const [complimentary, setComplimentary] = useState(business.complimentary);

  function suggest(nextPlan: string, nextCycle: BillingCycle) {
    const t = tierById(nextPlan);
    if (t) setAmount(String(periodAmount(t, nextCycle)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Complimentary is its own state: no plan/amount/date, nothing to chase or lock.
    if (complimentary) {
      onSave({ complimentary: true, notes: notes.trim() });
      return;
    }
    const planName = (planChoice === OTHER ? customPlan : planChoice).trim();
    const parsedAmount = amount.trim() === "" ? undefined : Number(amount);
    onSave({
      ...(business.complimentary ? { complimentary: false } : {}),
      plan: planName,
      ...(parsedAmount !== undefined && !Number.isNaN(parsedAmount) ? { billingAmount: parsedAmount } : {}),
      billingCycle: cycle,
      ...(renewalDueDate ? { renewalDueDate } : {}),
      autoLockOverdue,
      notes: notes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2.5">
      <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={complimentary}
          onChange={(e) => setComplimentary(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg">Complimentary — never invoiced</span> (your own business, a partner). No renewal to
          chase, never locks itself. Turning this on clears any trial or renewal date.
        </span>
      </label>
      <fieldset disabled={complimentary} className={complimentary ? "opacity-40 space-y-2.5" : "space-y-2.5"}>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label>Plan</Label>
            <Select
              value={planChoice}
              onChange={(e) => {
                setPlanChoice(e.target.value);
                suggest(e.target.value, cycle);
              }}
            >
              <option value="">No plan</option>
              {TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={OTHER}>Other / custom</option>
            </Select>
          </div>
          <div>
            <Label>Amount ({PLATFORM_CURRENCY})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="4900"
            />
          </div>
        </div>
        {planChoice === OTHER && (
          <Input value={customPlan} onChange={(e) => setCustomPlan(e.target.value)} placeholder="Plan name" />
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label>Billing cycle</Label>
            <Select
              value={cycle}
              onChange={(e) => {
                const c = e.target.value as typeof cycle;
                setCycle(c);
                suggest(planChoice, c);
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </Select>
          </div>
          <div>
            <Label>Renewal date</Label>
            <Input type="date" value={renewalDueDate} onChange={(e) => setRenewalDueDate(e.target.value)} />
          </div>
        </div>
        <div className="text-[11px] text-muted -mt-1">
          To move the renewal after a payment, use Record payment instead — it keeps a history and can be undone.
          Editing the date here is for corrections.
        </div>
        <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoLockOverdue}
            onChange={(e) => setAutoLockOverdue(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Lock this account automatically if the renewal is more than 7 days overdue. Recording a payment unlocks it
            instantly. Off = an overdue renewal only flags it for you.
          </span>
        </label>
      </fieldset>
      <div>
        <Label>Notes (private — only you see this)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Agreed LKR 3,000/mo, wants annual invoice for their accountant"
          rows={2}
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-amber resize-none"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Save billing"}
      </Button>
    </form>
  );
}

// How long a lead has been waiting, as "just now" / "5h" / "3d" — the number the
// public site's "usually within one working day" promise is measured against.
function waitingLabel(createdAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - createdAt) / 60000));
  if (mins < 60) return mins < 2 ? "just now" : `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// A friendly first reply to a lead, opened in the admin's own mail app. It restates what
// they asked for so the reply reads as personal, not templated.
function leadReplyHref(r: TrialRequest): string {
  const first = r.name.trim().split(/\s+/)[0] || "there";
  const interest = parseInterest(r.interestedPlan);
  const body = [
    `Hi ${first},`,
    "",
    `Thanks for asking about Balancr${r.businessName ? ` for ${r.businessName}` : ""}.${
      interest ? ` I see you were looking at the ${interest.tier.name} plan.` : ""
    }`,
    "",
    `I'll set up your ${TRIAL_DAYS}-day free trial — you'll get an email with a link to choose your password. ` +
      "Before I do, is there anything specific you'd like it to handle first (stock, invoicing, payroll…)? " +
      "It helps me point you at the right place on day one.",
    "",
    "Regards",
  ].join("\n");
  return `mailto:${r.email}?subject=${encodeURIComponent("Your Balancr trial")}&body=${encodeURIComponent(body)}`;
}

// The queue app/request-trial/page.tsx feeds — this is the entire point
// of that public form: turning "someone emailed/DMed asking for a trial"
// into something that shows up here instead of getting lost. "Use for
// account" hands the request's details to the Create-account tab (see
// AdminPanel) rather than provisioning directly from here, so the admin
// still gets a chance to review/edit before an account is actually
// created — provisioning stays the one deliberate action it always was.
//
// It is worked as a QUEUE: oldest waiting first, with a waiting timer that turns
// amber after a day and red after two (the public site promises a reply within one
// working day), a one-tap reply, and up-front flags for "already has a login" and
// "asked more than once" so nothing is provisioned twice or answered twice.
function TrialRequestsPanel({
  passcode,
  focusLeadId,
  onFocusHandled,
  onPendingCountChange,
  onUseForAccount,
}: {
  passcode: string;
  // A lead an email link pointed at: scrolled into view with its Confirm step already open.
  focusLeadId: string | null;
  onFocusHandled: () => void;
  onPendingCountChange: (count: number) => void;
  onUseForAccount: (req: TrialRequest) => void;
}) {
  const [requests, setRequests] = useState<TrialRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [activated, setActivated] = useState<{ email: string; via: "branded" | "firebase" | "none"; why: string | null; trialEndsAt: string | null } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/trial-requests", {
        headers: { "x-admin-passcode": passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load trial requests.");
      setRequests(data.requests);
      setNow(Date.now());
      onPendingCountChange((data.requests as TrialRequest[]).filter((r) => r.status === "pending").length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trial requests.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One click: create the account, start the trial on the plan they asked about, mark the
  // request provisioned and email them the welcome + set-password link. The two-step button
  // (Activate -> Confirm) is the only guard needed — "Edit first" is there for anything unusual.
  async function activate(req: TrialRequest) {
    setBusyId(req.id);
    setError(null);
    try {
      const interest = parseInterest(req.interestedPlan);
      const result = await provisionBusinessOwner({
        email: req.email,
        ownerName: req.name,
        businessName: req.businessName,
        trialDays: TRIAL_DAYS,
        plan: interest?.tier.id ?? null,
        billingCycle: interest?.cycle ?? "annual",
        requestId: req.id,
        passcode,
      });
      setActivated({ email: result.email, via: result.welcomeVia, why: result.welcomeError, trialEndsAt: result.trialEndsAt });
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(readableProvisionError(err));
    } finally {
      setBusyId(null);
    }
  }

  // An email link pointed at one lead: open its Confirm step and bring it into view, so activating
  // it is a single tap. If it has already been dealt with, say so instead of showing nothing.
  useEffect(() => {
    if (!requests || !focusLeadId) return;
    const r = requests.find((x) => x.id === focusLeadId);
    if (r && (r.status === "pending" || r.status === "contacted") && !r.hasAccount) {
      setConfirmId(r.id);
      setHighlightId(r.id);
      setTimeout(() => document.getElementById(`lead-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    } else {
      setFocusNote(
        !r
          ? "That request couldn't be found — it may have been removed."
          : r.status === "provisioned"
          ? `${r.businessName || r.name} has already been activated.`
          : r.status === "dismissed"
          ? `${r.businessName || r.name}'s request was dismissed. Use Reopen under Resolved if you want it back.`
          : "That email already has an account — look under Manage accounts."
      );
    }
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, focusLeadId]);

  // Activates every open lead that doesn't have a login yet, one after another, each with its own
  // welcome email. One failure never stops the rest; the summary says exactly what happened.
  async function activateAll(list: TrialRequest[]) {
    if (
      !window.confirm(
        `Create ${list.length} accounts, start a ${TRIAL_DAYS}-day trial for each, and email every owner their welcome message with a link to choose a password?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    setBulkSummary(null);
    let done = 0;
    let withoutEmail = 0;
    const failed: string[] = [];
    for (const req of list) {
      try {
        const interest = parseInterest(req.interestedPlan);
        const result = await provisionBusinessOwner({
          email: req.email,
          ownerName: req.name,
          businessName: req.businessName,
          trialDays: TRIAL_DAYS,
          plan: interest?.tier.id ?? null,
          billingCycle: interest?.cycle ?? "annual",
          requestId: req.id,
          passcode,
        });
        done++;
        if (result.welcomeVia === "none") withoutEmail++;
      } catch (err) {
        failed.push(`${req.businessName || req.name}: ${readableProvisionError(err)}`);
      }
    }
    setBulkSummary(
      `${done} of ${list.length} activated.` +
        (withoutEmail ? ` ${withoutEmail} could not be emailed — use “Send sign-in link” on their card.` : "") +
        (failed.length ? ` Couldn't activate: ${failed.join("; ")}` : "")
    );
    await load();
    setBulkBusy(false);
  }

  // `block` (only with "dismissed") also stops that Gmail identity from requesting again — see
  // app/api/trial-requests/[id]/route.ts. Reopening a request lifts the block.
  async function setStatus(req: TrialRequest, status: TrialRequest["status"], block = false) {
    setBusyId(req.id);
    setError(null);
    try {
      const res = await fetch(`/api/trial-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ status, ...(block ? { block: true } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update this request.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update this request.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !requests) {
    return (
      <Card className="max-w-lg mx-auto text-center">
        <div className="text-sm text-bad">{error}</div>
        <Button variant="ghost" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!requests) {
    return <div className="text-sm text-muted text-center">Loading trial requests…</div>;
  }

  // "Open" is pending + contacted — both are still leads the admin owns
  // and needs to act on; "contacted" only exists to record that a
  // follow-up happened, not to drop the lead out of the working queue.
  // Queue order: brand-new (pending) before already-contacted, and within each the
  // OLDEST first, so whoever has waited longest is on top.
  const open = requests
    .filter((r) => r.status === "pending" || r.status === "contacted")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  const resolved = requests.filter((r) => r.status === "provisioned" || r.status === "dismissed");
  const emailCounts = new Map<string, number>();
  for (const r of open) emailCounts.set(r.email, (emailCounts.get(r.email) ?? 0) + 1);
  const oldestPending = open.find((r) => r.status === "pending");
  // Leads that can be activated in one go: no login yet, and not a duplicate of another open card
  // (two cards for one email would try to create the same account twice).
  const seenEmails = new Set<string>();
  const activatable = open.filter((r) => {
    if (r.hasAccount || seenEmails.has(r.email)) return false;
    seenEmails.add(r.email);
    return true;
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
      )}
      {activated && (
        <div role="status" className="text-xs text-good bg-good/10 border border-good/30 rounded-md px-3 py-2 flex items-start justify-between gap-3">
          <span>
            <span className="font-medium">{activated.email} is live.</span>{" "}
            {activated.via === "branded"
              ? "Their welcome email (with a link to set a password) is on its way."
              : activated.via === "firebase"
              ? activated.why
                ? `Your welcome email failed (${activated.why}) so Firebase's standard password-reset email was sent instead.`
                : "Your branded welcome email isn't switched on, so Firebase's standard password-reset email was sent instead."
              : `No email could be sent${activated.why ? ` (${activated.why})` : ""} — use “Send sign-in link” on their card under Manage accounts, or tell them to use “Forgot password” on the login page.`}
            {activated.trialEndsAt ? ` Trial runs until ${activated.trialEndsAt}.` : ""}
          </span>
          <button type="button" onClick={() => setActivated(null)} className="text-muted hover:text-fg shrink-0" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {focusNote && (
        <div role="status" className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-md px-3 py-2 flex items-start justify-between gap-3">
          <span>{focusNote}</span>
          <button type="button" onClick={() => setFocusNote(null)} className="text-muted hover:text-fg shrink-0" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {bulkSummary && (
        <div role="status" className="text-xs text-good bg-good/10 border border-good/30 rounded-md px-3 py-2 flex items-start justify-between gap-3">
          <span>{bulkSummary}</span>
          <button type="button" onClick={() => setBulkSummary(null)} className="text-muted hover:text-fg shrink-0" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-wider text-muted font-medium">Open ({open.length})</div>
            {activatable.length > 1 && (
              <Button variant="ghost" disabled={bulkBusy} onClick={() => activateAll(activatable)}>
                {bulkBusy ? "Activating…" : `Activate all (${activatable.length})`}
              </Button>
            )}
          </div>
          {oldestPending && (
            <div
              className={clsx(
                "text-[11px]",
                now - oldestPending.createdAt > 2 * DAY_MS
                  ? "text-bad"
                  : now - oldestPending.createdAt > DAY_MS
                  ? "text-amber"
                  : "text-muted"
              )}
            >
              Longest waiting: {waitingLabel(oldestPending.createdAt, now)}
            </div>
          )}
        </div>
        {open.length === 0 && (
          <div className="text-sm text-muted">No open trial requests right now.</div>
        )}
        <div className="space-y-3">
          {open.map((r) => {
            const age = now - r.createdAt;
            const late = r.status === "pending" && age > DAY_MS;
            const veryLate = r.status === "pending" && age > 2 * DAY_MS;
            const dupes = emailCounts.get(r.email) ?? 1;
            const interest = parseInterest(r.interestedPlan);
            return (
              <div key={r.id} id={`lead-${r.id}`} className={clsx(highlightId === r.id && "ring-2 ring-amber/60 rounded-lg")}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium text-fg truncate">
                        {r.businessName || r.name}
                      </div>
                      <Badge tone={veryLate ? "bad" : late ? "amber" : "default"}>
                        {r.status === "contacted" ? "Contacted · " : "Waiting "}
                        {waitingLabel(r.createdAt, now)}
                      </Badge>
                      {r.interestedPlan && <Badge tone="default">{r.interestedPlan}</Badge>}
                      {r.hasAccount && <Badge tone="bad">Already has a login</Badge>}
                      {dupes > 1 && <Badge tone="amber">Asked {dupes}×</Badge>}
                      {r.emailVerifiedAt && <Badge tone="good">Email confirmed</Badge>}
                      {r.suspicionReasons && r.suspicionReasons.length > 0 && <Badge tone="amber">Looks odd</Badge>}
                    </div>
                    <div className="text-xs text-muted mt-0.5 truncate">
                      {r.name} · {r.email}
                      {r.teamSize ? ` · ${r.teamSize}` : ""}
                    </div>
                    {r.message && <div className="text-xs text-muted mt-1.5">{r.message}</div>}
                    {r.suspicionReasons && r.suspicionReasons.length > 0 && (
                      <div className="text-[11px] text-amber mt-1.5">Why it looks odd: {r.suspicionReasons.join("; ")}.</div>
                    )}
                    {r.hasAccount && (
                      <div className="text-[11px] text-bad mt-1.5">
                        That email already has an account — look under Manage accounts before creating another.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailsId(detailsId === r.id ? null : r.id)}
                      className="text-[11px] text-muted hover:text-fg underline underline-offset-2 mt-1.5 min-h-[44px] sm:min-h-0"
                    >
                      {detailsId === r.id ? "Hide details" : "Details"}
                    </button>
                    {detailsId === r.id && (
                      <div className="text-[11px] text-muted/80 mt-1 space-y-0.5">
                        <div>{new Date(r.createdAt).toLocaleString()}{r.ipAddress ? ` · ${r.ipAddress}` : ""}</div>
                        {r.userAgent && <div className="truncate">UA: {r.userAgent}</div>}
                        {r.referer && <div className="truncate">Referer: {r.referer}</div>}
                        {(r.browserTimezone || r.browserScreen || r.browserLanguage) && (
                          <div className="truncate">
                            {[r.browserTimezone, r.browserScreen, r.browserLanguage].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {confirmId === r.id ? (
                      <>
                        <Button disabled={busyId === r.id} onClick={() => activate(r)}>
                          {busyId === r.id ? "Activating…" : "Confirm"}
                        </Button>
                        <Button variant="ghost" disabled={busyId === r.id} onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button disabled={r.hasAccount} onClick={() => setConfirmId(r.id)}>
                          Activate
                        </Button>
                        <Button variant="ghost" disabled={r.hasAccount} onClick={() => onUseForAccount(r)}>
                          Edit first
                        </Button>
                      </>
                    )}
                    <a
                      href={leadReplyHref(r)}
                      onClick={() => {
                        // Replying is the moment it stops being "new" — record it so the
                        // waiting clock and the tab badge stop counting it as unanswered.
                        if (r.status === "pending") setStatus(r, "contacted");
                      }}
                      className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-md text-sm font-medium border border-line text-fg hover:border-muted transition-all active:scale-[0.98]"
                    >
                      Reply
                    </a>
                    {r.status === "pending" && (
                      <Button variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "contacted")}>
                        Mark contacted
                      </Button>
                    )}
                    <Button variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "dismissed")}>
                      Dismiss
                    </Button>
                    <Button variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "dismissed", true)}>
                      Dismiss &amp; block
                    </Button>
                  </div>
                </div>
                {confirmId === r.id ? (
                  <div className="text-[11px] text-amber mt-2 pt-2 border-t border-line">
                    Confirm to create {r.businessName || r.name}&apos;s account, start a {TRIAL_DAYS}-day trial
                    {interest ? ` on ${interest.tier.name}${interest.cycle ? ` (${interest.cycle})` : ""}` : ""}, and
                    email them the welcome message with a link to choose their password.
                  </div>
                ) : (
                  interest && (
                    <div className="text-[11px] text-muted mt-2 pt-2 border-t border-line">
                      Activating pre-sets {interest.tier.name}
                      {interest.cycle ? ` (${interest.cycle})` : ""} billing — so the first payment is one step.
                    </div>
                  )
                )}
              </Card>
              </div>
            );
          })}
        </div>
      </div>
      {resolved.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted font-medium mb-2">
            Resolved
          </div>
          <div className="space-y-2">
            {resolved.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 text-xs text-muted px-3 py-2 border border-line rounded-md"
              >
                <span className="truncate">
                  {r.name} · {r.email}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="capitalize">{r.status === "provisioned" && r.autoActivated ? "Activated automatically" : r.status}</span>
                  {r.status === "dismissed" && (
                    <Button variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "pending")}>
                      Reopen
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The queue components/FeedbackWidget.tsx feeds — one place for every
// "request something" / "report a problem" note, whether it came from a
// signed-out visitor on the marketing site or a signed-in member from
// inside the app itself (that context, when present, shows next to the
// note below). Same "open -> resolved, with a reopen escape hatch" shape
// as TrialRequestsPanel just above, for the same reason: a note is either
// still owed a look, or it's been dealt with — there's no in-between
// status worth a whole extra bucket for.
function FeedbackPanel({
  passcode,
  onNewCountChange,
}: {
  passcode: string;
  onNewCountChange: (count: number) => void;
}) {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        headers: { "x-admin-passcode": passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load feedback.");
      setItems(data.items);
      onNewCountChange((data.items as Feedback[]).filter((f) => f.status === "new").length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStatus(item: Feedback, status: Feedback["status"]) {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update this item.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update this item.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !items) {
    return (
      <Card className="max-w-lg mx-auto text-center">
        <div className="text-sm text-bad">{error}</div>
        <Button variant="ghost" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!items) {
    return <div className="text-sm text-muted text-center">Loading feedback…</div>;
  }

  // "Open" is new + read — "read" only exists to record that someone's
  // seen it without yet marking it done, same as "contacted" does for
  // trial requests above; it stays in the working queue either way.
  const open = items.filter((f) => f.status === "new" || f.status === "read");
  const resolved = items.filter((f) => f.status === "resolved");
  const KIND_LABEL: Record<Feedback["kind"], string> = { idea: "Request", problem: "Problem", other: "Other" };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
      )}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Open ({open.length})</div>
        {open.length === 0 && <div className="text-sm text-muted">Nothing waiting on you right now.</div>}
        <div className="space-y-3">
          {open.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={f.kind === "problem" ? "bad" : f.kind === "idea" ? "amber" : "default"}>
                      {KIND_LABEL[f.kind]}
                    </Badge>
                    {f.status === "read" && <Badge tone="default">Seen</Badge>}
                    {f.memberName && <span className="text-sm font-medium text-fg truncate">{f.memberName}</span>}
                  </div>
                  <div className="text-sm text-fg mt-1.5 whitespace-pre-wrap">{f.message}</div>
                  <div className="text-[11px] text-muted mt-1.5">
                    {new Date(f.createdAt).toLocaleString()}
                    {f.contactEmail ? ` · ${f.contactEmail}` : " · no reply email"}
                    {f.page ? ` · ${f.page}` : ""}
                    {f.role ? ` · ${f.role}` : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {f.status === "new" && (
                    <Button variant="ghost" disabled={busyId === f.id} onClick={() => setStatus(f, "read")}>
                      Mark seen
                    </Button>
                  )}
                  <Button disabled={busyId === f.id} onClick={() => setStatus(f, "resolved")}>
                    Mark resolved
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {resolved.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Resolved</div>
          <div className="space-y-2">
            {resolved.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 text-xs text-muted px-3 py-2 border border-line rounded-md"
              >
                <span className="truncate">
                  {KIND_LABEL[f.kind]} · {f.message}
                </span>
                <Button variant="ghost" disabled={busyId === f.id} onClick={() => setStatus(f, "new")}>
                  Reopen
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvisionForm({
  passcode,
  prefill,
  onDone,
}: {
  passcode: string;
  prefill: ProvisionPrefill | null;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [ownerName, setOwnerName] = useState(prefill?.ownerName ?? "");
  const [businessName, setBusinessName] = useState(prefill?.businessName ?? "");
  // Defaults to on when this form was opened from a trial request (that's
  // the whole point of that queue), off for a walk-in/direct account —
  // still a checkbox either way, since a trial request sometimes turns
  // into "just set them up as a paying customer" and a direct signup
  // sometimes still wants a trial period first.
  const [isTrial, setIsTrial] = useState(!!prefill);
  const [trialDays, setTrialDays] = useState(String(TRIAL_DAYS));
  // Plan + cycle the account starts on. Carried over from the trial request when the
  // visitor picked one; saved as the account's billing defaults (plan, cycle, list price)
  // so "Record first payment" later is a single click. No renewal date is set here — that
  // only ever comes from a recorded payment.
  const initialInterest = parseInterest(prefill?.interestedPlan);
  const [planId, setPlanId] = useState(initialInterest?.tier.id ?? "");
  const [planCycle, setPlanCycle] = useState<BillingCycle>(initialInterest?.cycle ?? "annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    via: "branded" | "firebase" | "none";
    why: string | null;
    trialDays: number | null;
    trialEndsAt: string | null;
    planName: string | null;
    welcome: string;
  } | null>(null);
  const [welcomeCopied, setWelcomeCopied] = useState(false);

  // Refills the form whenever a *different* trial request is sent over
  // from the "Trial requests" tab (see AdminPanel) — keyed on requestId so
  // re-render from unrelated state changes elsewhere doesn't stomp on
  // whatever the admin has since typed.
  const [loadedRequestId, setLoadedRequestId] = useState<string | null>(prefill?.requestId ?? null);
  useEffect(() => {
    if (prefill && prefill.requestId !== loadedRequestId) {
      setEmail(prefill.email);
      setOwnerName(prefill.ownerName);
      setBusinessName(prefill.businessName);
      setIsTrial(true);
      const interest = parseInterest(prefill.interestedPlan);
      setPlanId(interest?.tier.id ?? "");
      setPlanCycle(interest?.cycle ?? "annual");
      setLoadedRequestId(prefill.requestId);
    }
  }, [prefill, loadedRequestId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const days = Number(trialDays);
      const wantsTrial = isTrial && Number.isFinite(days) && days > 0;
      // One server call does everything — account, trial date, plan + price, marking the
      // lead provisioned, and the welcome email — so nothing can be left half-done.
      const result = await provisionBusinessOwner({
        email,
        ownerName,
        businessName,
        trialDays: wantsTrial ? days : null,
        plan: planId || null,
        billingCycle: planCycle,
        requestId: prefill?.requestId ?? null,
        passcode,
      });
      // A ready-to-send first message (WhatsApp / SMS) for people who'd rather hear it from you.
      const firstName = ownerName.trim().split(/\s+/)[0] || "there";
      const welcome = [
        `Hi ${firstName}, your Balancr account${businessName.trim() ? ` for ${businessName.trim()}` : ""} is ready.`,
        // When no email could be sent, don't promise one: tell them how to get their link themselves.
        result.welcomeVia === "none"
          ? `To choose your password, open ${window.location.origin}/login, press "Forgot password" and enter ${result.email} — you'll get a link by email within a minute (check spam). Then sign in there.`
          : `You'll have an email with a link to choose your password (check spam if it's not there in a couple of minutes). Then sign in at ${window.location.origin}/login.`,
        wantsTrial
          ? `You have ${days} days free to try everything — no card needed. A good first step: add your products or customers and create one real invoice.`
          : "A good first step: add your products or customers and create one real invoice.",
        "If anything is confusing, message me here and I'll sort it out.",
      ].join("\n\n");
      setCreated({
        email: result.email,
        via: result.welcomeVia,
        why: result.welcomeError,
        trialDays: result.trialDays,
        trialEndsAt: result.trialEndsAt,
        planName: tierById(result.plan)?.name ?? null,
        welcome,
      });
      setWelcomeCopied(false);
      setEmail("");
      setOwnerName("");
      setBusinessName("");
      if (prefill) {
        onDone();
        setLoadedRequestId(null);
      }
    } catch (err) {
      setError(readableProvisionError(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="w-full">
        <div className="mb-6 text-center">
          <div className="font-display text-xl font-bold">Account created</div>
        </div>
        <div className="bg-panel border border-line rounded-lg p-6 text-sm text-fg leading-relaxed">
          {created.via === "branded" && (
            <p>
              <span className="text-good font-medium">{created.email}</span> can now sign in. A welcome
              email — with a link to choose their own password — has just been sent. Nothing else to do.
            </p>
          )}
          {created.via === "firebase" && (
            <p>
              <span className="text-good font-medium">{created.email}</span> can now sign in. Your
              branded welcome email {created.why ? `failed (${created.why})` : "isn't switched on"}, so
              Firebase&apos;s standard password-reset email was sent instead (it can land in spam).
              Fix the email settings in the deploy checklist and every activation will send the full
              welcome automatically.
            </p>
          )}
          {created.via === "none" && (
            <p>
              <span className="text-good font-medium">{created.email}</span> can now sign in, but no
              email could be sent just now{created.why ? ` (${created.why})` : ""}. Open Manage accounts
              and press <span className="font-medium">Send sign-in link</span> on their card to copy a
              link you can paste into WhatsApp, or tell them to open the login page and use{" "}
              <span className="font-medium">&quot;Forgot password&quot;</span> with that email address.
            </p>
          )}
          {created.trialEndsAt && (
            <p className="mt-3 text-xs text-muted">
              Trial runs until {created.trialEndsAt}. They&apos;re reminded 3 days before and again on the last day, you see it in your morning email a week ahead, and it locks
              automatically 2 days after it ends — extend or convert it under &quot;Manage accounts&quot;.
            </p>
          )}
          {created.planName && (
            <p className="mt-3 text-xs text-muted">
              {created.planName} plan and price are pre-set. When they pay, open the account under
              &quot;Manage accounts&quot; and press Record first payment — that starts their renewal, and
              they get a receipt by email.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          className="w-full mt-3"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(created.welcome);
              setWelcomeCopied(true);
              setTimeout(() => setWelcomeCopied(false), 2500);
            } catch {
              setWelcomeCopied(false);
            }
          }}
        >
          {welcomeCopied ? "Copied ✓" : "Copy welcome message"}
        </Button>
        <Button variant="ghost" className="w-full mt-4" onClick={() => setCreated(null)}>
          Create another account
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <div className="font-display text-xl font-bold">Create a business account</div>
        <div className="text-sm text-muted mt-1">
          {prefill
            ? "Prefilled from a trial request — check the details before creating the account."
            : "Provisions a new business, owned by the email below. They'll get a link to set their own password."}
        </div>
      </div>
      <div className="bg-panel border border-line rounded-lg p-6 w-full">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Owner&apos;s email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@theirbusiness.com"
            />
          </div>
          <div>
            <Label>Owner&apos;s name</Label>
            <Input
              type="text"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Kamal Perera"
            />
          </div>
          <div>
            <Label>Business name (optional — shows on their printed quotes/invoices)</Label>
            <Input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Perera Hardware"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plan (optional)</Label>
              <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Decide later</option>
                {TIERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Billing cycle</Label>
              <Select
                value={planCycle}
                onChange={(e) => setPlanCycle(e.target.value as BillingCycle)}
                disabled={!planId}
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
          </div>
          {tierById(planId) && (
            <div className="text-xs text-muted -mt-2">
              {formatMoney(periodAmount(tierById(planId)!, planCycle), PLATFORM_CURRENCY)} per{" "}
              {planCycle === "annual" ? "year" : "month"} will be saved as their price — change it later under
              Edit billing if you agree something different.
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <input
              id="is-trial"
              type="checkbox"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
              className="h-4 w-4 accent-amber"
            />
            <label htmlFor="is-trial" className="text-xs text-muted cursor-pointer">
              Start as a trial
            </label>
            {isTrial && (
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <Input
                  type="number"
                  min={1}
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  className="w-16"
                />
                <span className="text-xs text-muted">days</span>
              </div>
            )}
          </div>
          {isTrial && (
            <div className="text-xs text-muted -mt-2">
              No card, no manual date-tracking needed — this shows up in &quot;Manage accounts&quot;
              on its own once it&apos;s due, for you to extend or convert.
            </div>
          )}
          {error && <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function readableProvisionError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/email-already-in-use": "An account already exists for that email.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

// Same shell as Centered, but for the unlocked admin panel — "Manage
// accounts" needs real width for a list of businesses, unlike the single
// narrow passcode/create-account forms Centered was built for.
function Wide({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="w-full max-w-4xl mx-auto">{children}</div>
    </div>
  );
}


// One click to a fully populated dummy business for sales demos. Creates a
// separate account (never touches a customer's data), complimentary so it never
// bills or locks. Sign in as it on a phone or a second browser and demo from
// there instead of typing data in during the call.
function DemoBusinessCard({ passcode }: { passcode: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  // Puts the PUBLIC demo (the shared "Try it now" business) back to its sample data right now.
  async function resetPublicDemo() {
    if (!window.confirm("Put the public demo back to its sample data? Anything visitors added or changed in it is wiped.")) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/admin/demo/reset", { method: "POST", headers: { "x-admin-passcode": passcode } });
      const data = (await res.json().catch(() => ({}))) as { documents?: number; error?: string };
      setResetMessage(
        res.ok
          ? { tone: "good", text: `Public demo reset (${data.documents ?? "?"} sample records restored).` }
          : { tone: "bad", text: data.error ?? "Couldn't reset the public demo." }
      );
    } catch {
      setResetMessage({ tone: "bad", text: "Couldn't reach the server. Try again." });
    } finally {
      setResetting(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
      if (!res.ok) {
        setMessage({ tone: "bad", text: data.error ?? "Couldn't create the demo business." });
        return;
      }
      let sent = true;
      try {
        await sendPasswordResetEmail(getFirebase().auth, email.trim().toLowerCase(), {
          url: `${window.location.origin}/login`,
          handleCodeInApp: false,
        });
      } catch {
        sent = false;
      }
      setMessage({
        tone: "good",
        text: sent
          ? `Demo business created for ${data.email}. Check that inbox for the "set your password" link, then sign in at /login.`
          : `Demo business created for ${data.email}, but the email didn't send. Use "Forgot password" at /login.`,
      });
      setEmail("");
    } catch {
      setMessage({ tone: "bad", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <div className="text-sm font-medium">Demo business</div>
      <div className="text-xs text-muted mt-1 mb-3">
        Creates a separate account filled with three months of sample data (Lanka Gadgets: sales, credit invoices, an
        unpaid bill, an opening balance). Use it for sales demos so you never type data in live. It is free, never locks,
        and shows as plan &ldquo;Demo&rdquo; in Manage accounts. Use an email you control (a +demo alias works).
      </div>
      <form onSubmit={create} className="space-y-3">
        <div>
          <Label>Email for the demo login</Label>
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? "Creating…" : "Create demo business"}
        </Button>
        {message && <div className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</div>}
      </form>
      <div className="border-t border-line mt-4 pt-4">
        <div className="text-sm font-medium">Public demo (&ldquo;Try it now&rdquo;)</div>
        <div className="text-xs text-muted mt-1 mb-3">
          Visitors all share one business, so it is put back to the sample data by itself after it has been used and left
          idle, and once a day. Use this after someone has made a mess of it. The account must be plan &ldquo;Demo&rdquo; and
          complimentary — what &ldquo;Create demo business&rdquo; makes.
        </div>
        <Button type="button" variant="ghost" disabled={resetting} onClick={resetPublicDemo}>
          {resetting ? "Resetting…" : "Reset public demo now"}
        </Button>
        {resetMessage && (
          <div className={resetMessage.tone === "good" ? "text-xs text-good mt-2" : "text-xs text-bad mt-2"}>{resetMessage.text}</div>
        )}
      </div>
    </Card>
  );
}
