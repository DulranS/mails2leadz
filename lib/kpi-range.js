// lib/kpi-range.js - an exact from-to range for the KPI figures, checked before use (spec 6.7). Pure.
export const KPI_RANGE_MAX_MONTHS = 24;
const DAY = 86400000;
const MONTH = 30.44 * DAY;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * { start, end, months } for a from-to range of whole days (both days included), or null when it is not a real range:
 * unreadable, reversed, starting in the future, or longer than KPI_RANGE_MAX_MONTHS.
 */
export function customDayRange(from, to, now = Date.now()) {
  if (!DAY_RE.test(String(from || '')) || !DAY_RE.test(String(to || ''))) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Rejects 31 February and other days that do not exist.
  if (new Date(a).toISOString().slice(0, 10) !== from || new Date(b).toISOString().slice(0, 10) !== to) return null;
  const end = b + DAY; // the last day counts in full
  if (end <= a || a > now) return null;
  const span = end - a;
  if (span > KPI_RANGE_MAX_MONTHS * MONTH) return null;
  return { start: a, end, months: Math.max(1, Math.round(span / MONTH)) };
}

/** The day the forecast and at-risk figures are read as of: the range's end, but never later than now. */
export function asOfTime(range, now = Date.now()) {
  return range && Number.isFinite(range.end) ? Math.min(range.end, now) : now;
}
