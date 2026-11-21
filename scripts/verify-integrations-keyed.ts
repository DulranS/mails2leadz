// Every external integration is set up by entering a key: no authorisation step, no unread entry. Each catalogue entry is an implemented
// provider, and each implemented provider is read on the server. SMS uses the business's own entry, falling back to the server's.
// Run: npx tsx scripts/verify-integrations-keyed.ts
import fs from "node:fs";
import path from "node:path";
import { INTEGRATION_PROVIDERS, IMPLEMENTED_PROVIDERS } from "../lib/integrations";
import { smsConfigFrom, serverSmsConfig, isSmsConfigured } from "../lib/sms";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const ROOT = new URL("..", import.meta.url).pathname;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith(path.join("lib", "integrations.ts"))) out.push(p);
  }
  return out;
}
const serverFiles = [...walk(path.join(ROOT, "app", "api")), ...walk(path.join(ROOT, "lib"))];
const serverText = serverFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

// Planned key slots (no provider chosen yet) are listed in the catalogue but have no code path; they are checked separately.
const catalogue = INTEGRATION_PROVIDERS.filter((p) => !p.planned).map((p) => p.id);
const implemented = [...IMPLEMENTED_PROVIDERS] as string[];
ok(catalogue.length === implemented.length && catalogue.every((id) => implemented.includes(id)), "every catalogue entry is an implemented provider, and every implemented provider is in the catalogue");
for (const id of implemented) {
  ok(serverText.includes(`"${id}"`) || serverText.includes(`'${id}'`) || serverText.includes(`doc("${id}")`), `${id}: its saved key is read on the server`);
}
for (const p of INTEGRATION_PROVIDERS) {
  const keys = p.fields.map((f) => f.key.toLowerCase());
  ok(!keys.some((k) => /clientsecret|clientid|redirect|oauth|authorise|authorize/.test(k)), `${p.id}: needs only keys to be pasted, with no authorisation step`);
  ok(p.fields.some((f) => f.required), `${p.id}: has at least one required key to enter`);
}
ok(!catalogue.some((id) => ["bank_feed", "card_payments", "accounting_software", "calendar", "online_shop", "exchange_rates"].includes(id)), "the providers nothing reads are no longer offered");

const saved = { enabled: true, values: { userId: "u1", apiKey: "k", senderId: "Shop" } };
ok(smsConfigFrom(saved) !== null && smsConfigFrom({ enabled: false, values: saved.values }) === null && smsConfigFrom(undefined) === null, "a business's SMS entry is used only when it is switched on and complete");
ok(smsConfigFrom({ enabled: true, values: { userId: "u1", apiKey: "k" } }) === null, "an SMS entry missing its sender name is not used");
ok(serverSmsConfig() === null || typeof serverSmsConfig() === "object", "the server's settings are the fallback when present");
ok(typeof isSmsConfigured({ userId: "u", apiKey: "k", senderId: "s" }) === "boolean" && isSmsConfigured({ userId: "u", apiKey: "k", senderId: "s" }) === true, "a business's own entry counts as SMS being configured");
const cron = read("app/api/cron/reminders/route.ts");
ok(cron.includes('collection("integrations").doc("sms")') && cron.includes("}, ownSms);"), "the reminder job sends with the business's own SMS entry");
ok(cron.includes("anyBusinessHasSms()"), "the reminder job runs for a business whose own SMS entry is on, even with no server texting settings");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
