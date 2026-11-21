// Checks for the POS days list (pass 340): the row shaping, the owner-only read route, and the card on the sales page.
// Run: tsx scripts/verify-pos-days.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { posDayRow } from "../lib/pos-ingest";

let n = 0;
const ok = (fn: () => void, label: string) => { fn(); n++; console.log(`  ok - ${label}`); };

ok(() => {
  const r = posDayRow("2026-11-10", { date: "2026-11-10", status: "matched", expectedTotal: 1200.004, postedTotal: 1200, difference: 0, expectedTransactions: 14.7, postedTransactions: 14, checkedAt: "2026-11-11T08:00:00Z" });
  assert.deepEqual(r, { date: "2026-11-10", status: "matched", expectedTotal: 1200, postedTotal: 1200, difference: 0, expectedTransactions: 14, postedTransactions: 14, checkedAt: "2026-11-11T08:00:00Z" });
}, "a matched day keeps its totals, rounded to cents, and whole sale counts");

ok(() => {
  const r = posDayRow("2026-11-11", { status: "anything", expectedTotal: "x", postedTotal: null });
  assert.equal(r.date, "2026-11-11");
  assert.equal(r.status, "mismatch");
  assert.equal(r.expectedTotal, 0);
  assert.equal(r.postedTotal, 0);
  assert.equal(r.checkedAt, "");
}, "a day with missing or odd values is shown as a mismatch with zeros, never as a crash");

ok(() => {
  const route = fs.readFileSync("app/api/sales/pos-days/route.ts", "utf8");
  assert.match(route, /requireAiContext\(req\)/);
  assert.match(route, /collection\(`users\/\$\{ctx\.businessId\}\/pos_recon`\)\.orderBy\("date", "desc"\)\.limit\(60\)/);
  assert.doesNotMatch(route, /\.(set|update|delete|add)\(/);
}, "the route is owner or manager only, reads the saved checks, and writes nothing");

ok(() => {
  const page = fs.readFileSync("app/sales/page.tsx", "utf8");
  assert.match(page, /import PosDaysCard from "@\/components\/PosDaysCard";/);
  assert.match(page, /<TillDayCheck \/>\s*\n\s*<PosDaysCard \/>/);
}, "the POS days card sits under the till day check on the sales page");

console.log(`pos days: ${n} checks passed`);
