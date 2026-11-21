// Server-only. A per-business daily cap on AI Assistant *turns* (calls to
// /api/ai/chat — the only route that calls the model. An earlier
// vision-based OCR route existed here but was never wired into any
// client UI and had no usage cap of its own — an unmetered, live API
// surface with no purpose, so it was removed outright rather than
// finished or capped; the app's photo/receipt scanning is the separate,
// local, zero-cost lib/ocr.ts + components/OcrScanner.tsx path used on
// the Sales/Expenses forms, unaffected by this).
//
// Why this exists: requireAiContext in lib/firebaseAdmin.ts verifies *who*
// is calling (a real signed-in Owner/Manager of the business), but nothing
// previously limited *how many times*. One confused person stuck retrying
// a request that keeps failing, or a script hitting the endpoint in a
// loop, would run up model-API cost with no ceiling — for a deployment
// selling seats to multiple SME customers, an uncapped per-tenant cost is
// a real business risk, not just a theoretical one.
//
// Design, deliberately the simplest thing that closes the actual hole:
// - One counter doc per business, `users/{businessId}/meta/aiUsage`,
//   `{ date: "YYYY-MM-DD", count: number }`. Resets itself the first time
//   a business sends a message on a new UTC day — no cron job, no Cloud
//   Function, nothing to schedule or forget to run.
// - A Firestore transaction (not a plain read-then-write) so two messages
//   sent in the same instant from the same business can't both read the
//   count before either writes it and slip past the cap together.
// - The default cap (see DEFAULT_AI_DAILY_MESSAGE_LIMIT below) is sized
//   for genuine heavy use — a shop owner logging most of a day's sales
//   through the assistant plus a handful of questions — with real
//   headroom above that, not a hair-trigger. This is a backstop against
//   runaway/abusive usage, not a metering product; see
//   Settings.aiDailyMessageLimit (lib/types.ts) for the per-business
//   override if a specific customer genuinely needs a different number.

import type { Firestore } from "firebase-admin/firestore";
import type { Settings } from "./types";
import { AiAuthError } from "./firebaseAdmin";
import { DEFAULT_AI_DAILY_MESSAGE_LIMIT } from "./guardrails";

// ~40-50 realistic AI Assistant turns is a normal heavy day for one
// business (a burst of quick-entry logging plus a few questions). 100
// still gives that double headroom. It was 200, but at DeepSeek's Sep 2026
// peak rates a business hitting 200 uncached turns every day could cost more
// per month than the Starter plan brings in; 100 keeps the worst case well
// under a plan's revenue. Raise it per business via Settings.aiDailyMessageLimit.
export { DEFAULT_AI_DAILY_MESSAGE_LIMIT };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Throws AiAuthError (status 429) and does NOT record a turn if the
// business is already at its cap for today. Otherwise records this turn
// (so the check itself can't be bypassed by firing requests fast enough to
// race past it) and returns normally. Call this once per /api/ai/chat
// request, after requireAiContext and before the model gets called.
//
// `limitOverride` is the limit for THIS kind of account (lib/guardrails.ts aiLimitsFor): lower for a
// trial and lower still for the shared public demo. When omitted it behaves exactly as before — the
// business's own Settings.aiDailyMessageLimit, else the standard default.
export async function enforceAiDailyLimit(
  db: Firestore,
  businessId: string,
  settings: Settings,
  limitOverride?: number
): Promise<void> {
  const limit = limitOverride ?? settings.aiDailyMessageLimit ?? DEFAULT_AI_DAILY_MESSAGE_LIMIT;
  if (limit <= 0) return; // explicit admin override: unlimited for this business

  const today = todayUtc();
  const ref = db.doc(`users/${businessId}/meta/aiUsage`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { date?: string; count?: number } | undefined;
    const currentCount = data?.date === today ? data?.count ?? 0 : 0;

    if (currentCount >= limit) {
      throw new AiAuthError(
        `This business has used all ${limit} AI Assistant messages available today. It resets at midnight UTC — everything else in the app works normally in the meantime. If this business genuinely needs a higher daily limit, whoever manages this account can raise it.`,
        429
      );
    }

    tx.set(ref, { date: today, count: currentCount + 1 }, { merge: true });
  });
}

// Gives back one turn recorded by enforceAiDailyLimit when the turn produced
// nothing for the customer because the model provider failed (outage, rate
// limit, empty answer). Without this, a customer retrying through a provider
// outage would burn their whole daily allowance on turns that never worked.
//
// Best-effort by design: it never throws (a failed refund must not mask the
// original error the customer needs to see), and it only ever lowers today's
// counter — never below zero, and never touches a counter from another day.
export async function refundAiDailyTurn(db: Firestore, businessId: string): Promise<void> {
  try {
    const today = todayUtc();
    const ref = db.doc(`users/${businessId}/meta/aiUsage`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as { date?: string; count?: number } | undefined;
      if (!data || data.date !== today || !data.count || data.count <= 0) return;
      tx.set(ref, { date: today, count: data.count - 1 }, { merge: true });
    });
  } catch (err) {
    console.error("[aiUsageLimit] refund failed", err);
  }
}

