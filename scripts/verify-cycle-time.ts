// Cycle time and delivery promises (lib/cycleTime.ts): supplier order-to-receipt days and lateness, project duration, the promise buffer, and
// the tab and roles, checked with worked numbers. Run: npx tsx scripts/verify-cycle-time.ts
import { procurementCycle, projectCycle } from "../lib/cycleTime";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const pcs = procurementCycle([
  { supplier: "MillCo", status: "received", orderDate: "2026-10-01", expectedDate: "2026-10-05", receivedDate: "2026-10-05" }, // 4 days, on time
  { supplier: "MillCo", status: "received", orderDate: "2026-10-10", expectedDate: "2026-10-12", receivedDate: "2026-10-16" }, // 6 days, 4 late
  { supplier: "FarmA", status: "ordered", orderDate: "2026-10-01" },                                                          // not received: left out
  { supplier: "FarmA", status: "received", orderDate: "2026-10-20", receivedDate: "2026-10-22" },                             // 2 days, no promise
]);
const mill = pcs.find((x) => x.supplier === "MillCo")!;
ok(mill.receipts === 2 && mill.averageDaysOrderToReceipt === 5 && mill.averageDaysLate === 2 && mill.lateCount === 1, "MillCo: five days on average from order to receipt, two days late on average, one receipt late");
ok(pcs.find((x) => x.supplier === "FarmA")!.receipts === 1 && pcs.find((x) => x.supplier === "FarmA")!.averageDaysLate === 0, "a receipt with no promised date counts for the cycle but not for lateness");
ok(pcs[0].supplier === "MillCo", "the suppliers who are most often late come first");

const pj = projectCycle([
  { name: "Shop fit-out", status: "completed", startDate: "2026-09-01", targetEndDate: "2026-09-30", completedDate: "2026-09-26" }, // 25 days, 4 days early
  { name: "Website", status: "completed", startDate: "2026-08-01", targetEndDate: "2026-08-20", completedDate: "2026-08-25" },    // 24 days, 5 days late
  { name: "Still going", status: "active", startDate: "2026-10-01", targetEndDate: "2026-10-30" },                           // not complete: left out
  { name: "Dropped", status: "cancelled", startDate: "2026-07-01" },                                                            // cancelled: left out
]);
ok(pj.rows.length === 2 && pj.kept === 1 && pj.missed === 1, "only completed projects are judged: one kept its promise, one missed it");
ok(pj.rows.find((r) => r.name === "Shop fit-out")!.actualDays === 25 && pj.rows.find((r) => r.name === "Shop fit-out")!.bufferDays === 4, "a project's duration is start to completion, and its buffer is the days it finished before the promised end");
ok(pj.rows.find((r) => r.name === "Website")!.bufferDays === -5 && pj.rows.find((r) => r.name === "Website")!.keptPromise === false, "a project finished late has a negative buffer and is shown as a missed promise");
ok(pj.averageBufferDays === -0.5, "the average buffer across judged projects is (4 - 5) / 2 = -0.5 days");
ok(projectCycle([{ name: "Open", status: "completed", startDate: "2026-01-01" }]).rows.length === 0, "a completed project with no completion date is not judged");

ok(tabsForRole("owner").includes("cycletime") && tabsForRole("manager").includes("cycletime") && !tabsForRole("staff").includes("cycletime"), "cycle time is for the owner and manager");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
