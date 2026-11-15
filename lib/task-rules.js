// lib/task-rules.js - the owner's team tasks: what to do, the day it is due, and who it is for (spec 3.3). Pure.
// Days are calendar days (YYYY-MM-DD) read in the owner's timezone, given as an offset in minutes from UTC.
export const TASK_TITLE_MAX = 160;
export const TASK_LIST_MAX = 200;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** A new task from a form. `owners` is the team's list of { key } the task may be given to. */
export function sanitizeTask(input = {}, owners = []) {
  const title = clip(input.title, TASK_TITLE_MAX);
  if (title.length < 2) return { ok: false, error: 'Write what the task is.' };
  const dueDate = clip(input.dueDate, 10);
  // A real calendar day only: 31 February must fail, not roll over into March.
  if (dueDate && (!DAY_RE.test(dueDate) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate)) {
    return { ok: false, error: 'Pick a valid due date.' };
  }
  const assignedTo = clip(input.assignedTo, 128);
  if (assignedTo && !(owners || []).some((o) => o && o.key === assignedTo)) {
    return { ok: false, error: 'That person is not on your team.' };
  }
  return { ok: true, task: { title, dueDate, assignedTo, done: false } };
}

/** The calendar day (YYYY-MM-DD) of a moment, in the given offset from UTC. */
export function dayKey(ms, offsetMin = 0) {
  return new Date(ms + offsetMin * 60000).toISOString().slice(0, 10);
}

/** done | overdue | due_today | open | no_date */
export function taskState(task, now = Date.now(), offsetMin = 0) {
  if (task.done === true) return 'done';
  if (!task.dueDate) return 'no_date';
  const today = dayKey(now, offsetMin);
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'due_today';
  return 'open';
}

/** Counts for Today: what is overdue or due today needs attention now. */
export function tasksSummary(tasks = [], now = Date.now(), offsetMin = 0) {
  let overdue = 0; let dueToday = 0; let open = 0;
  for (const t of tasks) {
    const s = taskState(t || {}, now, offsetMin);
    if (s === 'overdue') overdue += 1;
    else if (s === 'due_today') dueToday += 1;
    else if (s === 'open' || s === 'no_date') open += 1;
  }
  return { overdue, dueToday, open, needsAttention: overdue + dueToday };
}

/** Rows for the tasks page: open first, soonest due first, undated last. Done tasks only when asked. */
export function tasksView(tasks = [], now = Date.now(), offsetMin = 0, { includeDone = false } = {}) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && typeof t.title === 'string' && (includeDone || t.done !== true))
    .map((t) => ({
      id: clip(t.id, 128),
      title: clip(t.title, TASK_TITLE_MAX),
      dueDate: clip(t.dueDate, 10),
      assignedTo: clip(t.assignedTo, 128),
      done: t.done === true,
      state: taskState(t, now, offsetMin),
    }))
    .sort((a, b) => (Number(a.done) - Number(b.done))
      || ((a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1))
      || a.dueDate.localeCompare(b.dueDate))
    .slice(0, TASK_LIST_MAX);
}

/** A task id must be a plain Firestore id, so it can never point at another path. */
export function validTaskId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{5,128}$/.test(id);
}
