// Regular weekly day off (v286). Each employee can have one weekday they do not work (for example Sunday). A shift set on that weekday is
// flagged on the rota, the same way a shift on approved leave is. The rota flags it; it does not stop the shift being saved. Pure: no I/O.
import type { Employee, ShiftEntry } from "./types";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// 0 = Sunday ... 6 = Saturday for an ISO date, or null when the date is not usable.
export function weekdayOf(iso: string): number | null {
  if (!ISO.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

export function isWeeklyOff(e: Pick<Employee, "weeklyOffDay">, iso: string): boolean {
  if (e.weeklyOffDay === undefined || e.weeklyOffDay === null) return false;
  return weekdayOf(iso) === e.weeklyOffDay;
}

// Shifts that fall on the person's regular day off.
export function weeklyOffClashes(
  shifts: Pick<ShiftEntry, "id" | "employeeId" | "employeeName" | "date">[],
  employees: Pick<Employee, "id" | "weeklyOffDay">[],
): { shiftId: string; employeeName: string; date: string }[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out: { shiftId: string; employeeName: string; date: string }[] = [];
  for (const s of shifts) {
    const e = byId.get(s.employeeId);
    if (e && isWeeklyOff(e, s.date)) out.push({ shiftId: s.id, employeeName: s.employeeName, date: s.date });
  }
  return out;
}

// A regular day off must be a weekday, or empty for none.
export function validWeeklyOffDay(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6 ? null : "The regular day off must be a day of the week.";
}
