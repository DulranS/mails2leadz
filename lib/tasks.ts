// Delegation tracking: work handed to someone (a team member, or a freelancer or contractor with no login), with an optional due
// date, a priority, and whether it is done. The owner and managers see who has what, what is overdue, and who is carrying the most.
//
// Records and reads only. A task changes no sale, purchase, payment, stock or profit figure, and nothing is sent to the assignee:
// the person who set it tells them. Owner and managers write; the accountant can read.
import { addDays, isIsoDate } from "./playbook";
import type { BusinessSubtask, BusinessTask, TaskPriority } from "./types";

export const MAX_TASK_TITLE = 150;
export const MAX_TASK_DETAIL = 1000;
export const MAX_ASSIGNEE_NAME = 100;
export const MAX_SUBTASKS = 30;
export const MAX_SUBTASK_TITLE = 150;

export interface TaskInput {
  title: string;
  details?: string;
  assigneeName: string;
  assigneeKind: "member" | "outside";
  assigneeUid?: string;
  dueDate?: string;
  priority: TaskPriority;
  subtasks?: BusinessSubtask[];
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export function validateTaskInput(i: TaskInput): string | null {
  if (!clean(i.title, MAX_TASK_TITLE)) return "Say what needs doing.";
  if (typeof i.title === "string" && i.title.trim().length > MAX_TASK_TITLE) return `Keep the task to ${MAX_TASK_TITLE} characters.`;
  if (!clean(i.assigneeName, MAX_ASSIGNEE_NAME)) return "Who is it for?";
  if (i.assigneeKind !== "member" && i.assigneeKind !== "outside") return "Is it for a team member or an outside person?";
  if (i.assigneeKind === "member" && !i.assigneeUid) return "Pick the team member it is for.";
  if (i.dueDate && !isIsoDate(i.dueDate)) return "The due date isn't a valid date.";
  if (i.priority !== "normal" && i.priority !== "urgent") return "Choose normal or urgent.";
  if (typeof i.details === "string" && i.details.length > MAX_TASK_DETAIL) return `Keep the details to ${MAX_TASK_DETAIL} characters.`;
  if ((i.subtasks ?? []).length > MAX_SUBTASKS) return `Keep the checklist to ${MAX_SUBTASKS} steps.`;
  return null;
}

const defaultSubtaskId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Checklist steps as saved: blank titles are dropped, titles are capped, each step keeps its id (a new one is made when it has none).
export function cleanSubtasks(raw: unknown, newId: () => string = defaultSubtaskId): BusinessSubtask[] {
  if (!Array.isArray(raw)) return [];
  const out: BusinessSubtask[] = [];
  for (const s of raw.slice(0, MAX_SUBTASKS)) {
    if (!s || typeof s !== "object") continue;
    const title = clean((s as { title?: unknown }).title, MAX_SUBTASK_TITLE);
    if (!title) continue;
    const id = typeof (s as { id?: unknown }).id === "string" && (s as { id: string }).id ? (s as { id: string }).id : newId();
    out.push({ id, title, done: (s as { done?: unknown }).done === true });
  }
  return out;
}

// Steps ticked off out of all of them. A task with no checklist has none.
export function subtaskProgress(t: Pick<BusinessTask, "subtasks">): { done: number; total: number } {
  const list = t.subtasks ?? [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

// The same checklist with one step ticked or unticked. Unknown ids leave it as it is.
export function toggleSubtask(list: BusinessSubtask[], id: string): BusinessSubtask[] {
  return list.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
}

// Trims, caps lengths, and drops empty optional fields so nothing blank is saved.
export function cleanTaskInput(i: TaskInput): TaskInput {
  const out: TaskInput = {
    title: clean(i.title, MAX_TASK_TITLE),
    assigneeName: clean(i.assigneeName, MAX_ASSIGNEE_NAME),
    assigneeKind: i.assigneeKind,
    priority: i.priority,
  };
  const details = clean(i.details, MAX_TASK_DETAIL);
  if (details) out.details = details;
  if (i.assigneeKind === "member" && i.assigneeUid) out.assigneeUid = i.assigneeUid;
  if (i.dueDate && isIsoDate(i.dueDate)) out.dueDate = i.dueDate;
  if (i.subtasks) {
    const steps = cleanSubtasks(i.subtasks);
    if (steps.length > 0) out.subtasks = steps;
  }
  return out;
}

export const isOverdue = (t: Pick<BusinessTask, "status" | "dueDate">, today: string) =>
  t.status === "open" && isIsoDate(t.dueDate) && (t.dueDate as string) < today;

export const isDueToday = (t: Pick<BusinessTask, "status" | "dueDate">, today: string) =>
  t.status === "open" && t.dueDate === today;

// The fields that change when a task is ticked off or reopened.
export function statusPatch(t: Pick<BusinessTask, "status">, today: string): { status: "open" | "done"; doneOn: string | null } {
  return t.status === "done" ? { status: "open", doneOn: null } : { status: "done", doneOn: today };
}

// Overdue first (oldest due date first), then open urgent, then open by due date (undated last), then done (latest first).
export function sortTasks(tasks: BusinessTask[], today: string): BusinessTask[] {
  const rank = (t: BusinessTask) => (t.status === "done" ? 3 : isOverdue(t, today) ? 0 : t.priority === "urgent" ? 1 : 2);
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 3) return (b.doneOn ?? "").localeCompare(a.doneOn ?? "") || a.title.localeCompare(b.title);
    const da = a.dueDate ?? "9999-12-31";
    const db = b.dueDate ?? "9999-12-31";
    return da.localeCompare(db) || a.title.localeCompare(b.title);
  });
}

export interface TasksSummary {
  open: number;
  overdue: number;
  dueToday: number;
  urgentOpen: number;
  doneLast7: number;
}

export function summarizeTasks(tasks: BusinessTask[], today: string): TasksSummary {
  const from = addDays(today, -6);
  let open = 0, overdue = 0, dueToday = 0, urgentOpen = 0, doneLast7 = 0;
  for (const t of tasks) {
    if (t.status === "open") {
      open++;
      if (isOverdue(t, today)) overdue++;
      if (isDueToday(t, today)) dueToday++;
      if (t.priority === "urgent") urgentOpen++;
    } else if (t.doneOn && t.doneOn >= from && t.doneOn <= today) {
      doneLast7++;
    }
  }
  return { open, overdue, dueToday, urgentOpen, doneLast7 };
}

export interface AssigneeRow {
  key: string;
  name: string;
  kind: "member" | "outside";
  open: number;
  overdue: number;
  doneLast30: number;
}

// Who is carrying what. Keyed by kind + name (so a freelancer and a team member with the same name stay apart).
export function byAssignee(tasks: BusinessTask[], today: string): AssigneeRow[] {
  const from = addDays(today, -29);
  const rows = new Map<string, AssigneeRow>();
  for (const t of tasks) {
    const key = `${t.assigneeKind}:${t.assigneeName.trim().toLowerCase()}`;
    let r = rows.get(key);
    if (!r) {
      r = { key, name: t.assigneeName, kind: t.assigneeKind, open: 0, overdue: 0, doneLast30: 0 };
      rows.set(key, r);
    }
    if (t.status === "open") {
      r.open++;
      if (isOverdue(t, today)) r.overdue++;
    } else if (t.doneOn && t.doneOn >= from && t.doneOn <= today) {
      r.doneLast30++;
    }
  }
  return [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
}
