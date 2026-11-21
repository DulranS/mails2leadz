// Empirical check for the AI daily-turn refund and the customer-facing provider error
// (lib/aiUsageLimit.ts, lib/apiError.ts).
//
// Run: npx tsx scripts/verify-ai-turn-refund.ts

import type { Firestore } from "firebase-admin/firestore";
import { enforceAiDailyLimit, refundAiDailyTurn } from "../lib/aiUsageLimit";
import { aiErrorResponse } from "../lib/apiError";
import { AnthropicApiError } from "../lib/anthropic";
import { DEFAULT_SETTINGS } from "../lib/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`);
  if (!ok) failed++;
}

// Minimal in-memory stand-in for the one document these functions touch.
function fakeDb(initial?: { date: string; count: number }, failWrites = false) {
  let data: { date?: string; count?: number } | undefined = initial;
  const ref = {};
  const db = {
    doc: () => ref,
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      if (failWrites) throw new Error("firestore down");
      await fn({
        get: async () => ({ data: () => data }),
        set: (_r: unknown, v: { date: string; count: number }) => {
          data = { ...(data ?? {}), ...v };
        },
      });
    },
  } as unknown as Firestore;
  return { db, read: () => data };
}

const today = new Date().toISOString().slice(0, 10);
const settings = { ...DEFAULT_SETTINGS, aiDailyMessageLimit: 3 };

async function main() {
  // charge then refund returns the counter to where it was
  let f = fakeDb({ date: today, count: 1 });
  await enforceAiDailyLimit(f.db, "b", settings);
  check("charge increments to 2", f.read()?.count === 2);
  await refundAiDailyTurn(f.db, "b");
  check("refund brings it back to 1", f.read()?.count === 1, JSON.stringify(f.read()));

  // never below zero
  f = fakeDb({ date: today, count: 0 });
  await refundAiDailyTurn(f.db, "b");
  check("refund at 0 stays 0", f.read()?.count === 0);

  // no document yet: nothing created
  f = fakeDb(undefined);
  await refundAiDailyTurn(f.db, "b");
  check("refund with no counter creates nothing", f.read() === undefined);

  // a counter from a previous day is left alone
  f = fakeDb({ date: "2020-01-01", count: 5 });
  await refundAiDailyTurn(f.db, "b");
  check("refund ignores a previous day's counter", f.read()?.count === 5 && f.read()?.date === "2020-01-01");

  // a failed refund never throws (it must not mask the original error)
  f = fakeDb({ date: today, count: 2 }, true);
  let threw = false;
  const origErr = console.error;
  console.error = () => {};
  try {
    await refundAiDailyTurn(f.db, "b");
  } catch {
    threw = true;
  }
  console.error = origErr;
  check("failed refund does not throw", !threw);

  // cap still enforced at the limit
  f = fakeDb({ date: today, count: 3 });
  let blocked = false;
  try {
    await enforceAiDailyLimit(f.db, "b", settings);
  } catch (e) {
    blocked = (e as { status?: number }).status === 429;
  }
  check("cap still blocks at the limit with 429", blocked);

  // provider errors: sanitized, never the provider's status or text
  delete process.env.ADMIN_NOTIFICATION_EMAIL; // the owner-alert path must stay a no-op in tests
  console.error = () => {};
  const bad = await aiErrorResponse(new AnthropicApiError("AI Assistant API error (402): Insufficient Balance", 402), "t");
  const busy = await aiErrorResponse(new AnthropicApiError("rate limited sk-secret", 429), "t");
  console.error = origErr;
  const badBody = (await bad.json()) as { error: string };
  const busyBody = (await busy.json()) as { error: string };
  check("402 from provider becomes 502 (not a sign-in style status)", bad.status === 502, String(bad.status));
  check("provider text not shown to customer", !/402|Insufficient|Balance/i.test(badBody.error), badBody.error);
  check("429 from provider becomes 503 with a retry message", busy.status === 503 && /try again/i.test(busyBody.error));
  check("provider detail not leaked on 429", !/sk-secret/.test(busyBody.error));

  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
