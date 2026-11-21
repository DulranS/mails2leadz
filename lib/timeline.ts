// Timeline (Gantt-style): projects as spans from their start to their target end (or completion), and tasks as spans from the
// day they were handed over to their due date. Bars are clipped to the window on screen and placed as percentages of it.
//
// Read-only and pure. Cancelled projects and tasks with no due date are left off; nothing is changed.
import { addDays, daysBetween, isIsoDate, isoFromEpoch } from "./playbook";
import type { BusinessTask, Project } from "./types";

export interface TimelineBar {
  key: string;
  kind: "project" | "task";
  label: string;
  start: string; // ISO date
  end: string; // ISO date, never before start
  done: boolean;
  overdue: boolean; // not finished and its end date has passed
}

export interface TimelinePlacement {
  leftPct: number;
  widthPct: number;
  clippedStart: boolean; // the bar begins before the window
  clippedEnd: boolean; // the bar runs past the window
}

export const TIMELINE_WINDOWS = [14, 30, 60] as const;

// The day names along the top of the grid, one ISO date per day of the window.
export function timelineDays(from: string, days: number): string[] {
  return Array.from({ length: Math.max(1, days) }, (_, i) => addDays(from, i));
}

export function timelineBars(i: {
  projects: Project[];
  tasks: BusinessTask[];
  from: string;
  days: number;
  today: string;
  dateOfMs?: (ms: number) => string;
}): TimelineBar[] {
  const to = addDays(i.from, Math.max(1, i.days) - 1);
  const dateOf = i.dateOfMs ?? isoFromEpoch;
  const inWindow = (start: string, end: string) => end >= i.from && start <= to;
  const bars: TimelineBar[] = [];

  for (const p of i.projects) {
    if (p.status === "cancelled" || !isIsoDate(p.startDate)) continue;
    const start = p.startDate;
    let end = p.completedDate && isIsoDate(p.completedDate) ? p.completedDate : p.targetEndDate && isIsoDate(p.targetEndDate) ? p.targetEndDate : start;
    if (end < start) end = start;
    if (!inWindow(start, end)) continue;
    const done = p.status === "completed";
    bars.push({ key: `project:${p.id}`, kind: "project", label: p.name, start, end, done, overdue: !done && end < i.today });
  }

  for (const t of i.tasks) {
    if (!t.dueDate || !isIsoDate(t.dueDate)) continue;
    const end = t.dueDate;
    const handed = typeof t.createdAt === "number" && t.createdAt > 0 ? dateOf(t.createdAt) : end;
    const start = handed > end ? end : handed;
    if (!inWindow(start, end)) continue;
    const done = t.status === "done";
    bars.push({ key: `task:${t.id}`, kind: "task", label: t.title, start, end, done, overdue: !done && end < i.today });
  }

  return bars.sort((a, b) => (a.kind === b.kind ? a.start.localeCompare(b.start) || a.label.localeCompare(b.label) : a.kind === "project" ? -1 : 1));
}

// Where a bar sits in a window of `days` days starting at `from`. A bar is at least one day wide. Null when it is off the window.
export function placeBar(bar: Pick<TimelineBar, "start" | "end">, from: string, days: number): TimelinePlacement | null {
  const span = Math.max(1, days);
  const to = addDays(from, span - 1);
  if (bar.end < from || bar.start > to) return null;
  const s = Math.max(0, daysBetween(from, bar.start));
  const e = Math.min(span - 1, daysBetween(from, bar.end));
  return {
    leftPct: (s / span) * 100,
    widthPct: ((e - s + 1) / span) * 100,
    clippedStart: bar.start < from,
    clippedEnd: bar.end > to,
  };
}
