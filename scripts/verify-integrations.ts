// Integrations (lib/integrations.ts): the catalogue (unique, every field named, secrets marked), status (not set up, keys missing,
// switched off, ready), cleaning what is saved, masking of secrets, and the wiring (owner-only rule, owner-only page, menu entry,
// and keys kept out of the backup). Hand-worked cases.
// Run: npx tsx scripts/verify-integrations.ts
import fs from "node:fs";
import {
  INTEGRATION_PROVIDERS, MAX_INTEGRATION_VALUE, cleanIntegrationValues, displayValue, integrationFor, integrationStatus,
} from "../lib/integrations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

// Catalogue
ok(new Set(INTEGRATION_PROVIDERS.map((p) => p.id)).size === INTEGRATION_PROVIDERS.length, "every service has a unique id");
ok(INTEGRATION_PROVIDERS.every((p) => p.fields.length > 0 && p.fields.every((f) => f.key && f.label)), "every service names its fields");
ok(INTEGRATION_PROVIDERS.every((p) => p.fields.some((f) => f.required)), "every service has at least one required field");
// A publishable key is meant to be public, so it is the one key-like field that is not secret.
ok(INTEGRATION_PROVIDERS.every((p) => p.fields.every((f) => !/key|secret|token/i.test(f.key) || f.secret || f.key === "publishableKey")), "any field that looks like a key, secret or token is marked secret (except a publishable key)");
ok(integrationFor("payhere")?.fields.find((f) => f.key === "merchantSecret")?.secret === true, "a PayHere merchant secret is secret");
ok(integrationFor("nope") === undefined, "an unknown service is not found");

// Status
const bank = integrationFor("payhere")!;
ok(integrationStatus(bank, undefined) === "not_set_up", "nothing saved: not set up");
ok(integrationStatus(bank, { values: {} }) === "not_set_up", "an empty save: not set up");
ok(integrationStatus(bank, { values: { merchantId: "A1" } }) === "partly_set_up", "one of two required keys: keys missing");
ok(integrationStatus(bank, { values: { merchantId: "A1", merchantSecret: "k" }, enabled: false }) === "off", "all required keys but switched off");
ok(integrationStatus(bank, { values: { merchantId: "A1", merchantSecret: "k" }, enabled: true }) === "ready", "all required keys and switched on: ready");
ok(integrationStatus(bank, { values: { merchantId: "A1", merchantSecret: "k" } }) === "off", "a saved service is off until it is switched on");
ok(integrationStatus(bank, { values: { merchantId: "A1", merchantSecret: "k" }, enabled: true }) === "ready" && integrationStatus(bank, { values: { merchantId: "A1" }, enabled: true }) === "partly_set_up", "switching on does not make an incomplete service ready");

// Cleaning
const cleaned = cleanIntegrationValues(bank, { merchantId: "  9  ", merchantSecret: "   ", mode: "s", junk: "x", apiKeyTwo: 5 });
ok(JSON.stringify(cleaned) === JSON.stringify({ merchantId: "9", mode: "s" }), "saving keeps only known fields, trimmed, and drops blanks");
ok(cleanIntegrationValues(bank, { merchantId: "x".repeat(400) }).merchantId.length === MAX_INTEGRATION_VALUE, "a value is capped at 300 characters");
ok(cleanIntegrationValues(bank, { merchantSecret: 12345 as unknown as string }).merchantSecret === undefined, "a value that is not text is dropped");

// Masking
const secret = bank.fields.find((f) => f.key === "merchantSecret")!;
const plain = bank.fields.find((f) => f.key === "merchantId")!;
ok(displayValue(secret, "sk_live_abcd1234") === "••••1234", "a secret shows only its last four characters");
ok(displayValue(secret, "ab") === "••••", "a short secret shows no characters at all");
ok(displayValue(plain, "ACC-7") === "ACC-7", "an ordinary field such as an account ID is shown in full");
ok(displayValue(secret, undefined) === "" && displayValue(secret, "") === "", "nothing saved shows nothing");

// Wiring
const rules = fs.readFileSync("firestore.rules", "utf8");
const block = rules.slice(rules.indexOf("match /integrations/{providerId}"), rules.indexOf("match /integrations/{providerId}") + 300);
ok(/allow read: if isOwner\(businessId\)/.test(block), "only the owner reads the keys");
ok(/allow create, update, delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\)/.test(block), "only the owner changes them, and never in the public demo");
const page = fs.readFileSync("app/integrations/page.tsx", "utf8");
ok(/useRequireRole\(\["owner"\]\)/.test(page), "the Integrations page is for the owner only");
ok(/type=\{f\.secret \? "password" : "text"\}/.test(page), "secret fields are entered as passwords");
ok(/displayValue\(f, current\)/.test(page), "a saved secret is shown masked");
ok(/collection\(db, "users", businessId, "integrations"\)/.test(page), "keys are stored under the business, in their own document");
const shell = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(/href: "\/integrations"[^\n]*roles: \["owner"\][^\n]*group: "Admin"/.test(shell), "the menu entry is for the owner only, in Admin");
const backup = fs.readFileSync("lib/backupPayload.ts", "utf8");
ok(!/integrations/.test(backup), "the keys are not in the full backup");

console.log(`verify-integrations: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
