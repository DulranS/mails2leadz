// Task checklists (lib/tasks.ts): cleaning steps, progress, ticking one off, the length limit, and the wiring on the Delegation page.
// Run: npx tsx scripts/verify-task-subtasks.ts
import fs from "node:fs";
import { MAX_SUBTASKS, cleanSubtasks, cleanTaskInput, subtaskProgress, toggleSubtask, validateTaskInput, type TaskInput } from "../lib/tasks";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const seq = (() => {
  let n = 0;
  return () => `n${++n}`;
})();

const steps = cleanSubtasks(
  [{ id: "a", title: "  Buy flour ", done: true }, { title: "   " }, { title: "Bake", done: "yes" }, null, "text"],
  seq
);
ok(steps.length === 2, "blank titles and non-object entries are dropped");
ok(steps[0].id === "a" && steps[0].title === "Buy flour" && steps[0].done === true, "a kept step keeps its id, trims its title and its done flag");
ok(steps[1].id === "n1" && steps[1].done === false, "a step with no id gets one, and a non-true done flag counts as not done");
ok(cleanSubtasks("nope" as unknown).length === 0, "a non-list checklist is treated as empty");
ok(cleanSubtasks([{ title: "x".repeat(300) }], seq)[0].title.length === 150, "a step title is capped at 150 characters");
ok(cleanSubtasks(Array.from({ length: 40 }, (_, i) => ({ title: `s${i}` })), seq).length === MAX_SUBTASKS, "at most 30 steps are kept");

ok(JSON.stringify(subtaskProgress({ subtasks: steps })) === JSON.stringify({ done: 1, total: 2 }), "progress counts done steps out of all of them");
ok(JSON.stringify(subtaskProgress({})) === JSON.stringify({ done: 0, total: 0 }), "a task with no checklist has no progress");

const flipped = toggleSubtask(steps, "n1");
ok(flipped[1].done === true && flipped[0].done === true, "ticking one step changes only that step");
ok(toggleSubtask(flipped, "a")[0].done === false, "ticking a done step unticks it");
ok(toggleSubtask(steps, "missing").every((s, i) => s.done === steps[i].done), "an unknown step id leaves the checklist as it was");
ok(steps[1].done === false, "toggling does not change the list it was given");

const base: TaskInput = { title: "Stock the bar", assigneeName: "Ann", assigneeKind: "outside", priority: "normal" };
ok(validateTaskInput({ ...base, subtasks: steps }) === null, "a short checklist validates");
ok(validateTaskInput({ ...base, subtasks: Array.from({ length: 31 }, (_, i) => ({ id: `i${i}`, title: "x", done: false })) }) !== null, "more than 30 steps is refused");
const cleaned = cleanTaskInput({ ...base, subtasks: [{ id: "q", title: "  Count ", done: false }, { id: "r", title: " ", done: false }] });
ok(cleaned.subtasks?.length === 1 && cleaned.subtasks[0].title === "Count", "saving drops blank steps and keeps the rest");
ok(cleanTaskInput({ ...base, subtasks: [] }).subtasks === undefined, "an empty checklist is not saved");
ok(cleanTaskInput(base).subtasks === undefined, "a task without a checklist is saved as before");

const page = fs.readFileSync("app/tasks/page.tsx", "utf8");
ok(/subtasks: t\.subtasks/.test(page), "editing a task carries its checklist");
ok(/toggleSubtask\(t\.subtasks/.test(page) && /tickStep\(/.test(page), "the team can tick steps off on the task list");
ok(/subtasks: steps/.test(page), "the task form saves its checklist");
ok(/steps done/.test(page) && /subtaskProgress\(t\)/.test(page), "the task list shows how many steps are done");
ok(/disabled=\{!canWrite\}/.test(page), "people without task rights see the checklist but cannot tick it");

const types = fs.readFileSync("lib/types.ts", "utf8");
ok(/export interface BusinessSubtask/.test(types) && /subtasks\?: BusinessSubtask\[\]/.test(types), "the task type carries the checklist");

console.log(`verify-task-subtasks: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
