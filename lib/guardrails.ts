// Limits that stop free accounts being used to run up costs or to spoil things for other people.
//
// Two kinds of free account, with different risks, which is why they are told apart here:
//
//   • PUBLIC DEMO — the one shared sample business behind "Try it now". Every visitor lands in the
//     SAME books, so one person deleting everything or posting rubbish ruins it for the next. It is
//     also where a stranger can burn AI money with no signup at all. It gets the tightest limits,
//     is put back to the sample data automatically (lib/demoServer.ts), and its destructive actions
//     are switched off (lib/permissions.ts, firestore.rules).
//   • TRIAL — a private business a real prospect asked for. Whatever they do only affects their
//     own books, so the only shared risk is cost. Today that means AI usage: a lower daily default
//     than a paying business, still enough to properly evaluate the assistant.
//
// Everything in this file is pure (no network, no clock) so scripts/verify-demo-guardrails.ts can
// prove it offline. The flags it reads live on meta/account, which no client can write (see the
// meta/account rule in firestore.rules) — a visitor cannot turn their own demo/trial status off.

// ~40-50 realistic AI Assistant turns is a normal heavy day for one business; 100 is double that.
// It lives here (not in lib/aiUsageLimit.ts, which is server-only) so this file stays free of server
// imports. aiUsageLimit re-exports it, and the reasoning for the number is documented there.
export const DEFAULT_AI_DAILY_MESSAGE_LIMIT = 100;

export type AccountKind = "public_demo" | "trial" | "standard";

export interface KindInput {
  // Set by the server when a business is designated the public demo (lib/demoServer.ts).
  publicDemo?: boolean;
  complimentary?: boolean;
  plan?: string;
  trialEndsAt?: string;
  lastPaidAt?: number;
}

export function accountKind(a: KindInput | null | undefined): AccountKind {
  if (!a) return "standard";
  if (a.publicDemo === true) return "public_demo";
  // A trial is a business with an end date that nobody has paid for and that isn't a free
  // complimentary account. Converting to paid clears trialEndsAt (billing route) and records a
  // payment, either of which moves it out of this class.
  if (typeof a.trialEndsAt === "string" && a.trialEndsAt && a.complimentary !== true && !a.lastPaidAt) return "trial";
  return "standard";
}

// What the AI assistant may do for each kind of account.
export interface AiLimits {
  dailyTurns: number;
  // Turns per visitor IP per day, on top of the shared daily cap (0 = no per-IP limit). Only the
  // public demo needs it: otherwise one person can use up the whole day's allowance for everyone.
  perIpDailyTurns: number;
  maxMessageChars: number;
  // Things the assistant would otherwise PERSIST into the books. In the shared demo, whatever it
  // remembers or creates is what the next visitor sees.
  allowRememberNote: boolean;
  allowCreateProduct: boolean;
}

export const DEMO_AI_DAILY_TURNS = 40;
export const DEMO_AI_PER_IP_DAILY_TURNS = 8;
export const DEMO_AI_MAX_MESSAGE_CHARS = 500;
export const TRIAL_AI_DAILY_TURNS = 50;
export const DEFAULT_AI_MAX_MESSAGE_CHARS = 4000;

// `settingsOverride` is Settings.aiDailyMessageLimit — the admin deliberately setting a number for
// one business (0 = unlimited). It applies to trial and standard businesses; the shared demo ignores
// it, because the demo's settings are exactly the thing a visitor must not be able to widen.
export function aiLimitsFor(kind: AccountKind, settingsOverride?: number, adminAccount?: boolean): AiLimits {
  if (kind === "public_demo") {
    return {
      dailyTurns: DEMO_AI_DAILY_TURNS,
      perIpDailyTurns: DEMO_AI_PER_IP_DAILY_TURNS,
      maxMessageChars: DEMO_AI_MAX_MESSAGE_CHARS,
      allowRememberNote: false,
      allowCreateProduct: false,
    };
  }
  const base = kind === "trial" ? TRIAL_AI_DAILY_TURNS : DEFAULT_AI_DAILY_MESSAGE_LIMIT;
  // Admin accounts (pass 308) run on the operator's key, so they never get the "unlimited" override: they always get the
  // standard daily cap, whatever the business's own setting says.
  const override = adminAccount ? undefined : settingsOverride;
  return {
    dailyTurns: typeof override === "number" ? override : base,
    perIpDailyTurns: 0,
    maxMessageChars: DEFAULT_AI_MAX_MESSAGE_CHARS,
    allowRememberNote: true,
    allowCreateProduct: true,
  };
}

// ---- the shared demo: when is it put back to the sample data? -----------------------------------

// A visitor's demo session ends after DEMO_SESSION_MINUTES (lib/demoAccount.ts, 30 by default);
// the demo is only reset after it has been idle for longer than that, so nobody has their books
// replaced while they are still looking at them.
export const DEMO_IDLE_RESET_MS = 35 * 60 * 1000;
// Never reset more than once in this window, however the timestamps look — a reset is a few hundred
// writes, so a bug or a hammering visitor must not be able to turn it into a loop.
export const DEMO_MIN_RESET_GAP_MS = 10 * 60 * 1000;

export interface DemoState {
  lastMintAt?: number; // last time a visitor was let in
  lastResetAt?: number; // last time the demo was put back to the sample data
}

// Reset when (a) it has never been reset (first run after this feature ships — also what retires an
// old shared password), or (b) somebody has used it since the last reset and has now gone quiet.
export function shouldResetDemo(s: DemoState, now: number): boolean {
  if (typeof s.lastResetAt === "number" && now - s.lastResetAt < DEMO_MIN_RESET_GAP_MS) return false;
  if (typeof s.lastResetAt !== "number") return true;
  if (typeof s.lastMintAt !== "number") return false;
  return s.lastMintAt > s.lastResetAt && now - s.lastMintAt >= DEMO_IDLE_RESET_MS;
}

// Resetting WIPES a business and re-seeds it, so it is only ever allowed on an account that is, in
// every respect, a free sandbox: marked as the public demo AND on the Demo plan AND complimentary
// (never billed). A paying or trial customer can never satisfy this, even if the configured demo
// email were wrong or someone edited a setting.
export function isResettableDemo(a: KindInput | null | undefined): boolean {
  return !!a && a.publicDemo === true && a.complimentary === true && (a.plan ?? "").trim().toLowerCase() === "demo";
}

// What an account must look like BEFORE it can be designated the public demo (a one-time, server
// side step). Same sandbox test minus the flag it is about to receive.
export function isDesignatableDemo(a: KindInput | null | undefined): boolean {
  return !!a && a.complimentary === true && (a.plan ?? "").trim().toLowerCase() === "demo";
}
