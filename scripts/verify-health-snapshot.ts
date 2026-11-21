// Daily health summary and the exceptions drawn from it (lib/healthSnapshot.ts). Hand-worked.
// Run: npx tsx scripts/verify-health-snapshot.ts
import fs from "node:fs";
import { buildHealthSnapshot, readHealthSnapshot, healthExceptions } from "../lib/healthSnapshot";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const base = { today: "2026-10-20", overdueTotal: 0, overdueCount: 0, totalOutstanding: 0, runwayMonths: null, lastMonth: "2026-09", lastMonthNetProfit: 1000 };
const codes = (s: ReturnType<typeof buildHealthSnapshot>, today = "2026-10-20") => healthExceptions(s, today).map((e) => e.code).join(",");

ok(codes(buildHealthSnapshot(base)) === "", "a healthy account has no exceptions");
ok(codes(buildHealthSnapshot({ ...base, overdueTotal: 500, overdueCount: 2, totalOutstanding: 1000 })) === "overdue", "50% overdue is flagged");
ok(codes(buildHealthSnapshot({ ...base, overdueTotal: 499, overdueCount: 2, totalOutstanding: 1000 })) === "", "49.9% overdue is not");
ok(codes(buildHealthSnapshot({ ...base, overdueTotal: 100, totalOutstanding: 0 })) === "", "no outstanding figure: no division by zero, no flag");
ok(codes(buildHealthSnapshot({ ...base, runwayMonths: 2.9 })) === "runway" && codes(buildHealthSnapshot({ ...base, runwayMonths: 3 })) === "", "runway under 3 months is flagged, 3 is not");
ok(codes(buildHealthSnapshot({ ...base, runwayMonths: null })) === "", "not burning cash (null runway) is fine");
ok(codes(buildHealthSnapshot({ ...base, lastMonthNetProfit: -1 })) === "loss" && codes(buildHealthSnapshot({ ...base, lastMonthNetProfit: 0 })) === "", "a loss is flagged, break-even is not");
ok(codes(buildHealthSnapshot({ ...base, lastMonthNetProfit: -50, lastMonth: null })) === "", "a loss with no month named is not flagged (nothing to point at)");
// Staleness is measured from the summary date to today.
ok(codes(buildHealthSnapshot(base), "2026-11-03") === "" && codes(buildHealthSnapshot(base), "2026-11-04") === "stale", "14 days old is fine, 15 is stale");
ok(healthExceptions(buildHealthSnapshot(base), "2026-11-10")[0].text === "App not opened for 21 days", "stale text names the days");
// Several at once, in a stable order.
ok(codes(buildHealthSnapshot({ ...base, overdueTotal: 900, overdueCount: 3, totalOutstanding: 1000, runwayMonths: 1, lastMonthNetProfit: -5 }), "2026-12-01") === "stale,overdue,runway,loss", "all four, in order");

// Building and reading never trust the input.
const dirty = buildHealthSnapshot({ today: "2026-10-20", overdueTotal: -5, overdueCount: -2, totalOutstanding: NaN as unknown as number, runwayMonths: -1, lastMonth: "junk", lastMonthNetProfit: Infinity });
ok(dirty.overdueTotal === 0 && dirty.overdueCount === 0 && dirty.totalOutstanding === 0 && dirty.runwayMonths === null && dirty.lastMonth === null && dirty.lastMonthNetProfit === null, "negative, NaN, infinite and malformed values are cleaned");
ok(readHealthSnapshot(null) === null && readHealthSnapshot("x") === null && readHealthSnapshot({}) === null && readHealthSnapshot({ asOf: "yesterday" }) === null, "a malformed stored document reads as no summary");
const rt = readHealthSnapshot(buildHealthSnapshot({ ...base, overdueTotal: 12.345, overdueCount: 2, totalOutstanding: 99.999, runwayMonths: 4.567 }))!;
ok(rt.overdueTotal === 12.35 && rt.totalOutstanding === 100 && rt.runwayMonths === 4.57 && rt.asOf === "2026-10-20", "round trip keeps cent precision");
ok(Object.keys(buildHealthSnapshot(base)).sort().join() === "asOf,lastMonth,lastMonthNetProfit,overdueCount,overdueTotal,runwayMonths,totalOutstanding", "the stored document holds only these seven plain fields (no names, no free text)");

// The rules block exists, mirrors the billing-history block, and the file's braces still balance.
const rules = fs.readFileSync("firestore.rules", "utf8");
const block = rules.match(/match \/meta\/healthSnapshot \{[\s\S]*?\n      \}/);
ok(!!block, "firestore.rules has a meta/healthSnapshot block");
ok(!!block && /allow read: if isOwner\(businessId\);/.test(block[0]) && /allow write: if isOwner\(businessId\) && !isPublicDemo\(businessId\);/.test(block[0]), "owner-only read; owner write, never the shared demo");
ok((rules.match(/\{/g) ?? []).length === (rules.match(/\}/g) ?? []).length, "firestore.rules braces balance");
ok((rules.match(/\(/g) ?? []).length === (rules.match(/\)/g) ?? []).length, "firestore.rules parentheses balance");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
