// New-hire onboarding (lib/onboarding.ts): due days, duplicates, and the wiring on the Employees page. Hand-worked cases.
// Run: npx tsx scripts/verify-onboarding.ts
import fs from "node:fs";
import { NEW_HIRE_STEPS, missingOnboardingSteps, onboardingTasks } from "../lib/onboarding";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const list = onboardingTasks("  Nimal Perera ", "2026-10-30");
ok(list !== null && list.length === NEW_HIRE_STEPS.length, "one task is made for each step");
ok(list![0].assigneeName === "Nimal Perera", "the name is trimmed and used as the assignee");
ok(list!.every((t) => t.assigneeKind === "outside" && t.priority === "normal"), "the tasks are ordinary normal-priority tasks for someone without a login");
ok(list!.find((t) => t.title.includes("first week"))!.dueDate === "2026-11-06", "a step seven days in is due a week after the start day");
ok(list!.find((t) => t.title.includes("Confirm role"))!.dueDate === "2026-10-30", "a day-zero step is due on the start day");
ok(list!.every((t) => t.title.startsWith("Onboarding: ")), "each task is labelled as onboarding so it is easy to find");
ok(onboardingTasks("   ", "2026-10-30") === null, "a blank name makes no checklist");
ok(onboardingTasks("Nimal", "30/10/2026") === null, "a bad start date makes no checklist");

const existing = [{ title: list![0].title, assigneeName: "Nimal Perera" }, { title: list![1].title, assigneeName: "Someone else" }];
const todo = missingOnboardingSteps(list!, existing);
ok(todo.length === list!.length - 1 && !todo.some((t) => t.title === list![0].title), "a step already on the list is not added twice");
ok(missingOnboardingSteps(list!, list!.map((t) => ({ title: t.title, assigneeName: t.assigneeName }))).length === 0, "a second press adds nothing");

const page = fs.readFileSync("app/employees/page.tsx", "utf8");
ok(/startOnboarding\(e\.name\)/.test(page) && (page.match(/startOnboarding\(e\.name\)/g) ?? []).length === 2, "Start onboarding is on the phone card and the desktop row");
ok(/canTasks = can\(role, "manage:tasks"\)/.test(page) && /\{canTasks && \(/.test(page), "the button only shows to people who manage tasks");
ok(/addBusinessTask\(t\)/.test(page), "the checklist is saved as ordinary tasks");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
