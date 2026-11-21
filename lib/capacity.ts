// Capacity (v193b): for each day, how many hours the team is rostered to work (less anyone on approved leave) against how many hours
// are booked. A day that is booked beyond what is rostered, or booked with nobody rostered, is what an owner needs to see before the
// customer does. Pure: no I/O; the caller passes the records and the days to look at.
import { leaveOn } from "./rota";
import type { Booking, LeaveRecord, ShiftEntry } from "./types";

export type CapacityFlag = "over" | "unstaffed" | "tight" | "spare" | "ok" | "none";

export interface CapacityDay {
  date: string;
  staffedHours: number; // rostered, less leave
  bookedHours: number;
  utilizationPct: number | null; // booked / staffed, or null when nobody is rostered
  flag: CapacityFlag;
}

const minutesBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

// The flag a day gets. "over": more booked than rostered. "unstaffed": booked with nobody rostered. "tight": 85% or more of the
// rostered hours are booked. "spare": 40% or less. "none": nothing booked and nobody rostered.
export function flagFor(staffed: number, booked: number): CapacityFlag {
  if (booked > 0 && staffed === 0) return "unstaffed";
  if (staffed === 0) return "none";
  const u = booked / staffed;
  if (u > 1) return "over";
  if (u >= 0.85) return "tight";
  if (u <= 0.4) return "spare";
  return "ok";
}

export function capacityFor(days: string[], shifts: ShiftEntry[], leaves: LeaveRecord[], bookings: Booking[]): CapacityDay[] {
  const counted = bookings.filter((b) => b.status === "booked" || b.status === "done");
  return days.map((date) => {
    let staffed = 0;
    for (const s of shifts) {
      if (s.date !== date) continue;
      if (leaveOn(s.employeeId, date, leaves)) continue; // a person on leave is not rostered that day
      staffed += Math.max(0, minutesBetween(s.start, s.end)) / 60;
    }
    let booked = 0;
    for (const b of counted) if (b.date === date) booked += b.durationMin / 60;
    const r = (n: number) => Math.round(n * 10) / 10;
    const staffedHours = r(staffed);
    const bookedHours = r(booked);
    return {
      date,
      staffedHours,
      bookedHours,
      utilizationPct: staffedHours > 0 ? Math.round((bookedHours / staffedHours) * 100) : null,
      flag: flagFor(staffedHours, bookedHours),
    };
  });
}

// The next n days from `today` (inclusive), as ISO dates.
export function nextDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
}
