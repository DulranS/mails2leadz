// lib/server/calendar-read.js - reads a calendar (iCalendar, RFC 5545) and returns the times it is busy, within a window.
// Uses a maintained parser: named time zones, repeats (any rule), exceptions (EXDATE), single moved or cancelled occurrences
// (RECURRENCE-ID), all-day events. Read only. Throws if the text is not a calendar, so the caller can fail closed.
import ical from 'node-ical';

const DAY = 86400000;

/**
 * A time with no zone ("local" or "floating") means the calendar owner's own time. The server's zone is not the owner's,
 * so such times are converted to UTC here, using the owner's offset, before parsing.
 */
export function floatingToUtc(text, tzOffsetMin = 0) {
  const off = Number(tzOffsetMin) || 0;
  return String(text).replace(/^((?:DTSTART|DTEND|RECURRENCE-ID)(?:;VALUE=DATE-TIME)?):(\d{8}T\d{6})$/gm, (_m, head, v) => {
    const y = Number(v.slice(0, 4)); const mo = Number(v.slice(4, 6)) - 1; const d = Number(v.slice(6, 8));
    const h = Number(v.slice(9, 11)); const mi = Number(v.slice(11, 13)); const se = Number(v.slice(13, 15));
    const utc = new Date(Date.UTC(y, mo, d, h, mi, se) - off * 60000);
    const f = (n, w = 2) => String(n).padStart(w, '0');
    return `${head}:${utc.getUTCFullYear()}${f(utc.getUTCMonth() + 1)}${f(utc.getUTCDate())}T${f(utc.getUTCHours())}${f(utc.getUTCMinutes())}${f(utc.getUTCSeconds())}Z`;
  });
}

export function busyFromIcs(text, { from, to, tzOffsetMin = 0, maxOccurrences = 5000 } = {}) {
  if (typeof text !== 'string' || !/BEGIN:VCALENDAR/i.test(text)) throw new Error('Not an iCalendar file.');
  const data = ical.parseICS(floatingToUtc(text, tzOffsetMin));
  const out = [];
  const fromD = new Date(from);
  const toD = new Date(to);
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;
    if (String(ev.transparency || '').toUpperCase() === 'TRANSPARENT') continue; // marked "free"
    const occurrences = ev.rrule
      ? ical.expandRecurringEvent(ev, { from: fromD, to: toD, includeOverrides: true })
      : [{ start: ev.start, end: ev.end || ev.start, status: ev.status }];
    // single occurrences the owner cancelled in the calendar (an exception stored on the repeating event)
    const cancelled = new Set();
    for (const [key, ov] of Object.entries(ev.recurrences || {})) {
      if (String(ov?.status || '').toUpperCase() !== 'CANCELLED') continue;
      const when = ov.recurrenceid ? new Date(ov.recurrenceid) : (/T/.test(key) ? new Date(key) : null);
      if (when && Number.isFinite(when.getTime())) cancelled.add(when.getTime());
    }
    let n = 0;
    for (const occ of occurrences) {
      if (++n > maxOccurrences) break;
      if (String(occ.status || '').toUpperCase() === 'CANCELLED') continue;
      if (cancelled.has(new Date(occ.start).getTime())) continue;
      const s = new Date(occ.start).getTime();
      let e = occ.end ? new Date(occ.end).getTime() : s;
      if (!Number.isFinite(s)) continue;
      if (!(e > s)) e = s + DAY; // an all-day event with no end is its whole day
      if (e > from && s < to) out.push([s, e]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
