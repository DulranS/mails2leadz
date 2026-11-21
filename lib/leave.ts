// Staff leave: a plain record of days off, and what is left of each person's yearly allowance.
//
// Nothing here touches the books. A leave record is a note of who was away and for how many days. Paid leave counts
// against the person's yearly allowance (set on the employee as "paid leave days a year"); unpaid leave does not, and
// is offered as "no-pay days" when a payslip is prepared. The business sets the allowance; Balancr does not know or
// check what the law gives anyone.
//
//   Allowance used in a year = days of every paid kind (annual, casual, sick, other) whose FROM date falls in that year.
//   A record is placed by its from-date: a spell that crosses New Year counts wholly in the year it started.
//   Unpaid days for a payslip month = days of unpaid records whose FROM date falls in that month, for the same reason.
import type { Employee, LeaveRecord, LeaveType } from "./types";
import { isIsoDate, daysBetween } from "./playbook";

export const LEAVE_TYPES: { value: LeaveType; label: string; paid: boolean }[] = [
  { value: "annual", label: "Annual leave", paid: true },
  { value: "casual", label: "Casual leave", paid: true },
  { value: "sick", label: "Sick leave", paid: true },
  { value: "other", label: "Other paid leave", paid: true },
  { value: "unpaid", label: "No-pay leave", paid: false },
];

export const MAX_LEAVE_NOTE = 300;

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export function isPaidLeave(t: LeaveType): boolean {
  return t !== "unpaid";
}

// Calendar days from..to, both included. 0 if either date is not real or they are the wrong way round.
export function leaveSpanDays(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return 0;
  return daysBetween(from, to) + 1;
}

export interface LeaveInput {
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  note?: string;
}

// First problem in plain words, or null when the record can be saved. `days` may be a half day (0.5 steps) and can be
// fewer than the calendar span (weekends and public holidays are not leave), never more.
export function validateLeaveInput(i: LeaveInput): string | null {
  if (!i.employeeId) return "Choose who this is for.";
  if (!LEAVE_TYPES.some((t) => t.value === i.type)) return "Choose the kind of leave.";
  if (!isIsoDate(i.from) || !isIsoDate(i.to)) return "Enter real from and to dates.";
  if (i.to < i.from) return "The last day is before the first day.";
  if (typeof i.days !== "number" || !Number.isFinite(i.days) || i.days <= 0) return "Days must be more than 0.";
  if (!Number.isInteger(i.days * 2)) return "Days can be whole or half days (for example 1, 1.5 or 2).";
  if (i.days > leaveSpanDays(i.from, i.to)) return "More days than the dates cover. Check the dates or the number of days.";
  if ((i.note ?? "").length > MAX_LEAVE_NOTE) return `The note is too long (most ${MAX_LEAVE_NOTE} characters).`;
  return null;
}

// No undefined or blank optional fields reach the database.
export function cleanLeaveInput(i: LeaveInput): LeaveInput {
  const note = (i.note ?? "").trim();
  return { employeeId: i.employeeId, type: i.type, from: i.from, to: i.to, days: i.days, ...(note ? { note } : {}) };
}

export interface LeaveBalance {
  allowance: number; // paid days a year, 0 = not tracked
  usedPaid: number;
  remaining: number; // may be negative: leave taken beyond the allowance
  over: boolean;
  unpaid: number; // no-pay days started in the year
}

export function leaveBalance(allowance: number | undefined, records: Pick<LeaveRecord, "type" | "from" | "days">[], year: number): LeaveBalance {
  const a = typeof allowance === "number" && Number.isFinite(allowance) && allowance > 0 ? allowance : 0;
  let usedPaid = 0;
  let unpaid = 0;
  const y = String(year);
  for (const r of records) {
    if (!r.from || r.from.slice(0, 4) !== y) continue;
    const d = Number.isFinite(r.days) ? r.days : 0;
    if (isPaidLeave(r.type)) usedPaid += d; else unpaid += d;
  }
  usedPaid = round1(usedPaid);
  unpaid = round1(unpaid);
  const remaining = round1(a - usedPaid);
  return { allowance: a, usedPaid, remaining, over: a > 0 && remaining < 0, unpaid };
}

// No-pay days that start in the month (YYYY-MM) for one employee: what a payslip offers to deduct.
export function unpaidDaysInMonth(records: Pick<LeaveRecord, "employeeId" | "type" | "from" | "days">[], employeeId: string, month: string): number {
  let total = 0;
  for (const r of records) {
    if (r.employeeId !== employeeId || r.type !== "unpaid" || !r.from || r.from.slice(0, 7) !== month) continue;
    total += Number.isFinite(r.days) ? r.days : 0;
  }
  return round1(total);
}

export interface LeaveRow {
  employeeId: string;
  name: string;
  balance: LeaveBalance;
}

// One row per active employee that has an allowance set, plus anyone (active or not) who has taken leave this year.
export function leaveOverview(employees: Employee[], records: LeaveRecord[], year: number): LeaveRow[] {
  const rows: LeaveRow[] = [];
  for (const e of employees) {
    const mine = records.filter((r) => r.employeeId === e.id);
    const balance = leaveBalance(e.leaveDaysPerYear, mine, year);
    const tookLeave = balance.usedPaid > 0 || balance.unpaid > 0;
    if (!(e.active && balance.allowance > 0) && !tookLeave) continue;
    rows.push({ employeeId: e.id, name: e.name, balance });
  }
  return rows.sort((a, b) => Number(b.balance.over) - Number(a.balance.over) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
