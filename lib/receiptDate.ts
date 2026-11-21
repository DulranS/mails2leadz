// Turns the date text the receipt scanner (lib/ocr.ts extractStructuredData) finds into YYYY-MM-DD.
//
// Why this exists: the Purchases and Expenses forms used `new Date(text).toISOString().slice(0, 10)`.
// That is wrong in two ways for this app's market:
//   1. "05/10/2026" is read by JavaScript as month/day (5 May), not day/month (5 October), and
//      "25/10/2026" is "Invalid Date" so the scan silently filled nothing.
//   2. "5 Oct 2026" and "2026/10/05" are read as LOCAL midnight, and toISOString() converts that to
//      UTC, so in Colombo (UTC+5:30) the form was pre-filled with the day BEFORE the receipt.
// The pre-filled date drives the books (and the period lock), so a wrong day is a wrong entry.
//
// This never touches Date or any timezone: it reads the digits and checks the calendar itself.
// Ambiguous numeric dates (both parts 12 or under, e.g. 05/10/2026) are read day first, which is how
// receipts are written in Sri Lanka, the UK and most of the world. If one part is over 12 it can only be
// the day, so that wins regardless of order.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12; day 0 of next month
}

function build(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 2000 || y > 2100) return null; // a receipt is not from the year 1 or 9999 (OCR noise)
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysIn(y, m)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Returns a real calendar date as YYYY-MM-DD, or null when the text is not one (the caller then leaves the
// date field alone rather than guessing).
export function parseReceiptDate(text: string | undefined | null): string | null {
  if (!text) return null;
  const s = text.trim();

  // 2026-10-05, 2026/10/5, 2026-1-5 (year first is never ambiguous)
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  // 5 Oct 2026, 05 October 2026
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    return mi === -1 ? null : build(Number(m[3]), mi + 1, Number(m[1]));
  }

  // 05/10/2026, 5-10-2026, 25/10/2026
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 && b <= 12) return build(y, b, a); // 25/10 -> day first, forced
    if (b > 12 && a <= 12) return build(y, a, b); // 10/25 -> month first, forced
    if (a > 12 && b > 12) return null; // neither can be a month
    return build(y, b, a); // ambiguous: day first
  }

  return null;
}
