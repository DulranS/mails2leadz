// Delegation tracking (lib/tasks.ts, app/tasks/page.tsx, the tasks rules and data layer). Hand-worked against today = 2026-10-27
// (a Tuesday). Run: npx tsx scripts/verify-delegation.ts
import fs from "node:fs";
import {
  byAssignee, cleanTaskInput, isDueToday, isOverdue, sortTasks, statusPatch, summarizeTasks, validateTaskInput, type TaskInput,
} from "../lib/tasks";
import type { BusinessTask } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-10-27";

const base = { details: undefined, assigneeUid: undefined, createdAt: 0, updatedAt: 0, priority: "normal" as const };
const T = (p: Partial<BusinessTask> & Pick<BusinessTask, "id" | "title" | "assigneeName" | "assigneeKind" | "status">): BusinessTask =>
  ({ ...base, ...p } as BusinessTask);
const tasks: BusinessTask[] = [
  T({ id: "t1", title: "Chase supplier", assigneeName: "Ethan", assigneeKind: "member", assigneeUid: "u-ethan", status: "open", dueDate: "2026-10-20", priority: "urgent" }),
  T({ id: "t2", title: "Photograph the stock", assigneeName: "Nimal", assigneeKind: "outside", status: "open", dueDate: "2026-10-27" }),
  T({ id: "t3", title: "Write the newsletter", assigneeName: "Ethan", assigneeKind: "member", assigneeUid: "u-ethan", status: "open" }),
  T({ id: "t4", title: "Post the offer", assigneeName: "Aqeel", assigneeKind: "member", assigneeUid: "u-aqeel", status: "done", doneOn: "2026-10-25" }),
  T({ id: "t5", title: "Old cleanup", assigneeName: "Ethan", assigneeKind: "member", assigneeUid: "u-ethan", status: "done", doneOn: "2026-10-01" }),
  T({ id: "t6", title: "Quote the big job", assigneeName: "Ethan", assigneeKind: "member", assigneeUid: "u-ethan", status: "open", dueDate: "2026-10-30", priority: "urgent" }),
];

// ---- overdue and due today ------------------------------------------------------------------------------------------------
ok(isOverdue(tasks[0], TODAY), "an open task past its due date is overdue");
ok(!isOverdue(tasks[1], TODAY), "a task due today is not yet overdue");
ok(!isOverdue(tasks[3], TODAY), "a done task is never overdue, even with an old date");
ok(!isOverdue(tasks[2], TODAY), "an undated task is never overdue");
ok(isDueToday(tasks[1], TODAY) && !isDueToday(tasks[0], TODAY), "due today is only today's open tasks");

// ---- summary --------------------------------------------------------------------------------------------------------------
// open: t1, t2, t3, t6 = 4. overdue: t1 = 1. due today: t2 = 1. urgent open: t1, t6 = 2. done in the last 7 days: t4 (25th) = 1; t5 (1st) is not.
const s = summarizeTasks(tasks, TODAY);
ok(s.open === 4 && s.overdue === 1 && s.dueToday === 1 && s.urgentOpen === 2 && s.doneLast7 === 1, `summary counts: ${JSON.stringify(s)}`);

// ---- who has what ---------------------------------------------------------------------------------------------------------
// Ethan: 3 open (t1, t3, t6), 1 overdue, 1 done in 30 days (t5 on the 1st is within 30 days of the 27th). Nimal: 1 open (outside).
// Aqeel: 0 open, 1 done in 30 days. Sorted by overdue, then open: Ethan, Nimal, Aqeel.
const people = byAssignee(tasks, TODAY);
ok(people.map((p) => p.name).join(",") === "Ethan,Nimal,Aqeel", `who has what order: ${people.map((p) => p.name).join(",")}`);
const ethan = people[0];
ok(ethan.open === 3 && ethan.overdue === 1 && ethan.doneLast30 === 1, "Ethan's counts: 3 open, 1 overdue, 1 done in 30 days");
ok(people[1].kind === "outside" && people[1].open === 1, "an outside person is listed as outside, with their own count");
ok(byAssignee([T({ id: "x", title: "a", assigneeName: "Sam", assigneeKind: "member", status: "open" }), T({ id: "y", title: "b", assigneeName: "Sam", assigneeKind: "outside", status: "open" })], TODAY).length === 2, "a team member and an outside person with the same name stay apart");

// ---- ordering -------------------------------------------------------------------------------------------------------------
// Overdue first (t1), then open urgent (t6), then open by due date (t2 on the 27th, then undated t3), then done newest first (t4, t5).
const order = sortTasks(tasks, TODAY).map((t) => t.id).join(",");
ok(order === "t1,t6,t2,t3,t4,t5", `ordering: ${order}`);

// Window edges: done on the 21st is the 7th day back (counts); done on the 20th is not. Done on 28 Sept is the 30th day back (counts).
const edge = [
  T({ id: "e1", title: "x", assigneeName: "Z", assigneeKind: "member", status: "done", doneOn: "2026-10-21" }),
  T({ id: "e2", title: "y", assigneeName: "Z", assigneeKind: "member", status: "done", doneOn: "2026-10-20" }),
  T({ id: "e3", title: "w", assigneeName: "Z", assigneeKind: "member", status: "done", doneOn: "2026-09-28" }),
  T({ id: "e4", title: "v", assigneeName: "Z", assigneeKind: "member", status: "done", doneOn: "2026-09-27" }),
];
ok(summarizeTasks(edge, TODAY).doneLast7 === 1, "a task done 6 days back counts in the last 7 days, 7 days back does not");
ok(byAssignee(edge, TODAY)[0].doneLast30 === 3, "a task done 29 days back counts in the last 30 days, 30 days back does not");

