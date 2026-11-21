// Standard sales measures (lib/salesMeasures.ts): average order value, repeat customers, lead conversion, and a KPI that follows one live.
// Run: npx tsx scripts/verify-sales-measures.ts
import fs from "node:fs";
import { computeSalesMeasures, kpiWithLive, SALES_MEASURES } from "../lib/salesMeasures";
import { kpiRag } from "../lib/kpiRag";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse(`${TODAY}T12:00:00Z`);
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const sales = [
  { id: "s1", date: day(0), qty: 2, unitPrice: 100, invoiceId: "inv1", customer: "Amal" },
  { id: "s2", date: day(1), qty: 1, unitPrice: 300, customer: "Amal" },
  { id: "s3", date: day(10), qty: 1, unitPrice: 200, customer: "Kamal" },
  { id: "s4", date: day(40), qty: 1, unitPrice: 9999, customer: "Old" }, // outside the 30-day window
  { id: "s5", date: day(0), qty: 0, unitPrice: 500, customer: "Ghost" }, // zero quantity, ignored
  { id: "s6", date: day(80), qty: 1, unitPrice: 100, customer: "Nimal" }, // inside 90 days, one order
  { id: "s7", date: day(85), qty: 1, unitPrice: 100, customer: "Nimal" }, // second order for Nimal in 90 days
];
const leads = [
  { createdAt: NOW - 5 * 86_400_000, stage: "won" },
  { createdAt: NOW - 6 * 86_400_000, stage: "lost" },
  { createdAt: NOW - 7 * 86_400_000, stage: "new" },
  { createdAt: NOW - 60 * 86_400_000, stage: "won" }, // too old for the 30-day cohort
];
const m = computeSalesMeasures(sales, leads, TODAY, NOW);

// Orders in 30 days: inv1 (2 x 100 = 200) and s2 (300) and s3 is 10 days ago (200). Revenue 700 over 3 orders = 233.33.
ok(m.avg_order_value === 233.33, "average order value is the last 30 days' revenue over the number of orders");
// Customers in 90 days: Amal (inv1 + s2 = 2 orders), Kamal (1), Old (1, 40 days ago), Nimal (2). Repeat: Amal and Nimal = 2 of 4 = 50%.
ok(m.repeat_rate === 50, "repeat customers are those with two or more orders in 90 days, as a share of everyone who ordered");
// Leads in 30 days: 3, of which 1 won = 33.3%. The old won lead is outside the cohort.
ok(m.lead_conversion === 33.3, "lead conversion counts only leads that came in over the last 30 days");
ok(computeSalesMeasures([], [], TODAY, NOW).avg_order_value === null && computeSalesMeasures([], [], TODAY, NOW).repeat_rate === null && computeSalesMeasures([], [], TODAY, NOW).lead_conversion === null, "with no sales or leads each measure is empty, not zero");

const kpi = { target: 200, direction: "higher" as const, source: "avg_order_value" as const, readings: [] as { id: string; period: string; value: number }[], amberPct: undefined };
const live = kpiWithLive(kpi, m, TODAY);
ok(live.readings.length === 1 && live.readings[0].value === 233.33, "a KPI that follows a measure takes its figure from the live measure, not a typed reading");
ok(kpiRag(live).rag === "green", "and its colour is judged from that figure");
const manual = { target: 200, direction: "higher" as const, readings: [{ id: "r", period: "2026-10-27", value: 150 }] };
ok(kpiWithLive(manual, m, TODAY) === manual, "a KPI typed in by hand is left alone");
const noData = kpiWithLive({ ...kpi, readings: [] }, computeSalesMeasures([], [], TODAY, NOW), TODAY);
ok(noData.readings.length === 0 && kpiRag(noData).rag === "none", "a measure with no data gives no colour, not a red one");

ok(SALES_MEASURES.length === 3 && SALES_MEASURES.every((x) => x.blurb.length > 10), "the three standard measures each say what they measure");
ok(read("lib/operations.ts").includes('source?: "avg_order_value"') || read("lib/operations.ts").includes("source?:"), "the KPI input can name a standard measure");
ok(read("components/ops/RecordsPanels.tsx").includes("kpiWithLive(k, live, today)") && read("components/ops/RecordsPanels.tsx").includes("Track it"), "the KPI list uses the live figure and offers to track a standard measure");
ok(read("components/ops/useReviewSections.ts").includes("kpiWithLive(k, live, today)"), "the review uses the same live figures, computed once");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
