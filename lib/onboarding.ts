// New-hire onboarding: a short checklist for a new team member, made as ordinary delegated tasks (lib/tasks.ts) so it shows on the
// Tasks page, the Agenda and "who has what", with due days counted from their start day. Nothing is sent to them.
//
// Pure: no I/O. See scripts/verify-onboarding.ts.
import { addDays, isIsoDate } from "./playbook";
import type { TaskInput } from "./tasks";

export const NEW_HIRE_STEPS: { title: string; offsetDays: number; details: string }[] = [
  { title: "Confirm role, pay and contact details", offsetDays: 0, details: "Check the Employees page entry is right." },
  { title: "Set up their login and send the invite", offsetDays: 0, details: "Team page. Skip if they do not need to use the app." },
  { title: "Show them the Selling page and how to log a sale", offsetDays: 1, details: "Selling page, then the sale form." },
  { title: "Show them how to clock in and out", offsetDays: 1, details: "Time page." },
  { title: "Walk through the end-of-shift cash count", offsetDays: 2, details: "Cash count page." },
  { title: "Review their first week of sales with them", offsetDays: 7, details: "Selling page, filtered to their name." },
];

// The checklist for one person starting on `startIso`: one task per step, due on its day. Null when the name or date is unusable.
export function onboardingTasks(name: string, startIso: string): TaskInput[] | null {
  const who = name.trim();
  if (!who || !isIsoDate(startIso)) return null;
  return NEW_HIRE_STEPS.map((s) => ({
    title: `Onboarding: ${s.title}`,
    details: s.details,
    assigneeName: who,
    assigneeKind: "outside" as const,
    dueDate: addDays(startIso, s.offsetDays),
    priority: "normal" as const,
  }));
}

// Steps whose title is not already on this person's tasks, so pressing the button twice does not double the list.
export function missingOnboardingSteps(tasks: TaskInput[], existing: { title: string; assigneeName: string }[]): TaskInput[] {
  return tasks.filter((t) => !existing.some((e) => e.assigneeName === t.assigneeName && e.title === t.title));
}
