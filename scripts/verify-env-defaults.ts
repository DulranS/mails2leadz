// Optional environment variables really are optional (lib/envDefaults.ts, lib/cronAuth.ts, lib/cronGate.ts).
// Offline. Run: npx tsx scripts/verify-env-defaults.ts
import { configuredSiteUrl, adminInbox } from "../lib/envDefaults";
import { cronAuthMode, requireCronSecret } from "../lib/cronAuth";
import { gateAllows, OPEN_CRON_MIN_GAP_MS } from "../lib/cronGate";
import * as fs from "fs";

let fails = 0, checks = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { fails++; console.error("FAIL:", m); } };
const req = (auth?: string) => new Request("https://x.test/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

// Site URL
ok(configuredSiteUrl({}) === "", "nothing known -> empty");
ok(configuredSiteUrl({ NEXT_PUBLIC_SITE_URL: " https://app.example.com/// " }) === "https://app.example.com", "explicit wins, trimmed");
ok(configuredSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app" }) === "https://my-app.vercel.app", "falls back to Vercel's production domain");
ok(configuredSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "https://my-app.vercel.app/" }) === "https://my-app.vercel.app", "tolerates a scheme on the Vercel value");
ok(configuredSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://a.com", VERCEL_PROJECT_PRODUCTION_URL: "b.vercel.app" }) === "https://a.com", "explicit beats Vercel");
ok(configuredSiteUrl({ NEXT_PUBLIC_SITE_URL: "  " }) === "", "blank is unset");

// Admin inbox
ok(adminInbox({}) === "", "no inbox known -> empty");
ok(adminInbox({ ADMIN_NOTIFICATION_EMAIL: "me@x.com", NEXT_PUBLIC_SUPPORT_EMAIL: "help@x.com" }) === "me@x.com", "own inbox wins");
ok(adminInbox({ NEXT_PUBLIC_SUPPORT_EMAIL: " help@x.com " }) === "help@x.com", "falls back to the support address");
ok(adminInbox({ ADMIN_NOTIFICATION_EMAIL: "  ", NEXT_PUBLIC_SUPPORT_EMAIL: "help@x.com" }) === "help@x.com", "blank own inbox falls back");
ok(adminInbox({ NEXT_PUBLIC_SUPPORT_EMAIL: "not an email" }) === "", "a non-address is never used");

// Cron modes
ok(cronAuthMode({}) === "open" && cronAuthMode({ CRON_SECRET: "" }) === "open", "unset or empty -> open");
ok(cronAuthMode({ CRON_SECRET: "short" }) === "misconfigured", "too short -> misconfigured");
ok(cronAuthMode({ CRON_SECRET: "x".repeat(16) }) === "secret", "16+ -> secret");
ok(requireCronSecret(req(), {}) === null, "open mode lets the caller through to the gate");
const bad = requireCronSecret(req(), { CRON_SECRET: "short" });
ok(bad?.status === 503, "too-short secret -> 503");
const secret = "s".repeat(20);
ok(requireCronSecret(req(), { CRON_SECRET: secret })?.status === 401, "secret mode, no header -> 401");
ok(requireCronSecret(req("Bearer wrong-wrong-wrong-wrong"), { CRON_SECRET: secret })?.status === 401, "secret mode, wrong header -> 401");
ok(requireCronSecret(req(`Bearer ${secret}`), { CRON_SECRET: secret }) === null, "secret mode, right header -> allowed");

// Gate
const T = 1_800_000_000_000;
ok(gateAllows(null, T) && gateAllows(undefined, T), "never ran -> allowed");
ok(!gateAllows(T - 60_000, T), "ran a minute ago -> blocked");
ok(!gateAllows(T - (OPEN_CRON_MIN_GAP_MS - 1), T), "just under the gap -> blocked");
ok(gateAllows(T - OPEN_CRON_MIN_GAP_MS, T), "exactly the gap -> allowed");
ok(gateAllows(T - 24 * 3_600_000, T), "a normal daily cadence is allowed");
ok(!gateAllows(T + 1000, T), "a claim in the future never unlocks the gate");
ok(gateAllows(NaN, T), "garbage stored value is treated as never ran");

// Route wiring (the order matters: check, then gate, then run; open mode never trusts the request or leaks results).
const route = fs.readFileSync("app/api/cron/daily/route.ts", "utf8");
ok(route.indexOf("requireCronSecret(") < route.indexOf("claimOpenCronRun(") && route.indexOf("claimOpenCronRun(") < route.indexOf("runDailyJob("), "auth, then gate, then job");
ok(/req:\s*open \? undefined : req/.test(route), "open mode passes no request (links never built from caller headers)");
ok(/open \? Response\.json\(\{ ok: true, ran: true \}\)/.test(route), "open mode returns no business data");
ok(route.includes("configuredSiteUrl()"), "open mode refuses to run with no trustworthy site address");

// No raw reads of the defaulted variables left outside the helpers.
for (const f of ["lib/dailyJob.ts", "lib/aiProviderAlert.ts", "lib/lifecycleServer.ts", "lib/trialIntakeServer.ts", "app/layout.tsx", "app/sitemap.ts", "app/robots.ts", "app/api/admin/automation/route.ts"]) {
  const src = fs.readFileSync(f, "utf8");
  ok(!/process\.env\.(ADMIN_NOTIFICATION_EMAIL|NEXT_PUBLIC_SITE_URL)/.test(src), `${f} uses the defaults helpers`);
}
const email = fs.readFileSync("lib/email.ts", "utf8");
ok(!/process\.env\.ADMIN_NOTIFICATION_EMAIL/.test(email), "lib/email.ts uses adminInbox()");

console.log(fails === 0 ? `OK: ${checks} checks` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
