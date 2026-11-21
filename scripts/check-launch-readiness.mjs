// Pre-launch sanity check. Plain Node, no dependencies.
//
//   node scripts/check-launch-readiness.mjs            # checks .env.local + the source tree
//   node scripts/check-launch-readiness.mjs --env path/to/.env.production
//
// Exits non-zero if anything a paying customer or a prospect would hit is
// still unfinished. It cannot check things that live in the Firebase or
// Resend consoles — those are listed in DEPLOY-CHECKLIST.md.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : join(root, ".env.local");

let failures = 0;
const fail = (m) => { failures++; console.error("FAIL:", m); };
const ok = (m) => console.log("OK:  ", m);
const warn = (m) => console.warn("WARN:", m);

// --- env -------------------------------------------------------------------
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  ok(`read ${envFile}`);
} else {
  warn(`${envFile} not found — checking process environment only`);
}

const required = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", "Firebase web config"],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "Firebase web config"],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "Firebase web config"],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "Firebase web config — the app refuses to start without it, and logo upload needs it"],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "Firebase web config — the app refuses to start without it (every page shows an error)"],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", "Firebase web config"],
  ["NEXT_PUBLIC_SITE_URL", "used by sitemap/robots/social previews — must be your real https URL"],
  ["ADMIN_PASSCODE", "the admin panel and every /api/admin/* route refuse to work without it"],
  ["FIREBASE_PROJECT_ID", "server-side Admin SDK: provisioning, trial requests, AI, billing"],
  ["FIREBASE_CLIENT_EMAIL", "server-side Admin SDK"],
  ["FIREBASE_PRIVATE_KEY", "server-side Admin SDK"],
  ["NEXT_PUBLIC_SUPPORT_EMAIL", "shown on suspended/expired screens and on /legal — customers need a way to reach you"],
];
for (const [key, why] of required) {
  if (!env[key]) fail(`${key} is not set (${why})`);
  else ok(`${key} is set`);
}
if (env.NEXT_PUBLIC_SITE_URL && !/^https:\/\//.test(env.NEXT_PUBLIC_SITE_URL)) fail("NEXT_PUBLIC_SITE_URL should start with https://");
if (env.NEXT_PUBLIC_ADMIN_PASSCODE) fail("NEXT_PUBLIC_ADMIN_PASSCODE is set — that value ships in the browser bundle. Delete it and use ADMIN_PASSCODE with a NEW value.");
if (env.ADMIN_PASSCODE && env.ADMIN_PASSCODE.length < 12) fail("ADMIN_PASSCODE is shorter than 12 characters — it is the only gate to every customer's data and the per-IP lockout is not a substitute for a strong value. Use 16+ random characters.");
if (/@resend\.dev\s*>?\s*$/i.test(env.TRIAL_NOTIFICATION_FROM_EMAIL || "")) fail("TRIAL_NOTIFICATION_FROM_EMAIL is Resend's sandbox address (onboarding@resend.dev), which only delivers to the owner of the Resend account — every customer email (welcome, set-password link, receipts) will fail. Verify your own domain in Resend and use an address on it.");
if (env.NEXT_PUBLIC_SUPPORT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NEXT_PUBLIC_SUPPORT_EMAIL.trim())) fail("NEXT_PUBLIC_SUPPORT_EMAIL is not a plain email address — it is used as the Reply-To on customer emails, and Resend rejects the whole message when it is malformed.");
if (!env.NEXT_PUBLIC_SUPPORT_WHATSAPP && !env.NEXT_PUBLIC_SUPPORT_EMAIL) warn("No support contact set (NEXT_PUBLIC_SUPPORT_WHATSAPP / NEXT_PUBLIC_SUPPORT_EMAIL) — a customer whose trial ends has no way to reach you from the app");
if (!env.NEXT_PUBLIC_SUPPORT_RESPONSE_TIME) warn("NEXT_PUBLIC_SUPPORT_RESPONSE_TIME not set — decide how fast you will answer support and say so (e.g. \"within one working day\") before the first customer");
if (!env.NEXT_PUBLIC_PAYMENT_INSTRUCTIONS) warn("NEXT_PUBLIC_PAYMENT_INSTRUCTIONS not set — payment reminders and the owner's plan card won't say how to pay, so every customer will have to ask");
if (!env.DEMO_EMAIL && !env.NEXT_PUBLIC_DEMO_EMAIL) warn("DEMO_EMAIL not set — the \"Try it now\" button looks for the demo business under the default address in lib/demoAccount.ts. Set DEMO_EMAIL to the email of a business made with Admin → Create demo business (it must be plan \"Demo\" and complimentary, or the demo refuses to open)");
if (env.NEXT_PUBLIC_DEMO_PASSWORD) warn("NEXT_PUBLIC_DEMO_PASSWORD is set but no longer used — the demo signs in with a server-issued token now. Delete it so a password isn't baked into your site's JavaScript");
if (!env.CRON_SECRET) warn("CRON_SECRET not set — the daily job is off, so the public demo is only reset when someone opens it after it has sat idle, and expired trial intake isn't cleaned up. Set it (see DEPLOY-CHECKLIST)");
for (const key of ["DEEPSEEK_API_KEY"]) if (!env[key]) warn(`${key} not set — the AI Assistant will show an error (everything else works)`);
for (const key of ["RESEND_API_KEY", "TRIAL_NOTIFICATION_FROM_EMAIL"]) {
  if (!env[key]) warn(`${key} not set — customers will NOT get automatic welcome/receipt/reminder emails (activation falls back to Firebase's plain password-reset email) and you will not be emailed about new leads; check /admin/new-business by hand`);
}
if (!env.ADMIN_NOTIFICATION_EMAIL) warn("ADMIN_NOTIFICATION_EMAIL not set — you will NOT be emailed about new trial requests, feedback, or the morning digest; check /admin/new-business by hand");
if (!env.CRON_SECRET || env.CRON_SECRET.length < 16) warn("CRON_SECRET not set (or under 16 characters) — the daily reminder job and morning digest are OFF; trials and renewals will not be reminded automatically");

