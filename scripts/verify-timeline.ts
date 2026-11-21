// Timeline (lib/timeline.ts): which projects and tasks get a bar, where bars sit in the window, clipping, done and overdue
// flags, the ordering, and the wiring on the Agenda page. Hand-worked dates, window starts 2026-10-30.
// Run: npx tsx scripts/verify-timeline.ts
import fs from "node:fs";
import { placeBar, timelineBars, timelineDays } from "../lib/timeline";
import type { BusinessTask, Project } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const FROM = "2026-10-30";
const TODAY = "2026-10-31";
const proj = (over: Partial<Project>): Project =>
  ({ id: "p", name: "Fit-out", status: "active", startDate: "2026-10-25", targetEndDate: "2026-11-10", quotedPrice: 0, createdAt: 0, ...over } as Project);
const task = (over: Partial<BusinessTask>): BusinessTask =>
  ({ id: "t", title: "Order tiles", assigneeName: "Ann", assigneeKind: "member", priority: "normal", status: "open", dueDate: "2026-11-02", createdAt: 0, updatedAt: 0, ...over } as BusinessTask);
// Handed over on 28 Oct, local calendar day, so the day it was handed over is passed in directly.
const dateOf = (ms: number) => (ms === 1 ? "2026-10-28" : ms === 3 ? "2026-11-20" : "2026-10-20");
const build = (projects: Project[], tasks: BusinessTask[], from = FROM, days = 14) =>
  timelineBars({ projects, tasks, from, days, today: TODAY, dateOfMs: dateOf });

ok(JSON.stringify(timelineDays(FROM, 3)) === JSON.stringify(["2026-10-30", "2026-10-31", "2026-11-01"]), "the window lists one date per day");

const basic = build([proj({})], [task({ createdAt: 1 })]);
ok(basic.length === 2, "a project and a task with a due date each get a bar");
ok(basic[0].kind === "project" && basic[1].kind === "task", "projects are listed before tasks");
ok(basic[0].start === "2026-10-25" && basic[0].end === "2026-11-10", "a project runs from its start date to its target end");
ok(basic[1].start === "2026-10-28" && basic[1].end === "2026-11-02", "a task runs from the day it was handed over to its due date");

ok(build([proj({ status: "cancelled" })], []).length === 0, "a cancelled project gets no bar");
ok(build([], [task({ dueDate: undefined })]).length === 0, "a task with no due date gets no bar");
ok(build([proj({ startDate: "2026-11-03", targetEndDate: undefined })], []).length === 1 && build([proj({ startDate: "2026-11-03", targetEndDate: undefined })], [])[0].end === "2026-11-03", "a project with no end date is a one-day bar on its start");
ok(build([proj({ startDate: "2026-11-03", targetEndDate: "2026-11-01" })], [])[0].end === "2026-11-03", "an end date before the start is ignored");
ok(build([proj({ status: "completed", startDate: "2026-11-03", completedDate: "2026-11-05" })], [])[0].end === "2026-11-05", "a completed project ends on its completion date");

ok(build([], [task({ dueDate: "2026-12-01", createdAt: 3 })]).length === 0, "a bar wholly after the window is left off");
ok(build([], [task({ dueDate: "2026-11-20", createdAt: 1 })]).length === 1, "a bar running into the window is shown, clipped at its end");
ok(build([], [task({ dueDate: "2026-10-29", createdAt: 1 })]).length === 0, "a bar wholly before the window is left off");
ok(build([], [task({ dueDate: "2026-10-30", createdAt: 1 })]).length === 1, "a bar ending on the first day shows");

const dueToday = timelineBars({ projects: [], tasks: [task({ dueDate: "2026-10-30", createdAt: 1 })], from: "2026-10-30", days: 14, today: "2026-10-30", dateOfMs: dateOf })[0];
ok(dueToday.overdue === false, "a task due today is not overdue");
const late = build([], [task({ dueDate: "2026-10-30", createdAt: 1 })], "2026-10-31", 3)[0];
ok(late === undefined, "the window starts after the due date, so nothing shows");
const passed = timelineBars({ projects: [], tasks: [task({ dueDate: "2026-10-30", createdAt: 1 })], from: "2026-10-30", days: 14, today: "2026-11-05", dateOfMs: dateOf })[0];
ok(passed.overdue === true, "an open task past its due date is overdue");
const doneTask = timelineBars({ projects: [], tasks: [task({ dueDate: "2026-10-30", createdAt: 1, status: "done" })], from: "2026-10-30", days: 14, today: "2026-11-05", dateOfMs: dateOf })[0];
ok(doneTask.done === true && doneTask.overdue === false, "a finished task is done, not overdue");

const overdueProject = timelineBars({ projects: [proj({ targetEndDate: "2026-11-01" })], tasks: [], from: "2026-10-30", days: 14, today: "2026-11-05", dateOfMs: dateOf })[0];
ok(overdueProject.overdue === true, "a project past its target end and not completed is overdue");

const spanning = build([proj({ startDate: "2026-10-01", targetEndDate: "2026-12-31" })], [])[0];
ok(placeBar(spanning, FROM, 14)!.leftPct === 0 && placeBar(spanning, FROM, 14)!.widthPct === 100, "a bar covering the whole window fills it");
ok(placeBar(spanning, FROM, 14)!.clippedStart === true && placeBar(spanning, FROM, 14)!.clippedEnd === true, "a bar running past both edges is marked clipped on both");

const place = placeBar({ start: "2026-10-25", end: "2026-11-10" }, FROM, 14)!;
ok(place.leftPct === 0 && Math.abs(place.widthPct - (12 / 14) * 100) < 1e-9, "11 days into a 14-day window: 12 of 14 days from the left edge");
const mid = placeBar({ start: "2026-11-02", end: "2026-11-04" }, FROM, 14)!;
ok(Math.abs(mid.leftPct - (3 / 14) * 100) < 1e-9 && Math.abs(mid.widthPct - (3 / 14) * 100) < 1e-9, "a bar starting on day four lies from there and is three days wide");
ok(placeBar({ start: "2026-10-30", end: "2026-10-30" }, FROM, 14)!.widthPct > 0, "a one-day bar is still visible");
ok(placeBar({ start: "2026-12-01", end: "2026-12-02" }, FROM, 14) === null, "a bar off the window has no place");

const page = fs.readFileSync("app/agenda/page.tsx", "utf8");
ok(/import \{ TIMELINE_WINDOWS, placeBar, timelineBars, timelineDays \} from "@\/lib\/timeline"/.test(page), "the Agenda page uses the timeline module");
ok(/<TimelineCard projects=\{projects\} tasks=\{tasks\} today=\{today\} \/>/.test(page), "the Timeline is shown on the Agenda page");

console.log(`verify-timeline: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
