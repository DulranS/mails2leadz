// Empirical check for AI usage metering (lib/aiUsageLimit.ts "Usage metering") and that both AI
// routes and the admin list are wired to it.
//
// Run: npx tsx scripts/verify-ai-usage-metering.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import {
  emptyAiUsage, addProviderUsage, recordAiUsage, readAiMonthUsage, estimateAiCostUsd,
  enforceAiDailyLimit, refundAiDailyTurn, monthKeyUtc,
} from "../lib/aiUsageLimit";
import { DEFAULT_SETTINGS } from "../lib/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`);
  if (!ok) failed++;
}

type Doc = Record<string, unknown> | undefined;
function fakeDb(initial?: Doc, failWrites = false) {
  let data: Doc = initial;
  const ref = {};
  const db = {
    doc: () => ref,
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      if (failWrites) throw new Error("firestore down");
      await fn({
        get: async () => ({ data: () => data }),
        set: (_r: unknown, v: Record<string, unknown>, opts?: { merge?: boolean }) => {
          data = opts?.merge ? { ...(data ?? {}), ...v } : v;
        },
      });
    },
  } as unknown as Firestore;
  return { db, read: () => data };
}

async function main() {
  const month = monthKeyUtc();
  const today = new Date().toISOString().slice(0, 10);

  // ---- summing provider usage ---------------------------------------------------------------
  const u = emptyAiUsage();
  addProviderUsage(u, { input_tokens: 1200, output_tokens: 150, cache_read_input_tokens: 900 });
  addProviderUsage(u, { input_tokens: 300, output_tokens: 80 });
  check("sums across rounds", u.input === 1500 && u.output === 230 && u.cached === 900, JSON.stringify(u));
  addProviderUsage(u, undefined);
  addProviderUsage(u, { input_tokens: "x", output_tokens: NaN, cache_read_input_tokens: -5 });
  check("missing or junk usage adds nothing (never NaN)", u.input === 1500 && u.output === 230 && u.cached === 900, JSON.stringify(u));

  // ---- recording ----------------------------------------------------------------------------
  let f = fakeDb(undefined);
  await recordAiUsage(f.db, "b", { input: 1000, output: 200, cached: 500 }, 1);
  let d = f.read() as Record<string, number | string>;
  check("first turn creates the month", d.month === month && d.mTurns === 1 && d.mIn === 1000 && d.mOut === 200 && d.mCached === 500, JSON.stringify(d));
  await recordAiUsage(f.db, "b", { input: 400, output: 100, cached: 0 }, 1);
  d = f.read() as Record<string, number | string>;
  check("second turn accumulates", d.mTurns === 2 && d.mIn === 1400 && d.mOut === 300 && d.mCached === 500, JSON.stringify(d));

  f = fakeDb({ month: "2020-01", mTurns: 99, mIn: 9e6, mOut: 9e6, mCached: 9e6 });
  await recordAiUsage(f.db, "b", { input: 10, output: 5, cached: 0 }, 1);
  d = f.read() as Record<string, number | string>;
  check("a new month starts from zero", d.month === month && d.mTurns === 1 && d.mIn === 10 && d.mOut === 5 && d.mCached === 0, JSON.stringify(d));

  // does not clobber the daily counter, and the daily counter does not clobber it
  f = fakeDb({ date: today, count: 3 });
  await recordAiUsage(f.db, "b", { input: 10, output: 5, cached: 0 }, 1);
  d = f.read() as Record<string, number | string>;
  check("metering keeps the daily counter", d.date === today && d.count === 3 && d.mTurns === 1, JSON.stringify(d));
  await enforceAiDailyLimit(f.db, "b", { ...DEFAULT_SETTINGS, aiDailyMessageLimit: 10 });
  await refundAiDailyTurn(f.db, "b");
  d = f.read() as Record<string, number | string>;
  check("daily charge and refund keep the monthly totals", d.mTurns === 1 && d.mIn === 10 && d.count === 3, JSON.stringify(d));

  // refunded turn: tokens booked, turn not
  f = fakeDb(undefined);
  await recordAiUsage(f.db, "b", { input: 700, output: 60, cached: 0 }, 0);
  d = f.read() as Record<string, number | string>;
  check("failed turn books tokens but no turn", d.mTurns === 0 && d.mIn === 700 && d.mOut === 60, JSON.stringify(d));
  f = fakeDb(undefined);
  await recordAiUsage(f.db, "b", emptyAiUsage(), 0);
  check("failed turn with no tokens writes nothing", f.read() === undefined);

  // never throws
  f = fakeDb(undefined, true);
  let threw = false;
  try { await recordAiUsage(f.db, "b", { input: 1, output: 1, cached: 0 }, 1); } catch { threw = true; }
  check("a failed write never throws into the customer's answer", !threw);

  // ---- reading + cost -----------------------------------------------------------------------
  check("no usage this month -> null", readAiMonthUsage(undefined) === null && readAiMonthUsage({ month: "2020-01", mTurns: 5 }) === null);
  const r = readAiMonthUsage({ month, mTurns: 40, mIn: 200_000, mOut: 20_000, mCached: 600_000 });
  check("reads this month", !!r && r.turns === 40 && r.inputTokens === 200_000, JSON.stringify(r));
  // 0.2M*0.30 + 0.02M*1.20 + 0.6M*0.006 = 0.06 + 0.024 + 0.0036
  check("cost estimate uses peak list prices", Math.abs(estimateAiCostUsd({ inputTokens: 200_000, outputTokens: 20_000, cachedTokens: 600_000 }) - 0.0876) < 1e-9);
  check("zero usage costs zero", estimateAiCostUsd({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 }) === 0);

  // ---- wiring -------------------------------------------------------------------------------
  const root = join(__dirname, "..");
  const chat = readFileSync(join(root, "app/api/ai/chat/route.ts"), "utf8");
  const price = readFileSync(join(root, "app/api/ai/suggest-price/route.ts"), "utf8");
  const admin = readFileSync(join(root, "app/api/admin/businesses/route.ts"), "utf8");
  check("chat route meters every model call", !/await callClaude\(\{/.test(chat) && (chat.match(/await metered\(\{/g) ?? []).length === 2);
  check("chat route books a finished turn and a refunded one", chat.includes("recordAiUsage(db, businessId, usage, 1)") && chat.includes("usage, 0)"));
  check("suggest-price books usage", price.includes("recordAiUsage(db, businessId, usage, 1)"));
  check("suggest-price validates the name before charging a turn", price.indexOf("Enter a name first") < price.indexOf("await enforceAiDailyLimit("));
  check("admin list returns this month's AI use", admin.includes("readAiMonthUsage") && admin.includes("aiMonth"));

  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nAll checks passed.");
}
main();
