// Capacity (lib/capacity.ts): rostered hours less leave against booked hours, the day flags, and the wiring to the Capacity tab and the
// Agenda. Run: npx tsx scripts/verify-capacity.ts
import fs from "node:fs";
import { capacityFor, flagFor, nextDays } from "../lib/capacity";
import { OPERATIONS_TABS, tabsForRole } from "../lib/operations";
import { resolveAutomations } from "../lib/leadIntake";
import type { Booking, LeaveRecord, ShiftEntry } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const D = "2026-11-03";

const shifts = [
  { id: "s1", employeeId: "e1", employeeName: "Nimal", date: D, start: "09:00", end: "17:00" },
  { id: "s2", employeeId: "e2", employeeName: "Ruwan", date: D, start: "10:00", end: "14:00" },
] as ShiftEntry[];
const leaves = [{ id: "l1", employeeId: "e2", employeeName: "Ruwan", type: "annual", from: D, to: D, days: 1, createdAt: 0 }] as unknown as LeaveRecord[];
const bookings = [
  { id: "b1", date: D, startTime: "09:00", durationMin: 240, status: "booked" },
  { id: "b2", date: D, startTime: "13:00", durationMin: 60, status: "cancelled" },
  { id: "b3", date: D, startTime: "15:00", durationMin: 120, status: "done" },
] as unknown as Booking[];

const [day] = capacityFor([D], shifts, leaves, bookings);
ok(day.staffedHours === 8 && day.bookedHours === 6, "rostered hours are the shifts, and a cancelled booking is not demand (4 + 2 = 6 booked, 8 rostered)");
ok(capacityFor([D], shifts, [], bookings)[0].staffedHours === 12, "without leave, the second person's four hours count");
ok(day.utilizationPct === 75 && day.flag === "ok", "six booked over eight rostered is 75%, which is balanced");
ok(flagFor(8, 9) === "over", "more booked than rostered is over");
ok(flagFor(0, 3) === "unstaffed", "booked with nobody rostered is unstaffed, whatever else is true");
ok(flagFor(10, 9) === "tight" && flagFor(10, 4) === "spare" && flagFor(0, 0) === "none", "85% or more is tight, 40% or less is spare, and nothing booked with nobody rostered is none");
ok(capacityFor([D], [], [], [])[0].utilizationPct === null, "with nobody rostered there is no percentage to show");
ok(nextDays(D, 3).join() === "2026-11-03,2026-11-04,2026-11-05", "the days are the next n days from today");
ok(OPERATIONS_TABS.some((t) => t.key === "capacity") && tabsForRole("owner").includes("capacity") && tabsForRole("manager").includes("capacity") && !tabsForRole("staff").includes("capacity"), "capacity is for the owner and manager");
ok(resolveAutomations(undefined).alertCapacity === true && resolveAutomations({ alertCapacity: false }).alertCapacity === false, "the capacity alert is on by default and can be switched off");
ok(read("components/ops/useCapacity.ts").includes("leaveRecords") && read("components/ops/CapacityPanel.tsx").includes("useCapacity(14)"), "the Capacity tab and the Agenda read the same calculation");
ok(read("app/agenda/page.tsx").includes("capacityDue") && read("app/agenda/page.tsx").includes('authRole !== "owner"'), "the Agenda shows capacity problems to owners and managers only");
ok(read("lib/agenda.ts").includes("i.capacityDue"), "capacity problems reach the Agenda list");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
