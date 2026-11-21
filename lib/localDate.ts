// The person's own calendar date (YYYY-MM-DD), not UTC's.
//
// `new Date().toISOString().slice(0, 10)` is the UTC date. For anyone east of
// Greenwich that is "yesterday" for the first hours of their day (Colombo,
// UTC+5:30: midnight to 5:30 am), so a sale logged then defaulted to the wrong
// date and "today" checks were off. This reads the device's local calendar
// instead. On a UTC server it returns the same value as before, so server code
// and scripts behave exactly as they did.
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
