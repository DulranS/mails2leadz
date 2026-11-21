// Date/time handling for the Time page's "Correct an entry" form.
//
// The form shows one date plus a start and an end time. All three must come from the SAME clock — the person's
// own (local) one. It used to read the date from UTC but the times from the local clock, so in Colombo
// (UTC+5:30) a shift that began between midnight and 5:30 am reopened with yesterday's date and saving moved the
// entry back a whole day. It also refused to re-save any shift that ran past midnight ("clock-out has to be after
// clock-in") because both times were glued to the same date, even if the manager only wanted to fix the rate.
import { localIsoDate } from "./localDate";

const pad = (n: number) => String(n).padStart(2, "0");

export function entryFields(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  return { date: localIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export interface EntryTimes { clockIn: number; clockOut: number; endsNextDay: boolean }

// An end time that is not after the start time means the shift ran past midnight, so it ends the next day (the
// usual time-clock rule). `endsNextDay` lets the form say so out loud instead of silently accepting a typo.
// Returns null when the date or either time is missing or not a real value.
export function entryTimes(date: string, start: string, end: string): EntryTimes | null {
  const clockIn = new Date(`${date}T${start}`).getTime();
  let clockOut = new Date(`${date}T${end}`).getTime();
  if (Number.isNaN(clockIn) || Number.isNaN(clockOut)) return null;
  let endsNextDay = false;
  if (clockOut <= clockIn) {
    const next = new Date(clockOut);
    next.setDate(next.getDate() + 1); // calendar day, so a daylight-saving change can't skew it
    clockOut = next.getTime();
    endsNextDay = true;
  }
  return { clockIn, clockOut, endsNextDay };
}