// ---------------------------------------------------------------------------------------------
// Usage metering — what each business's AI actually costs.
//
// The daily cap above stops runaway use; this records what ordinary use costs, so the admin panel
// can show "AI this month" per customer and the plan price can be checked against real spend
// instead of a guess. Same document as the daily counter (merge-written, so neither clobbers the
// other), reset by itself on the first turn of a new UTC month.
//
// Best-effort by design, like the refund: a failed write must never fail or delay the customer's
// answer, so recordAiUsage never throws. At worst a turn goes unmetered, which under-reports by
// one turn rather than breaking the assistant.
// ---------------------------------------------------------------------------------------------

export interface AiTokenUsage {
  input: number;
  output: number;
  cached: number;
}

export function emptyAiUsage(): AiTokenUsage {
  return { input: 0, output: 0, cached: 0 };
}

// Adds one provider response's `usage` block to a running total. Tolerates a missing or odd block
// (a provider that omits it, a non-numeric field) by adding nothing rather than NaN.
export function addProviderUsage(
  total: AiTokenUsage,
  usage: { input_tokens?: unknown; output_tokens?: unknown; cache_read_input_tokens?: unknown } | null | undefined
): void {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  if (!usage) return;
  total.input += n(usage.input_tokens);
  total.output += n(usage.output_tokens);
  total.cached += n(usage.cache_read_input_tokens);
}

export function monthKeyUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

interface StoredAiUsage {
  date?: string;
  count?: number;
  month?: string;
  mTurns?: number;
  mIn?: number;
  mOut?: number;
  mCached?: number;
}

export interface AiMonthUsage {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  // Conservative estimate in US dollars (see estimateAiCostUsd).
  estCostUsd: number;
}

// DeepSeek Flash list prices per million tokens at the PEAK rate (off-peak is half), checked
// 3 Oct 2026 at api-docs.deepseek.com/quick_start/pricing. Peak is used on purpose: the number is
// for judging whether a plan covers its AI cost, so it should err high, not low. Override with
// AI_PRICE_INPUT / AI_PRICE_OUTPUT / AI_PRICE_CACHED (USD per million tokens) if the provider or
// the price changes.
function priceFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 && process.env[name] ? v : fallback;
}

export function estimateAiCostUsd(u: { inputTokens: number; outputTokens: number; cachedTokens: number }): number {
  const pIn = priceFromEnv("AI_PRICE_INPUT", 0.3);
  const pOut = priceFromEnv("AI_PRICE_OUTPUT", 1.2);
  const pCached = priceFromEnv("AI_PRICE_CACHED", 0.006);
  return (u.inputTokens * pIn + u.outputTokens * pOut + u.cachedTokens * pCached) / 1_000_000;
}

// This month's usage from the stored document, or null when nothing has been recorded this month.
export function readAiMonthUsage(data: StoredAiUsage | undefined, month: string = monthKeyUtc()): AiMonthUsage | null {
  if (!data || data.month !== month) return null;
  const u = {
    inputTokens: data.mIn ?? 0,
    outputTokens: data.mOut ?? 0,
    cachedTokens: data.mCached ?? 0,
  };
  return { turns: data.mTurns ?? 0, ...u, estCostUsd: estimateAiCostUsd(u) };
}

// Adds a turn's tokens to this month's totals. `turns` is 1 for a finished turn and 0 when only the
// tokens of a turn that failed part-way (and was refunded) are being booked: the provider still
// charged for those.
export async function recordAiUsage(db: Firestore, businessId: string, usage: AiTokenUsage, turns: 0 | 1 = 1): Promise<void> {
  if (turns === 0 && usage.input + usage.output + usage.cached === 0) return;
  try {
    const month = monthKeyUtc();
    const ref = db.doc(`users/${businessId}/meta/aiUsage`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as StoredAiUsage | undefined;
      const same = data?.month === month;
      tx.set(
        ref,
        {
          month,
          mTurns: (same ? data?.mTurns ?? 0 : 0) + turns,
          mIn: (same ? data?.mIn ?? 0 : 0) + usage.input,
          mOut: (same ? data?.mOut ?? 0 : 0) + usage.output,
          mCached: (same ? data?.mCached ?? 0 : 0) + usage.cached,
        },
        { merge: true }
      );
    });
  } catch (err) {
    console.error("[aiUsageLimit] usage record failed", err);
  }
}
