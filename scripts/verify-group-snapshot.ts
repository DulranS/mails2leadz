// The monthly summary a business publishes for its group (lib/groupSnapshot.ts): the same figures the business shows, cost of sales and costs
// worked from the profit, the last 24 months only, no future months, and the rules and screen wiring. Run: npx tsx scripts/verify-group-snapshot.ts
import fs from "node:fs";
import { buildSnapshot, SNAPSHOT_MONTHS } from "../lib/groupSnapshot";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const snap = buildSnapshot([
  { month: "2026-10", totalRevenue: 1000, grossProfit: 600, netProfitAfterTax: 300 },
  { month: "2026-12", totalRevenue: 9999, grossProfit: 1, netProfitAfterTax: 1 },   // a future month: left out
], { businessName: "Shop", currency: "LKR", today: "2026-11-12" });
ok(snap.months.length === 1 && snap.months[0].month === "2026-10", "months after today are not published");
ok(snap.months[0].revenue === 1000 && snap.months[0].costOfSales === 400 && snap.months[0].costsAndTax === 300 && snap.months[0].netProfit === 300, "cost of sales is revenue less gross profit (400), costs and tax is gross profit less net profit (300)");
ok(snap.businessName === "Shop" && snap.currency === "LKR", "the name and the currency are the business's own");

const many = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2024, i, 1));
  return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, totalRevenue: 1, grossProfit: 1, netProfitAfterTax: 1 };
});
const s2 = buildSnapshot(many, { businessName: "", currency: "USD", today: "2026-12-31" });
ok(s2.months.length === SNAPSHOT_MONTHS && s2.months[s2.months.length - 1].month === "2026-06" && s2.businessName === "Business", "only the last 24 months are published, oldest first; a missing name is given a plain one");

const grp = read("contexts/DataContext.tsx");
ok(read("firestore.rules").includes("match /groupSnapshots/{docId}") && read("firestore.rules").includes("match /intercompany/{docId}") && read("firestore.rules").includes("match /groups/{docId}"), "snapshots, group membership and transfers each have a rule");
ok(read("components/ops/GroupSnapshotSync.tsx").includes("buildSnapshot(") && read("components/ops/GroupSnapshotSync.tsx").includes("groupSnapshots"), "a business publishes its summary while an owner or manager has it open");
ok(read("components/ops/GroupPanel.tsx").includes("consolidate(") && read("components/ops/GroupPanel.tsx").includes("validateGroup("), "the group screen adds the businesses together and checks the group first");
ok(read("lib/operations.ts").includes("\"group\"") && read("lib/operations.ts").includes("OWNER_ONLY"), "the group screen is for the owner alone");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
