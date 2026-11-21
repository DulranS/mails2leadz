// Obligations calendar (v232): statutory filings, tax returns, licence renewals and other deadlines that come back on a rhythm. A repeating
// obligation rolls to its next due date the moment it is marked done, so the calendar keeps itself; anything past its due date is flagged, and
// anything due within two weeks is shown first. Pure: no I/O. It records when a thing was done; it does not file anything.

export const OBLIGATION_REPEATS = ["once", "monthly", "quarterly", "yearly"] as const;
export type ObligationRepeat = (typeof OBLIGATION_REPEATS)[number];
export const DUE_SOON_DAYS = 14;

export interface Obligation {
  id: string;
  name: string;
  dueDate: string; // the next day it is due
  repeat: ObligationRepeat;
  lastDoneOn?: string;
  timesDone?: number;
  notes?: string;
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// The same day, n months on, kept to the end of a shorter month (31 January + 1 month is 28 or 29 February).
export function addMonths(iso: string, n: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

const STEP: Record<Exclude<ObligationRepeat, "once">, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export function validateObligation(i: { name: string; dueDate: string; repeat: string }): string | null {
  if (!i.name || i.name.trim().length < 2) return "Say what must be done.";
  if (!isDay(i.dueDate)) return "Enter the next day it is due.";
  if (!(OBLIGATION_REPEATS as readonly string[]).includes(i.repeat)) return "Choose how often it comes back.";
  return null;
}

// Mark done on a day: a repeating obligation moves to its next due date after the one just done; a one-off is finished.
export function completeObligation(o: Obligation, doneOn: string): Obligation {
  const times = (o.timesDone ?? 0) + 1;
  if (o.repeat === "once") return { ...o, lastDoneOn: doneOn, timesDone: times, dueDate: o.dueDate };
  // Roll forward from the due date that was met, not from the day it was ticked, so an early or late tick does not move the rhythm.
  let next = addMonths(o.dueDate, STEP[o.repeat]);
  while (next <= doneOn) next = addMonths(next, STEP[o.repeat]);
  return { ...o, lastDoneOn: doneOn, timesDone: times, dueDate: next };
}

export function statusOf(o: Obligation, today: string): "done" | "overdue" | "due_soon" | "upcoming" {
  if (o.repeat === "once" && o.lastDoneOn) return "done";
  const left = daysBetween(today, o.dueDate);
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

export function calendarSummary(obligations: Obligation[], today: string) {
  const rows = obligations.map((o) => ({ o, status: statusOf(o, today), daysLeft: daysBetween(today, o.dueDate) }));
  const rank = { overdue: 0, due_soon: 1, upcoming: 2, done: 3 } as const;
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.daysLeft - b.daysLeft);
  return {
    rows,
    overdue: rows.filter((r) => r.status === "overdue").length,
    dueSoon: rows.filter((r) => r.status === "due_soon").length,
  };
}
