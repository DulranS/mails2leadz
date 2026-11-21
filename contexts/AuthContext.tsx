"use client";

import { activeBusinessKey, resolveActiveBusiness } from "@/lib/activeBusiness";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as fbSignOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail as fbUpdateEmail,
  updatePassword as fbUpdatePassword,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import type { AccountStatus, Member, MembershipPointer, Role } from "@/lib/types";
import { resolveAccess } from "@/lib/accountAccess";
import {
  DEMO_SESSION_MINUTES,
  markDemoSession,
  clearDemoSession,
  demoSessionStartedAt,
  demoSessionUid,
} from "@/lib/demoAccount";
import { setDemoRestrictions } from "@/lib/permissions";

interface AuthContextValue {
  user: User | null;
  // True while auth is resolving, or while an authenticated user's
  // business/role is still being looked up. Every page should wait on this
  // before making any permission decision — role starts out null and only
  // becomes trustworthy once this flips false.
  loading: boolean;
  businessId: string | null; // the uid of the business's owner — every Firestore path is rooted at users/{businessId}
  role: Role | null;
  memberName: string | null;
  memberActive: boolean;
  // Platform-level lockout — distinct from memberActive above (which is one
  // person's access within a business). This is the whole business, owner
  // included; see AccountStatus in lib/types.ts and the meta/account rule
  // in firestore.rules for why only a server route can ever clear it.
  // True for a manual suspend OR an expired trial past its grace period
  // (see lib/accountAccess.ts) — the app shell treats both as a lockout.
  businessSuspended: boolean;
  businessSuspendedReason: string | null;
  // True only when the lock is the expired-trial kind, so the lockout screen
  // can say "your trial has ended" instead of "suspended".
  trialExpiredLock: boolean;
  // Lock caused by an overdue renewal on an account with auto-lock switched on.
  renewalOverdueLock: boolean;
  // Whether the admin switched on auto-lock for an overdue renewal (banner copy).
  autoLockOverdue: boolean;
  // Never-invoiced account (see AccountStatus.complimentary) — the plan card says so
  // instead of showing an empty billing section.
  complimentary: boolean;
  // Manual billing/plan record from meta/account (see AccountStatus in
  // lib/types.ts) — admin-set, never owner-writable, but the owner has had
  // no visibility into any of it until now. Surfaced read-only so a trial
  // account can see its own countdown and a paying one can see what it's
  // on, instead of that information living only in the platform admin's
  // "Manage accounts" tab. `notes` is deliberately excluded — that field
  // is the admin's own scratch space about this business, not something
  // the business itself should see.
  plan: string | null;
  billingAmount: number | null;
  billingCycle: "monthly" | "annual" | null;
  renewalDueDate: string | null;
  lastPaidAt: number | null;
  trialEndsAt: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  // The landing page's one-tap demo. Signs in with a one-time token from the server (no shared
  // password — see lib/demoServer.ts). The session lives only in this browser tab (gone when the tab
  // closes) and is cut off after DEMO_SESSION_MINUTES, after which the visitor lands back on the
  // landing page — see lib/demoAccount.ts.
  signInDemo: () => Promise<void>;
  // True when this business is the shared public demo (meta/account.publicDemo, set only by the
  // server). Destructive and structural actions are switched off for it — see lib/permissions.ts.
  isPublicDemo: boolean;
  // Sends a "reset your password" email via Firebase Auth's own flow. This
  // is how a person sets their password for the first time, too — accounts
  // are provisioned by an admin (see /admin/new-business + lib/provisioning.ts)
  // with a throwaway password nobody is ever told, specifically so this
  // reset link is the only way in. The login page deliberately shows the
  // same "check your email" message whether or not this throws
  // auth/user-not-found, so the UI never confirms/denies which emails have
  // an account (see app/login/page.tsx).
  sendPasswordReset: (email: string) => Promise<void>;
  // Both of these re-prove identity with the current password before
  // touching anything (Firebase rejects updateEmail/updatePassword outright
  // with auth/requires-recent-login once the session is more than a few
  // minutes old, so this isn't optional hardening — it's what makes the
  // call succeed at all). Throws straight through on wrong password
  // (auth/invalid-credential) or a too-weak new password
  // (auth/weak-password) — callers show err.message as-is.
  changeEmail: (newEmail: string, currentPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function reauthenticate(user: User, currentPassword: string) {
  if (!user.email) throw new Error("No email on this account to reauthenticate with.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
}

// Ends a demo session and sends the visitor back to the public landing page.
// A full page load (not router.push) on purpose: it also wipes every in-memory
// listener/cache the demo session had open, and it beats AppShell's own
// "signed out -> /login" redirect to the punch.
async function endDemoSession() {
  clearDemoSession();
  try {
    const { auth } = getFirebase();
    await fbSignOut(auth);
  } finally {
    window.location.replace("/");
  }
}

function clearChosenBusiness(uid: string) {
  try {
    localStorage.removeItem(activeBusinessKey(uid));
  } catch {
    /* nothing to clear */
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  // The business the person signed up into (memberships/{uid}). Kept apart from businessId, which can be another
  // business they chose to open (lib/activeBusiness.ts); the pointer is what we fall back to.
  const [pointerBusinessId, setPointerBusinessId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [memberActive, setMemberActive] = useState(true);
  const [manualSuspended, setManualSuspended] = useState(false);
  const [businessSuspendedReason, setBusinessSuspendedReason] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [billingAmount, setBillingAmount] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual" | null>(null);
  const [renewalDueDate, setRenewalDueDate] = useState<string | null>(null);
  const [lastPaidAt, setLastPaidAt] = useState<number | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [autoLockOverdue, setAutoLockOverdue] = useState(false);
  const [complimentary, setComplimentary] = useState(false);
  const [isPublicDemo, setIsPublicDemo] = useState(false);
  // Re-evaluates the trial lock while a tab stays open across the deadline —
  // the Firestore listener only fires when the doc changes, and an expired
  // trial changes nothing in Firestore.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) {
        setBusinessId(null);
        setRole(null);
        setMemberName(null);
        setManualSuspended(false);
        setBusinessSuspendedReason(null);
        setPlan(null);
        setBillingAmount(null);
        setBillingCycle(null);
        setRenewalDueDate(null);
        setLastPaidAt(null);
        setTrialEndsAt(null);
        setAutoLockOverdue(false);
        setIsPublicDemo(false);
        setMembershipLoading(false);
      } else {
        setMembershipLoading(true);
      }
    });
    return () => unsub();
  }, []);