// Overdue beats urgent-but-not-yet-due; open tasks are ordered by due date before title.
const ord = sortTasks([
  T({ id: "u", title: "Urgent later", assigneeName: "Z", assigneeKind: "member", status: "open", dueDate: "2026-10-30", priority: "urgent" }),
  T({ id: "o", title: "Late normal", assigneeName: "Z", assigneeKind: "member", status: "open", dueDate: "2026-10-22" }),
  T({ id: "n1", title: "A", assigneeName: "Z", assigneeKind: "member", status: "open", dueDate: "2026-11-05" }),
  T({ id: "n2", title: "Z", assigneeName: "Z", assigneeKind: "member", status: "open", dueDate: "2026-11-02" }),
], TODAY).map((t) => t.id).join(",");
ok(ord === "o,u,n2,n1", `ordering: overdue first, then urgent, then by due date (got ${ord})`);

// ---- ticking off ----------------------------------------------------------------------------------------------------------
ok(JSON.stringify(statusPatch({ status: "open" }, TODAY)) === JSON.stringify({ status: "done", doneOn: TODAY }), "ticking off a task records today");
ok(JSON.stringify(statusPatch({ status: "done" }, TODAY)) === JSON.stringify({ status: "open", doneOn: null }), "reopening clears the done date");

// ---- validation -----------------------------------------------------------------------------------------------------------
const good: TaskInput = { title: "Call the landlord", assigneeName: "Aqeel", assigneeKind: "member", assigneeUid: "u-aqeel", priority: "normal" };
ok(validateTaskInput(good) === null, "a complete member task is accepted");
ok(validateTaskInput({ ...good, title: "   " }) !== null, "a blank title is refused");
ok(validateTaskInput({ ...good, title: "x".repeat(151) }) !== null, "a title over 150 characters is refused");
ok(validateTaskInput({ ...good, assigneeName: "" }) !== null, "a task with nobody to do it is refused");
ok(validateTaskInput({ ...good, assigneeUid: undefined }) !== null, "a member task needs the member picked");
ok(validateTaskInput({ ...good, assigneeKind: "outside", assigneeUid: undefined }) === null, "an outside person needs no login");
ok(validateTaskInput({ ...good, dueDate: "27/10/2026" }) !== null, "a due date that is not a date is refused");
ok(validateTaskInput({ ...good, priority: "high" as any }) !== null, "an unknown priority is refused");
ok(validateTaskInput({ ...good, details: "x".repeat(1001) }) !== null, "details over 1000 characters are refused");

const cleaned = cleanTaskInput({ ...good, title: "  Call the landlord  ", details: "   ", dueDate: "2026-11-02", assigneeKind: "outside", assigneeUid: "u-aqeel" });
ok(cleaned.title === "Call the landlord", "the title is trimmed");
ok(!("details" in cleaned), "blank details are not saved");
ok(cleaned.dueDate === "2026-11-02", "a valid due date is kept");
ok(!("assigneeUid" in cleaned), "an outside person never carries a login id, even if one was passed");
ok(!("dueDate" in cleanTaskInput({ ...good, dueDate: "nope" })), "an invalid due date is dropped");

// ---- wiring ---------------------------------------------------------------------------------------------------------------
const rules = read("firestore.rules");
ok(/match \/tasks\/\{docId\} \{\s*allow read: if canReadBooks\(businessId\);\s*allow create, update: if isOwnerOrManager\(businessId\);\s*allow delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\);/.test(rules), "tasks rules: accountant and owner/manager read, owner/manager write, only the owner deletes, never in the demo");
const dc = read("contexts/DataContext.tsx");
ok(/(?:onSnapshot|trackedSnapshot)\(query\(collection\(db, "users", businessId, "tasks"\), orderBy\("createdAt", "desc"\)\)/.test(dc), "tasks listener is ordered by createdAt (a due-date sort would drop undated tasks)");
{
  // Tasks are for owner, manager and accountant only: their listener must sit inside the owner/manager block, not for staff.
  const at = dc.indexOf('collection(db, "users", businessId, "tasks")');
  const block = dc.indexOf("if (isOwnerOrManager) {");
  const staffBlock = dc.indexOf('if (role === "staff") {');
  ok(at > block && at < staffBlock, "the tasks listener sits in the owner/manager/accountant block, not for staff");
}
ok(/bump\("tasks"\)/.test(dc) && /"tasks", "bookings",/.test(dc), "tasks load for owner, manager and accountant, and a listener bumps the ready counter");
ok(/requirePermission\("manage:tasks"\)/.test(dc) && /requirePermission\("delete:records"\)/.test(dc), "task writes are gated by permission");
ok(/setBusinessTaskDone: async/.test(dc) && /updateDoc\(ref, \{ status: done \? "done" : "open", doneOn: done \? today : null/.test(dc), "ticking off changes only the status and done date");
const pg = read("app/tasks/page.tsx");
ok(/useRequireRole\(\["owner", "manager", "accountant"\]\)/.test(pg), "the delegation page is for owner, manager and accountant only");
ok(/canWrite = can\(role, "manage:tasks"\)/.test(pg), "the page hides writes unless the role may manage tasks");
ok(!/updateSettings|addSale|addPurchase|addTimeEntry/.test(pg), "the delegation page changes no books");
// Stat takes a string value (components/ui.tsx). A bare number would fail the production type check, so every value is converted.
ok(!/<Stat[^>]*value=\{(?!String\(|formatMoney\(|`|summary\.noShowRate|[^}]*\?)[^}]*\}/.test(pg), "every Stat value on the delegation page is a string");
ok(/[Nn]othing is sent to the assignee/.test(read("lib/tasks.ts")), "the logic says nothing is sent to the assignee");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
