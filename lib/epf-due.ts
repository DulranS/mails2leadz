// EPF/ETF due dates, late-payment surcharges and the ETF late-return penalty (pass 303). Pure: no I/O.
//
// Due date (both funds): by the LAST WORKING DAY of the following month (epf.lk; etfb.lk "Payment of Contributions").
// A working day is Monday to Friday and not a listed holiday (lib/lk-holidays.ts).
//
// Late surcharge on the contribution (epf.lk and etfb.lk; the ETF Act s.27 uses the same scale):
//   1-10 days late 5%; 11 days to 1 month 15%; 1-3 months 20%; 3-6 months 30%; 6-12 months 40%; over 12 months 50%.
//   The sources give the bands in months. The day cut-offs here (30, 90, 180, 365) approximate them.
//   The sources do not say whether the rate is one-off or per period. This code applies one rate to the whole contribution.
// ETF late return (Section 37A, etfb.lk): 1% of the contribution for each completed month or part of a month late.
import { holidaysFor, holidaysKnownFor, LK_HOLIDAYS_CHECKED_ON } from "./lk-holidays";

export const EPF_DUE_CHECKED_ON = LK_HOLIDAYS_CHECKED_ON;

/** The last working day of a 1-12 month, as YYYY-MM-DD. Weekends, and the holidays of that year, are skipped. */
export function lastWorkingDay(year: number, month: number, holidays: ReadonlySet<string> = holidaysFor(year)): string {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 of the next month = the last day of `month`
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || holidays.has(d.toISOString().slice(0, 10))) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

/** The due date for contributions on pay for `payMonth` (YYYY-MM), and whether a holiday calendar covered it. */
export function epfDueInfo(payMonth: string): { date: string; holidaysChecked: boolean } {
  const [y, m] = payMonth.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1; // the following month, 1-12
  return { date: lastWorkingDay(ny, nm), holidaysChecked: holidaysKnownFor(ny) };
}

/** The due date (YYYY-MM-DD) for contributions on pay for `payMonth` (YYYY-MM). */
export function epfDueDate(payMonth: string): string {
  return epfDueInfo(payMonth).date;
}

/** Whole days from `today` (YYYY-MM-DD) to `due`; negative once past. */
export function daysUntilDue(due: string, today: string): number {
  const ms = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The late-payment surcharge bands: the most days late each rate covers. Source: epf.lk, etfb.lk. */
export const LATE_BANDS: ReadonlyArray<{ maxDays: number; rate: number }> = [
  { maxDays: 10, rate: 0.05 },
  { maxDays: 30, rate: 0.15 },
  { maxDays: 90, rate: 0.2 },
  { maxDays: 180, rate: 0.3 },
  { maxDays: 365, rate: 0.4 },
  { maxDays: Infinity, rate: 0.5 },
];

/** The surcharge rate for a payment this many days late. Zero when on time or early. */
export function lateSurchargeRate(daysLate: number): number {
  if (!(daysLate > 0)) return 0;
  return LATE_BANDS.find((b) => daysLate <= b.maxDays)!.rate;
}

/** The surcharge in money on a contribution, to 2 decimals. */
export function lateSurchargeAmount(contribution: number, daysLate: number): number {
  return Math.round(contribution * lateSurchargeRate(daysLate) * 100) / 100;
}

/** The ETF late-return penalty: 1% of the contribution for each completed month or part of a month late (etfb.lk). */
export function lateReturnPenalty(contribution: number, daysLate: number): number {
  if (!(daysLate > 0)) return 0;
  return Math.round(contribution * 0.01 * Math.ceil(daysLate / 30) * 100) / 100;
}
