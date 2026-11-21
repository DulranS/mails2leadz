// The four open connections (lib/integrations.ts): each is a key-entry service on the Integrations page, with the fields it needs, a secret key that is masked,
// and a purpose that says nothing is sent or changed automatically. The Hobby plan cron limit is respected by the scheduled jobs. Run:
// npx tsx scripts/verify-open-connections.ts
import fs from "node:fs";
import { INTEGRATION_PROVIDERS } from "../lib/integrations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ids = ["esign", "review_posting", "market_prices", "distance_routing"];
for (const id of ids) {
  const p = INTEGRATION_PROVIDERS.find((x) => x.id === id);
  ok(!!p, `${id} is on the Integrations page`);
  if (!p) continue;
  ok(p.fields.some((f) => f.secret && f.key === "apiKey"), `${id} takes a key, stored as a secret and masked`);
  ok(p.fields.some((f) => f.required && !f.secret), `${id} asks for the provider's name, for your records`);
  ok(/Nothing|you first|you decide|are still/i.test(p.purpose) || /Paste the/i.test(p.purpose), `${id} says what it does, and nothing happens without you`);
}
const cron = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
ok(cron.crons.length <= 100 && cron.crons.every((c) => c.schedule.split(" ").length === 5), "the scheduled jobs fit the Hobby plan's limit of 100, each on a daily schedule");
ok(cron.crons.every((c) => /^\d+ \d+ \* \* \*$/.test(c.schedule)), "every scheduled job runs once a day, which the Hobby plan allows");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
