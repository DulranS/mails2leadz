// Time and energy value (v288). What the team's clocked hours cost, what the business earns per hour worked, and how much of revenue
// does not depend on hours sold (recurring: memberships, subscriptions, retainers). It is there to show, in numbers, when the business
// is trading time for money and when it is building income that repeats. Pure: no I/O.
import type { TimeEntry } from "./types";

const HOUR_MS = 3_600_000;
const MAX_HOURS_PER_ENTRY = 24; // a clock entry longer than a day is a forgotten clock-out, not a shift

// Hours on one finished entry. A running entry (no clock-out yet) counts nothing until it is closed.
export function entryHours(e: Pick<TimeEntry, "clockIn" | "clockOut">): number {
  if (e.clockOut === undefined || !Number.isFinite(e.clockIn) || !Number.isFinite(e.clockOut)) return 0;
  const h = (e.clockOut - e.clockIn) / HOUR_MS;
  if (!(h > 0)) return 0;
  return Math.round(Math.min(h, MAX_HOURS_PER_ENTRY) * 100) / 100;
}

// The calendar month (local time, YYYY-MM) an entry was worked in.
export function monthOfEntry(clockIn: number): string {
  const d = new Date(clockIn);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface TimeValueInput {
  entries: Pick<TimeEntry, "clockIn" | "clockOut" | "hourlyRate" | "billable" | "memberName">[];
  month: string;
  totalRevenue: number;
  recurringRevenue: number;
  netProfitAfterTax: number;
}

export interface TimeValue {
  month: string;
  hours: number;
  billableHours: number;
  labourCost: number; // hours × the rate snapshotted at clock-in, per entry
  byPerson: { name: string; hours: number }[]; // most hours first
  profitPerHour: number | null; // net profit after tax ÷ hours worked; null with no hours
  recurringSharePct: number | null; // recurring revenue as a share of total revenue; null with no revenue
}

export function timeValueFor(i: TimeValueInput): TimeValue {
  let hours = 0;
  let billableHours = 0;
  let labourCost = 0;
  const people = new Map<string, number>();
  for (const e of i.entries) {
    if (e.clockOut === undefined || monthOfEntry(e.clockIn) !== i.month) continue;
    const h = entryHours(e);
    if (h === 0) continue;
    hours += h;
    if (e.billable) billableHours += h;
    if (Number.isFinite(e.hourlyRate) && (e.hourlyRate as number) > 0) labourCost += h * (e.hourlyRate as number);
    const name = e.memberName || "Unnamed";
    people.set(name, (people.get(name) ?? 0) + h);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    month: i.month,
    hours: r2(hours),
    billableHours: r2(billableHours),
    labourCost: r2(labourCost),
    byPerson: [...people.entries()].map(([name, h]) => ({ name, hours: r2(h) })).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    profitPerHour: hours > 0 ? r2(i.netProfitAfterTax / hours) : null,
    recurringSharePct: i.totalRevenue > 0 ? Math.round((i.recurringRevenue / i.totalRevenue) * 1000) / 10 : null,
  };
}
