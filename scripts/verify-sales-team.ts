// Sales team scorecard (lib/salesTeam.ts): per-person revenue, orders, order value, lead conversion and attainment against a monthly target,
// the behind-target flag, the review entry, the target storage and the tab. Run: npx tsx scripts/verify-sales-team.ts
import fs from "node:fs";
import { salesTeamFor, BEHIND_TARGET_BELOW_PCT } from "../lib/salesTeam";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse(`${TODAY}T12:00:00Z`);
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const sales = [
  { id: "a1", date: day(2), qty: 1, unitPrice: 400, invoiceId: "i1", createdByUid: "u1", createdByName: "Nimal" },
  { id: "a2", date: day(5), qty: 1, unitPrice: 600, createdByUid: "u1", createdByName: "Nimal" },
  { id: "b1", date: day(3), qty: 1, unitPrice: 200, createdByUid: "u2", createdByName: "Ruwan" },
  { id: "c1", date: day(40), qty: 1, unitPrice: 9999, createdByUid: "u1", createdByName: "Nimal" }, // outside 30 days
  { id: "d1", date: day(1), qty: 1, unitPrice: 300 }, // unattributed
];
const leads = [
  { createdAt: NOW - 3 * 86_400_000, stage: "won", ownerUid: "u1", ownerName: "Nimal" },
  { createdAt: NOW - 4 * 86_400_000, stage: "lost", ownerUid: "u1", ownerName: "Nimal" },
  { createdAt: NOW - 5 * 86_400_000, stage: "won", ownerUid: "u2", ownerName: "Ruwan" },
  { createdAt: NOW - 50 * 86_400_000, stage: "won", ownerUid: "u1", ownerName: "Nimal" }, // outside
];
const rows = salesTeamFor(sales, leads, { u1: 1000, u2: 1000 }, TODAY, NOW);
const nim = rows.find((r) => r.key === "u1")!;
const ruw = rows.find((r) => r.key === "u2")!;

ok(nim.revenue30 === 1000 && nim.orders30 === 2 && nim.averageOrder === 500, "a person's revenue and orders are the sales recorded against them in the last 30 days");
ok(nim.leads30 === 2 && nim.won30 === 1 && nim.conversionPct === 50, "a person's lead conversion counts only their own leads from the last 30 days");
ok(nim.target === 1000 && nim.attainmentPct === 100 && !nim.behind, "revenue against a monthly target is the attainment, and meeting it is not behind");
ok(ruw.attainmentPct === 20 && ruw.behind === true && ruw.attainmentPct < BEHIND_TARGET_BELOW_PCT, "a person far under their target is behind");
ok(rows.some((r) => r.key === "unassigned" && r.revenue30 === 300 && r.target === null), "sales not recorded against a person are shown, with no target");
ok(rows[0].key === "u2" && rows.findIndex((r) => r.key === "u2") < rows.findIndex((r) => r.key === "u1"), "the people behind target come first");
const none = salesTeamFor(sales, leads, undefined, TODAY, NOW).find((r) => r.key === "u1")!;
ok(none.target === null && none.attainmentPct === null && none.behind === false, "with no target set, nobody is judged against it");
ok(salesTeamFor([], [], undefined, TODAY, NOW).length === 0, "with no sales or leads the scorecard is empty");

ok(tabsForRole("owner").includes("salesteam") && tabsForRole("manager").includes("salesteam") && !tabsForRole("staff").includes("salesteam"), "the sales team scorecard is for the owner and manager");
ok(read("lib/types.ts").includes("salesTargets?: Record<string, number>;"), "monthly targets are stored in the business settings");
ok(read("components/ops/SalesTeamPanel.tsx").includes("updateSettings({ salesTargets: next })"), "targets are saved to the settings");
ok(read("components/ops/useReviewSections.ts").includes("salesTeamFor(sales, leads, settings.salesTargets") && read("components/ops/useReviewSections.ts").includes("leads, settings.salesTargets, escalations"), "the review reads the targets, and recalculates when they change");
ok(read("lib/reviewPack.ts").includes('title: "Sales team behind target"'), "the review agenda has a sales team section");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