  // Demo sessions expire. Checked on an interval and also whenever the tab
  // becomes visible/focused again, because browsers throttle timers in
  // background tabs — a demo left open overnight must end the moment the
  // visitor comes back, not at the next throttled tick.
  useEffect(() => {
    if (!user) return;
    const check = () => {
      const startedAt = demoSessionStartedAt();
      if (startedAt === null) return; // a normal login — never expires
      const stampedUid = demoSessionUid();
      if (stampedUid && user.uid !== stampedUid) {
        clearDemoSession(); // stale stamp from a different account — not a demo
        return;
      }
      if (Date.now() - startedAt >= DEMO_SESSION_MINUTES * 60 * 1000) void endDemoSession();
    };
    check();
    const id = setInterval(check, 15 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [user]);

  // Step 1: given a signed-in uid, find which business they belong to. This
  // pointer doc is written once, at signup or at invite-acceptance time, and
  // never updated — see lib/types.ts's MembershipPointer for why.
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    const unsub = onSnapshot(
      doc(db, "memberships", user.uid),
      (snap) => {
        if (snap.exists()) {
          const pointer = (snap.data() as MembershipPointer).businessId;
          setPointerBusinessId(pointer);
          // A business the person chose to open instead (kept in this browser). Read inside try/catch: storage can be
          // unavailable (private mode), and that must never get in the way of signing in.
          let chosen: string | null = null;
          try {
            chosen = localStorage.getItem(activeBusinessKey(user.uid));
          } catch {
            chosen = null;
          }
          const res = resolveActiveBusiness(pointer, chosen, undefined);
          if (res.dropChoice) clearChosenBusiness(user.uid);
          setBusinessId(res.businessId);
        } else {
          setPointerBusinessId(null);
          setBusinessId(null);
          setRole(null);
          setMemberName(null);
          setMembershipLoading(false);
        }
      },
      () => {
        setBusinessId(null);
        setMembershipLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  // Suspend/reactivate check — deliberately keyed on businessId alone, not
  // on role or memberActive below. An owner has no `members` entry to be
  // "active" or not, but still needs to be locked out the instant this
  // flips, so it can't ride on Step 2's subscription. Missing doc == not
  // suspended, which is the common case (see AccountStatus in lib/types.ts).
  useEffect(() => {
    if (!user || !businessId) return;
    const { db } = getFirebase();
    const unsub = onSnapshot(
      doc(db, "users", businessId, "meta", "account"),
      (snap) => {
        const data = snap.exists() ? (snap.data() as AccountStatus) : null;
        setManualSuspended(!!data?.suspended);
        setBusinessSuspendedReason(data?.reason ?? null);
        setPlan(data?.plan ?? null);
        setBillingAmount(data?.billingAmount ?? null);
        setBillingCycle(data?.billingCycle ?? null);
        setRenewalDueDate(data?.renewalDueDate ?? null);
        setLastPaidAt(data?.lastPaidAt ?? null);
        setTrialEndsAt(data?.trialEndsAt ?? null);
        setAutoLockOverdue(data?.autoLockOverdue === true);
        setComplimentary(data?.complimentary === true);
        setIsPublicDemo(data?.publicDemo === true);
      },
      () => {
        setManualSuspended(false);
        setBusinessSuspendedReason(null);
        setPlan(null);
        setBillingAmount(null);
        setBillingCycle(null);
        setRenewalDueDate(null);
        setLastPaidAt(null);
        setTrialEndsAt(null);
        setAutoLockOverdue(false);
        setComplimentary(false);
        setIsPublicDemo(false);
      }
    );
    return () => unsub();
  }, [user, businessId]);

  // Step 2: given the business, look up this uid's current role, name and
  // active status — the same doc firestore.rules checks for every
  // permission decision, so what the UI shows always matches what the
  // database will actually allow. Live-subscribed, not a one-time read, so
  // an owner deactivating someone or changing their role takes effect in
  // that person's open tab immediately, not on next login.
  useEffect(() => {
    if (!user || !businessId) return;
    const { db } = getFirebase();
    const unsub = onSnapshot(
      doc(db, "users", businessId, "members", user.uid),
      (snap) => {
        // On a business other than the pointer's: if the person no longer has an active member record there, drop the
        // choice and show their own business again, rather than leave them on one they lost.
        if (pointerBusinessId && businessId !== pointerBusinessId) {
          const member = snap.exists() ? (snap.data() as Omit<Member, "id">) : null;
          const res = resolveActiveBusiness(pointerBusinessId, businessId, member);
          if (res.dropChoice) {
            clearChosenBusiness(user.uid);
            setBusinessId(res.businessId);
            return;
          }
        }
        if (snap.exists()) {
          const data = snap.data() as Omit<Member, "id">;
          setRole(data.role);
          setMemberName(data.name);
          setMemberActive(data.active);
        } else {
          setRole(null);
          setMemberName(null);
        }
        setMembershipLoading(false);
      },
      () => {
        // Could not read the member record of a chosen business: same fallback.
        if (pointerBusinessId && businessId !== pointerBusinessId) {
          clearChosenBusiness(user.uid);
          setBusinessId(pointerBusinessId);
          return;
        }
        setMembershipLoading(false);
      }
    );
    return () => unsub();
  }, [user, businessId, pointerBusinessId]);

  const loading = authLoading || (!!user && membershipLoading);

  const access = useMemo(
    () =>
      resolveAccess(
        {
          suspended: manualSuspended,
          reason: businessSuspendedReason ?? undefined,
          trialEndsAt: trialEndsAt ?? undefined,
          renewalDueDate: renewalDueDate ?? undefined,
          lastPaidAt: lastPaidAt ?? undefined,
          autoLockOverdue,
          complimentary,
        },
        new Date(clock)
      ),
    [manualSuspended, businessSuspendedReason, trialEndsAt, renewalDueDate, lastPaidAt, autoLockOverdue, complimentary, clock]
  );
  const businessSuspended = access.locked;
  const lockReason = access.locked ? access.message : null;
  const trialExpiredLock = access.kind === "trial_expired";
  const renewalOverdueLock = access.kind === "renewal_overdue";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      businessId,
      role,
      memberName,
      memberActive,
      businessSuspended,
      businessSuspendedReason: lockReason,
      trialExpiredLock,
      renewalOverdueLock,
      autoLockOverdue,
      complimentary,
      isPublicDemo,
      plan,
      billingAmount,
      billingCycle,
      renewalDueDate,
      lastPaidAt,
      trialEndsAt,
      signIn: async (email, password) => {
        const { auth } = getFirebase();
        // A normal login is a remembered one. This also undoes the tab-only
        // persistence a demo sign-in earlier in the same page load switched on,
        // and drops the demo stamp so this session can never be timed out.
        clearDemoSession();
        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch {
          // Blocked storage — Firebase falls back to what it can use.
        }
        await signInWithEmailAndPassword(auth, email, password);
      },
      signInDemo: async () => {
        const { auth } = getFirebase();
        // Ask the server for a one-time token. It refuses (503) unless the demo business is set up
        // and verified as a Demo-plan sandbox; the button turns that into a link to the trial form.
        const res = await fetch("/api/demo/session", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as { token?: string };
        if (!res.ok || !data.token) throw new Error("The demo is unavailable right now.");
        // Tab-only persistence: closing the tab or browser ends the session, so
        // the tester's next visit starts signed out, on the landing page.
        try {
          await setPersistence(auth, browserSessionPersistence);
        } catch {
          // Blocked storage — carry on; the time cap below still ends it.
        }
        const cred = await signInWithCustomToken(auth, data.token);
        markDemoSession(cred.user.uid);
      },
      sendPasswordReset: async (email) => {
        const { auth } = getFirebase();
        // Same reasoning as lib/provisioning.ts — without a continueUrl,
        // Firebase's hosted reset page has no link back into the app.
        await sendPasswordResetEmail(auth, email, {
          url: `${window.location.origin}/login`,
          handleCodeInApp: false,
        });
      },
      changeEmail: async (newEmail, currentPassword) => {
        const { auth } = getFirebase();
        if (!auth.currentUser) throw new Error("Not signed in");
        await reauthenticate(auth.currentUser, currentPassword);
        await fbUpdateEmail(auth.currentUser, newEmail.trim().toLowerCase());
      },
      changePassword: async (currentPassword, newPassword) => {
        const { auth } = getFirebase();
        if (!auth.currentUser) throw new Error("Not signed in");
        await reauthenticate(auth.currentUser, currentPassword);
        await fbUpdatePassword(auth.currentUser, newPassword);
      },
      signOut: async () => {
        // Leaving a demo goes back to the landing page, not the login screen.
        if (demoSessionStartedAt() !== null) {
          await endDemoSession();
          return;
        }
        const { auth } = getFirebase();
        await fbSignOut(auth);
      },
    }),
    [
      user,
      loading,
      businessId,
      role,
      memberName,
      memberActive,
      businessSuspended,
      lockReason,
      trialExpiredLock,
      renewalOverdueLock,
      autoLockOverdue,
      complimentary,
      isPublicDemo,
      plan,
      billingAmount,
      billingCycle,
      renewalDueDate,
      lastPaidAt,
      trialEndsAt,
    ]
  );

  // Switch the shared demo's destructive actions off for every can(role, …) check in the UI. Set
  // here, during render, BEFORE the children that call can() re-render with the new context value;
  // it is an idempotent assignment, not a subscription. (This is the UX layer — firestore.rules is
  // the enforcement; see lib/permissions.ts.)
  setDemoRestrictions(isPublicDemo && !!user);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
