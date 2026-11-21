// Outgoing email pacing and 429 retry (lib/email.ts). Mocks fetch; no network, no real waiting.
// Run: npx tsx scripts/verify-email-retry.ts
import { sendEmail, retryDelayMs, emailPacing, explainEmailFailure } from "../lib/email";

let fails = 0, checks = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { fails++; console.error("FAIL:", m); } };

process.env.RESEND_API_KEY = "re_test";
process.env.TRIAL_NOTIFICATION_FROM_EMAIL = "Balancr <hello@example.com>";
const realFetch = globalThis.fetch;
const msg = { to: "a@b.co", subject: "s", text: "t" };
type R = { ok: boolean; status: number; headers: { get: (k: string) => string | null }; text: () => Promise<string> };
const res = (status: number, retryAfter: string | null = null): R => ({ ok: status < 300, status, headers: { get: (k) => (k.toLowerCase() === "retry-after" ? retryAfter : null) }, text: async () => `body${status}` });
function mock(seq: R[]) { let i = 0; const calls: number[] = []; globalThis.fetch = (async () => { calls.push(Date.now()); return seq[Math.min(i++, seq.length - 1)]; }) as unknown as typeof fetch; return calls; }

async function main() {
  emailPacing.minGapMs = 0; emailPacing.maxWaitMs = 5;

  // Not configured -> false, no call.
  const saveKey = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  let calls = mock([res(200)]);
  ok((await sendEmail(msg)) === false && calls.length === 0, "unconfigured: false and no request");
  process.env.RESEND_API_KEY = saveKey;

  calls = mock([res(200)]);
  ok((await sendEmail(msg)) === true && calls.length === 1, "success: one request");

  calls = mock([res(429), res(200)]);
  ok((await sendEmail(msg)) === true && calls.length === 2, "one 429 then success: retried once");

  calls = mock([res(429), res(429), res(200)]);
  ok((await sendEmail(msg)) === true && calls.length === 3, "two 429s then success: 3 requests");

  calls = mock([res(429)]);
  let err = ""; try { await sendEmail(msg); } catch (e) { err = String(e); }
  ok(calls.length === 3 && err.includes("(429)"), `persistent 429: gives up after 3 requests with the 429 error (got ${calls.length})`);
  ok(explainEmailFailure(new Error(err)).toLowerCase().includes("limit"), "429 still explained to the admin");

  calls = mock([res(422)]);
  err = ""; try { await sendEmail(msg); } catch (e) { err = String(e); }
  ok(calls.length === 1 && err.includes("(422)"), "422 is not retried");
  calls = mock([res(401)]);
  err = ""; try { await sendEmail(msg); } catch (e) { err = String(e); }
  ok(calls.length === 1 && err.includes("(401)"), "401 is not retried");
  calls = mock([res(500)]);
  err = ""; try { await sendEmail(msg); } catch (e) { err = String(e); }
  ok(calls.length === 1 && err.includes("(500)"), "500 is not retried (could double-send)");

  // retryDelayMs
  emailPacing.maxWaitMs = 5000;
  ok(retryDelayMs("2", 0) === 2000, "honours Retry-After seconds");
  ok(retryDelayMs(null, 0) === 1000 && retryDelayMs(null, 1) === 2000, "no header: 1s then 2s");
  ok(retryDelayMs("999", 0) === 5000, "capped at maxWaitMs");
  ok(retryDelayMs("garbage", 1) === 2000 && retryDelayMs("0", 0) === 1000, "junk or zero header falls back");

  // Pacing: 4 concurrent sends are spaced by the minimum gap.
  emailPacing.minGapMs = 40; emailPacing.maxWaitMs = 5;
  calls = mock([res(200)]);
  await Promise.all([sendEmail(msg), sendEmail(msg), sendEmail(msg), sendEmail(msg)]);
  const gaps = calls.slice(1).map((t, i) => t - calls[i]);
  ok(calls.length === 4 && gaps.every((g) => g >= 30), `concurrent sends are spaced out (gaps ${gaps.join(",")}ms)`);

  globalThis.fetch = realFetch;
  console.log(fails === 0 ? `OK: ${checks} checks` : `${fails} of ${checks} checks FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