// Instant activation is a business decision with a real cost (a trial can use the AI assistant), so
// say plainly what it does to the pipeline instead of leaving it a silent switch.
if (["true", "1", "yes", "on"].includes((env.AUTO_ACTIVATE_TRIALS ?? "").trim().toLowerCase())) {
  if (!env.RESEND_API_KEY || !env.TRIAL_NOTIFICATION_FROM_EMAIL) {
    fail("AUTO_ACTIVATE_TRIALS is on but email is not configured — accounts would be created with no way for the owner to be told. Set RESEND_API_KEY and TRIAL_NOTIFICATION_FROM_EMAIL, or turn it off");
  } else {
    warn(`AUTO_ACTIVATE_TRIALS is ON — any visitor with a working email address gets a trial account (cap ${env.AUTO_ACTIVATE_MAX_PER_DAY || 10}/day). Make sure that is what you want`);
  }
}
// The confirm-your-email step (lib/trialIntakeServer.ts) is what keeps junk and other people's
// addresses out of the queue. It needs working email; without it the form degrades to the old
// behaviour — leads are kept, flagged "unconfirmed" — so say so plainly rather than let it pass.
if (!env.RESEND_API_KEY || !env.TRIAL_NOTIFICATION_FROM_EMAIL) {
  warn("Trial requests will be saved UNCONFIRMED — email is not configured, so no confirmation link can be sent and nobody proves they own the address they typed. The Gmail-only rule, rate limits and abuse scoring still apply, but the strongest protection is off. Set RESEND_API_KEY and TRIAL_NOTIFICATION_FROM_EMAIL");
}
if (!env.NEXT_PUBLIC_SITE_URL) warn("NEXT_PUBLIC_SITE_URL not set — confirmation links fall back to the host the request arrived on. Set it so every emailed link points at your real domain");
if (env.TRIAL_EMAIL_DOMAINS && env.TRIAL_EMAIL_DOMAINS.trim() === "*") warn("TRIAL_EMAIL_DOMAINS=* — any email provider can request a trial (throwaway domains are still refused). Gmail-only is the default and the stricter choice");
if (env.LINK_SIGNING_SECRET && env.LINK_SIGNING_SECRET.length < 16) warn("LINK_SIGNING_SECRET is under 16 characters — it is ignored and the sign-in link key is derived from FIREBASE_PRIVATE_KEY instead");

// --- source tree -----------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(root);

for (const f of files) {
  if (/serviceAccountKey\.json$/.test(f) || /-firebase-adminsdk-.*\.json$/.test(f)) fail(`a service account key file is in the project: ${f.replace(root, "")}`);
}
// Real secret-holding env files (.env.local, .env.production, etc.) are
// gitignored and are SUPPOSED to contain the actual private key — that's
// where FIREBASE_PRIVATE_KEY above is read from. Only .env.local.example is
// committed (see .gitignore's `!.env.local.example`), so that's the one
// dotenv-style file worth scanning for an accidentally-real key. Matching
// every ".env*" file here (the old `env.*` pattern) made this fail on every
// correctly configured deployment, since the required key legitimately
// lives in .env.local — the one false positive this script could not stop
// reporting.
const keyHits = files.filter((f) => {
  const base = f.split("/").pop() ?? "";
  const isSourceFile = /\.(ts|tsx|js|mjs|json|md|txt)$/.test(f);
  const isCommittedEnvTemplate = base === ".env.local.example" || base === ".env.example";
  return (isSourceFile || isCommittedEnvTemplate) && !f.endsWith("check-launch-readiness.mjs");
}).filter((f) => { try { return readFileSync(f, "utf8").includes("BEGIN PRIVATE KEY"); } catch { return false; } });
for (const f of keyHits) fail(`a private key is embedded in ${f.replace(root, "")}`);

const legal = readFileSync(join(root, "app/legal/page.tsx"), "utf8");
const body = legal.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const placeholders = body.match(/\[[A-Z][A-Z /]{3,}\]/g);
if (placeholders) fail(`app/legal/page.tsx still has placeholders: ${[...new Set(placeholders)].join(", ")}`);
else ok("legal page has no [PLACEHOLDER] text");

const rules = readFileSync(join(root, "firestore.rules"), "utf8");
if (/request\.resource\.data\.businessId == uid/.test(rules)) fail("firestore.rules still lets any signed-in user create their own business (memberships branch) — deploy the updated rules AFTER testing server-side provisioning");
else ok("firestore.rules: no self-serve business creation");

console.log(failures ? `\n${failures} problem(s) to fix before launch.` : "\nNo blocking problems found (see WARN lines and DEPLOY-CHECKLIST.md for what this script cannot check).");
process.exit(failures ? 1 : 0);
