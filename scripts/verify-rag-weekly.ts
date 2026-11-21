// KPI red, amber and green (lib/kpiRag.ts), the review's KPI ordering, the weekly review switch, and the Monday logic on the Agenda.
// Run: npx tsx scripts/verify-rag-weekly.ts
import fs from "node:fs";
import { kpiRag, DEFAULT_AMBER_PCT } from "../lib/kpiRag";
import { buildReviewPack, type ReviewPackInput } from "../lib/reviewPack";
import { resolveAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const at = (v: number) => [{ id: "r1", period: "2026-10", value: v }] as never;

ok(DEFAULT_AMBER_PCT === 10, "the amber band defaults to 10% of target");
ok(kpiRag({ target: 95, direction: "higher", readings: at(96) }).rag === "green", "meeting a higher-is-better target is green");
ok(kpiRag({ target: 100, direction: "higher", readings: at(92) }).rag === "amber", "missing by 8 of 100 is amber under the 10% band");
ok(kpiRag({ target: 100, direction: "higher", readings: at(85) }).rag === "red", "missing by 15 of 100 is red");
ok(kpiRag({ target: 100, direction: "higher", amberPct: 20, readings: at(85) }).rag === "amber", "a wider amber band on this KPI makes the same miss amber");
ok(kpiRag({ target: 10, direction: "lower", readings: at(10.5) }).rag === "amber" && kpiRag({ target: 10, direction: "lower", readings: at(12) }).rag === "red", "for a lower-is-better KPI, going over the target is judged the same way");
ok(kpiRag({ target: 10, direction: "lower", readings: at(9) }).rag === "green", "a lower-is-better KPI under its target is green");
ok(kpiRag({ target: 100, direction: "higher", readings: [] }).rag === "none", "no reading means no colour, not red");

const base: ReviewPackInput = {
  escalations: [], decisionsDue: [], kpisOffTarget: [], capacityProblems: [], complianceDue: [], incidentsOpen: [],
  pendingRequests: 0, proceduresToRead: 0, risksToReview: [], objectivesOverdue: [], areasWithNoOwner: [],
};
const pack = buildReviewPack({
  ...base,
  kpisOffTarget: [
    { name: "Amber one", latest: 92, target: 100, unit: "%", hasDecision: true, rag: "amber" },
    { name: "Red one", latest: 70, target: 100, unit: "%", hasDecision: true, rag: "red" },
  ],
});
const kpis = pack.find((s) => s.key === "kpis")!;
ok(kpis.items[0].startsWith("RED: Red one") && kpis.items[1].startsWith("AMBER: Amber one"), "red KPIs come before amber in the review, and each line says which colour it is");
ok(buildReviewPack({ ...base, kpisOffTarget: [{ name: "Old", latest: 1, target: 2, unit: "x", hasDecision: true }] })[0].items[0].startsWith("Old:"), "a KPI without a colour is listed as before, with no colour prefix");

ok(resolveAutomations(undefined).alertWeeklyReview === true && resolveAutomations({ alertWeeklyReview: false }).alertWeeklyReview === false, "the Monday operations review is on by default and can be switched off");
const agenda = read("app/agenda/page.tsx");
ok(agenda.includes("getUTCDay() === 1") && agenda.includes("reviewSections.reduce") && agenda.includes('authRole !== "owner" && authRole !== "manager"'), "the operations review reaches the Agenda on Mondays, for owners and managers, only when there are items");
ok(read("lib/agenda.ts").includes('push(x.dueOn, "review", x.title, "Management review")'), "the operations review is a listed item on the Agenda");
ok(read("components/ops/useReviewSections.ts").includes("kpiRag(kpiWithLive(k, live, today))") && read("components/ops/ReviewPackPanel.tsx").includes("useReviewSections"), "the review tab and the Agenda share one agenda, built from the same colours");
ok(read("components/ops/RecordsPanels.tsx").includes("RAG_TONE") && read("components/ops/RecordsPanels.tsx").includes("Amber if within"), "each KPI shows its colour, and the amber band can be set on it");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
