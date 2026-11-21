// Staff rota: who works which hours on which day. Owner and manager set shifts; the whole team can read them.
//
// A shift is one person on one day, within that day (no overnight shifts: split it over two days). Leave that overlaps a shift is
// flagged, not blocked, so the owner can decide. Records only: nothing is paid from a shift, and pay stays on the employee record.
import { addDays, daysBetween, isIsoDate } from "./playbook";
import type { LeaveRecord, ShiftEntry } from "./types";

export const MAX_ROTA_NOTE = 200;
export const MAX_SHIFT_HOURS = 16;

export interface ShiftInput {
  employeeId: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  location?: string;
  note?: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// null when the shift can be saved; otherwise the sentence to show the person.
export function validateShift(i: ShiftInput): string | null {
  if (!i.employeeId || !(i.employeeName ?? "").trim()) return "Pick the person it is for.";
  if (!isIsoDate(i.date)) return "Pick the day.";
  if (!HHMM.test(i.start) || !HHMM.test(i.end)) return "Times are 24-hour, like 09:00 or 17:30.";
  const mins = toMinutes(i.end) - toMinutes(i.start);
  if (mins <= 0) return "The shift must end after it starts. A shift cannot run past midnight, so split it over two days.";
  if (mins > MAX_SHIFT_HOURS * 60) return `A shift can be at most ${MAX_SHIFT_HOURS} hours.`;
  if ((i.note ?? "").length > MAX_ROTA_NOTE) return `Keep the note to ${MAX_ROTA_NOTE} characters.`;
  return null;
}

export const shiftHours = (start: string, end: string) => (toMinutes(end) - toMinutes(start)) / 60;

// The Monday of the week a day falls in (weeks run Monday to Sunday).
export function mondayOf(iso: string): string {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// Hours per person for the week starting on `monday`, most hours first. Shifts outside that week are left out.
export function weekHours(shifts: ShiftEntry[], monday: string): { employeeId: string; employeeName: string; hours: number; count: number }[] {
  const sunday = addDays(monday, 6);
  const byId = new Map<string, { employeeId: string; employeeName: string; hours: number; count: number }>();
  for (const s of shifts) {
    if (s.date < monday || s.date > sunday) continue;
    const row = byId.get(s.employeeId) ?? { employeeId: s.employeeId, employeeName: s.employeeName, hours: 0, count: 0 };
    row.hours += shiftHours(s.start, s.end);
    row.count += 1;
    byId.set(s.employeeId, row);
  }
  return [...byId.values()].sort((a, b) => b.hours - a.hours || a.employeeName.localeCompare(b.employeeName));
}

// The leave that covers this person on this day, if any.
export function leaveOn(employeeId: string, date: string, leaves: LeaveRecord[]): LeaveRecord | undefined {
  return leaves.find((l) => l.employeeId === employeeId && l.from <= date && date <= l.to);
}

// Shifts that fall on approved leave for the same person.
export function leaveClashes(shifts: ShiftEntry[], leaves: LeaveRecord[]): { shiftId: string; employeeName: string; date: string }[] {
  const out: { shiftId: string; employeeName: string; date: string }[] = [];
  for (const s of shifts) {
    if (leaveOn(s.employeeId, s.date, leaves)) out.push({ shiftId: s.id, employeeName: s.employeeName, date: s.date });
  }
  return out;
}

// Copies the shifts of one week to the week starting on `toMonday`, keeping the weekday. A shift the target week already has for the
// same person, day and start is skipped, so copying twice does nothing the second time.
export function copyWeekPlan(
  source: ShiftEntry[],
  fromMonday: string,
  toMonday: string,
  existing: ShiftEntry[]
): { toAdd: ShiftInput[]; skipped: number } {
  const shift = daysBetween(fromMonday, toMonday);
  const sunday = addDays(fromMonday, 6);
  const taken = new Set(existing.map((s) => `${s.employeeId}|${s.date}|${s.start}`));
  const toAdd: ShiftInput[] = [];
  let skipped = 0;
  for (const s of source) {
    if (s.date < fromMonday || s.date > sunday) continue;
    const date = addDays(s.date, shift);
    const key = `${s.employeeId}|${date}|${s.start}`;
    if (taken.has(key)) {
      skipped += 1;
      continue;
    }
    taken.add(key);
    toAdd.push({ employeeId: s.employeeId, employeeName: s.employeeName, date, start: s.start, end: s.end, location: s.location, note: s.note });
  }
  return { toAdd, skipped };
}
