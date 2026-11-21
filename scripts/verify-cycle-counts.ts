// Cycle counting (lib/cycleCount.ts): ABC classification by value, the cadence by class, the last count from count corrections only, the
// due list, and the wiring to the tab and the Agenda. Run: npx tsx scripts/verify-cycle-counts.ts
import fs from "node:fs";
import { classifyByValue, cycleCountPlan, lastCountedByProduct, CYCLE_CADENCE_DAYS } from "../lib/cycleCount";
import { tabsForRole } from "../lib/operations";
import { resolveAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// Values: 100, 40, 30, 20, 10 (total 200). Share of total value held before each item: 0%, 50%, 70%, 85%, 95%.
// An item that starts below 80% is A (so the one that takes the running total past 80% is A); one starting below 95% is B; the rest are C.
const items = [
  { productId: "p1", name: "Gold", value: 100 },
  { productId: "p2", name: "Silver", value: 40 },
  { productId: "p3", name: "Bronze", value: 30 },
  { productId: "p4", name: "Tin", value: 20 },
  { productId: "p5", name: "Chalk", value: 10 },
  { productId: "p6", name: "Air", value: 0 },
];
const cls = Object.fromEntries(classifyByValue(items).map((i) => [i.productId, i.cls]));
ok(cls.p1 === "A" && cls.p2 === "A" && cls.p3 === "A" && cls.p4 === "B", "items that start below 80% of total value are A; items that start below 95% are B");
ok(cls.p5 === "C" && cls.p6 === undefined, "the rest are C, and stock with no value is not classified at all");
ok(CYCLE_CADENCE_DAYS.A === 30 && CYCLE_CADENCE_DAYS.B === 90 && CYCLE_CADENCE_DAYS.C === 365, "A is counted monthly, B quarterly, C yearly");

const adjustments = [
  { productId: "p1", reason: "count_correction", date: daysAgo(40) },
  { productId: "p1", reason: "count_correction", date: daysAgo(5) }, // the latest count wins
  { productId: "p2", reason: "theft", date: daysAgo(1) }, // not a count
  { productId: "p3", reason: "count_correction", date: daysAgo(10) },
];
const last = lastCountedByProduct(adjustments);
ok(last.get("p1") === daysAgo(5) && !last.has("p2"), "the last count is the latest count correction; breakage and theft are not counts");

const plan = cycleCountPlan(items, adjustments, TODAY);
const byId = (id: string) => plan.find((i) => i.productId === id)!;
ok(byId("p1").due === false, "Gold, counted 5 days ago, is not due for a month");
ok(byId("p2").due === true && byId("p2").lastCounted === null && byId("p2").dueOn === TODAY, "an item never counted is due now");
ok(byId("p3").cls === "A" && byId("p3").due === false, "Bronze, an A item counted 10 days ago, is not due for a month");
ok(plan.filter((i) => i.due).every((i, idx, arr) => idx === 0 || arr[idx - 1].cls <= i.cls || !arr[idx - 1].due), "due items come first, A before B before C");

const old = cycleCountPlan([{ productId: "x", name: "Old", value: 500 }], [{ productId: "x", reason: "count_correction", date: daysAgo(40) }], TODAY)[0];
ok(old.cls === "A" && old.due === true && old.daysLate === 10, "an A item last counted 40 days ago is due 10 days late");
ok(cycleCountPlan([], [], TODAY).length === 0, "no stock gives an empty plan");

ok(tabsForRole("owner").includes("cyclecounts") && tabsForRole("manager").includes("cyclecounts") && !tabsForRole("staff").includes("cyclecounts"), "cycle counts are for the owner and manager");
ok(resolveAutomations(undefined).alertCycleCounts === true && resolveAutomations({ alertCycleCounts: false }).alertCycleCounts === false, "the due-count reminder is on by default and can be switched off");
ok(read("app/agenda/page.tsx").includes("countsDue") && read("lib/agenda.ts").includes('"Cycle count"'), "high-value stock due a count reaches the Agenda");
ok(read("components/ops/useReviewSections.ts").includes("stockCountsDue") && read("lib/reviewPack.ts").includes('title: "Stock counts due"'), "overdue high-value stock is on the management review agenda");
ok(read("components/ops/useCycleCounts.ts").includes("ledgers.get(p.id)") && read("components/ops/useCycleCounts.ts").includes("stockAdjustments"), "the plan reads the stock ledger and the count corrections");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
