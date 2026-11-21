// Automatic operations measures (lib/opsMeasures.ts): each figure with worked numbers, a null where there is nothing to measure, and the KPI route
// that lets a measure follow the records. Run: npx tsx scripts/verify-ops-measures.ts
import fs from "node:fs";
import { computeOpsMeasures, OPS_MEASURES } from "../lib/opsMeasures";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";
const base = { webOrders: [], purchaseOrders: [], employees: [], obligations: [], improvements: [], candidates: [], todayIso: today };

const m = computeOpsMeasures({
  ...base,
  webOrders: [
    { customerName: "A", status: "confirmed", promisedDate: "2026-11-05", deliveredOn: "2026-11-04" }, // on time
    { customerName: "B", status: "confirmed", promisedDate: "2026-11-05", deliveredOn: "2026-11-07" }, // late
    { customerName: "C", status: "confirmed", promisedDate: "2026-11-20" },                             // not delivered yet: not judged
  ],
  purchaseOrders: [
    { status: "received", expectedDate: "2026-10-05", receivedDate: "2026-10-05" },
    { status: "received", expectedDate: "2026-10-05", receivedDate: "2026-10-09" },
    { status: "ordered", expectedDate: "2026-11-30" },
  ],
  employees: [
    { active: true }, { active: true }, { active: true },
    { active: false, endDate: "2026-06-01" },            // left within 12 months
    { active: false, endDate: "2024-01-01" },            // left long ago: not counted
  ],
  obligations: [{ id: "o", name: "VAT", dueDate: "2026-11-01", repeat: "quarterly" }],
  improvements: [{ id: "i", title: "Lid", source: "customer", owner: "R", dueDate: "2026-11-01", status: "open" }],
  candidates: [{ id: "c", name: "Amali", role: "Cashier", stage: "hired", stageDates: { applied: "2026-10-01", hired: "2026-10-15" } }],
});
ok(m.customer_on_time_pct === 50, "one of two judged deliveries on time is 50%; the one not yet due is not judged");
ok(m.supplier_on_time_pct === 50, "one of two receipts on its expected day is 50%; the order not yet received is not judged");
ok(m.staff_turnover_pct === 25, "one leaver in the last year out of four people employed in that year is 25%; the long-gone leaver is not counted");
ok(m.overdue_obligations === 1 && m.overdue_improvements === 1, "one overdue filing and one overdue change are counted");
ok(m.avg_time_to_hire_days === 14, "a hire made 14 days after applying gives an average of 14 days");

const empty = computeOpsMeasures(base);
ok(empty.customer_on_time_pct === null && empty.supplier_on_time_pct === null && empty.staff_turnover_pct === null && empty.avg_time_to_hire_days === null, "with nothing recorded, the percentage and average measures are empty, not zero");
ok(empty.overdue_obligations === 0 && empty.overdue_improvements === 0, "with nothing overdue, the counts are zero, which is the right reading");

ok(OPS_MEASURES.length === 6 && OPS_MEASURES.every((x) => x.label && x.blurb), "each measure has a name and a plain explanation");
const kpi = read("components/ops/RecordsPanels.tsx");
ok(kpi.includes("computeOpsMeasures(") && kpi.includes("OPS_MEASURES.map"), "the measures screen offers the operations measures, and works them out from the records");
ok(read("lib/salesMeasures.ts").includes("export function kpiWithLive") && read("lib/operations.ts").includes("source?:"), "a measure can be set to follow an automatic figure");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
