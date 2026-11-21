// The one-tap "Try it now" demo on the landing and login pages (components/TryDemoButton.tsx).
//
// There is NO shared password any more. This file used to hold a demo email and password that
// shipped in the page's JavaScript — readable by anyone, and changeable by whoever signed in first,
// which would have switched the button off for every visitor after them. Now the browser asks the
// server for a one-time sign-in token (POST /api/demo/session -> lib/demoServer.ts) and signs in
// with that; the demo user's password is random and never shown anywhere.
//
// The email below is only how the SERVER finds the demo business the first time (afterwards its uid
// is remembered in platform/demo). It must belong to a business that is plan "Demo" and
// complimentary — what Admin → New business → "Create demo business" produces — or the demo refuses
// to open and the button falls back to the trial form. Set DEMO_EMAIL (server-only) to change it;
// NEXT_PUBLIC_DEMO_EMAIL still works for deployments that already set it.
export const DEMO_EMAIL = (process.env.DEMO_EMAIL || process.env.NEXT_PUBLIC_DEMO_EMAIL || "admin@gmail.com").trim();

// --- Demo sessions are short-lived on purpose --------------------------------
// A tester who taps "Try it now" should see the landing page again the next
// time they visit, not be dropped straight back into the shared demo. Two
// things make that so (both wired up in contexts/AuthContext.tsx):
//   1. The demo sign-in uses Firebase's per-TAB session persistence, so closing
//      the tab or browser ends it — a later visit starts signed out.
//   2. A time cap for a tab that is simply left open: after
//      DEMO_SESSION_MINUTES the session is ended and the visitor is sent back
//      to the landing page.
// A stamp in sessionStorage marks a session as "started from the demo button".
// That is what stops this from ever touching a normal login — signing in
// through /login as this same account clears the stamp, so the owner using it
// for real is never kicked out.
export const DEMO_SESSION_MINUTES = Number(process.env.NEXT_PUBLIC_DEMO_SESSION_MINUTES) || 30;

const DEMO_STAMP_KEY = "balancr:demoSessionStartedAt";
const DEMO_UID_KEY = "balancr:demoSessionUid";

// `uid` is who the demo session signed in as, so a stale stamp left by a different account can be
// told apart from a real demo session without relying on the (changeable) email address.
export function markDemoSession(uid?: string): void {
  try {
    window.sessionStorage.setItem(DEMO_STAMP_KEY, String(Date.now()));
    if (uid) window.sessionStorage.setItem(DEMO_UID_KEY, uid);
  } catch {
    // sessionStorage can be blocked (some private modes / webviews). Tab-scoped
    // persistence still ends the session when the tab closes; only the time cap is lost.
  }
}

export function clearDemoSession(): void {
  try {
    window.sessionStorage.removeItem(DEMO_STAMP_KEY);
    window.sessionStorage.removeItem(DEMO_UID_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function demoSessionUid(): string | null {
  try {
    return window.sessionStorage.getItem(DEMO_UID_KEY);
  } catch {
    return null;
  }
}

// Epoch ms the current demo session started, or null if this tab isn't in one.
export function demoSessionStartedAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_STAMP_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
