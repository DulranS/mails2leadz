// Sri Lanka holidays for EPF/ETF due dates (pass 303). Public, bank, mercantile and full-moon poya days.
// Source: Government of Sri Lanka desk calendar 2026, "Public, bank, mercantile and full moon poya holidays - 2026"
//   (documents.gov.lk/view/calander/2026/2026_E.pdf). The calendar says "(Subject to Variation)": changes are gazetted.
// Amendment: EFC circular No 17 of 2026 (employers.lk) moves the Day following Vesak Full Moon Poya Day from 2026-05-02
//   to 2026-05-31 (Gazette No 2845/14, 21 April 2026). Shop and office extra holiday on 2026-06-01 is not included: it is
//   not a due date in any month, so it cannot move one.
// Poya days are treated as holidays too. That is the safe side: a due date can only fall earlier, never later.
// No calendar is loaded for 2027 yet. For such a year the due date uses weekdays only, and the note says so.
export const LK_HOLIDAYS_CHECKED_ON = "2026-11-17";

export const LK_HOLIDAYS: Record<number, readonly string[]> = {
  2026: [
    "2026-01-03", "2026-01-15", "2026-02-01", "2026-02-04", "2026-02-15", "2026-03-02", "2026-03-21",
    "2026-04-01", "2026-04-03", "2026-04-13", "2026-04-14", "2026-05-01", "2026-05-28", "2026-05-30",
    "2026-05-31", "2026-06-29", "2026-07-29", "2026-08-26", "2026-08-27", "2026-09-26", "2026-10-25",
    "2026-11-08", "2026-11-24", "2026-12-23", "2026-12-25",
  ],
};

/** True when a holiday calendar is loaded for that year. */
export function holidaysKnownFor(year: number): boolean {
  return Object.prototype.hasOwnProperty.call(LK_HOLIDAYS, year);
}

/** The holiday dates for a year as a set of YYYY-MM-DD (empty when none is loaded). */
export function holidaysFor(year: number): Set<string> {
  return new Set(LK_HOLIDAYS[year] ?? []);
}
