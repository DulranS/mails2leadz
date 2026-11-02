// lib/calendar-links.js - "add to my calendar" links for a booking (pure). Google and Outlook open a ready-made event;
// nothing is written to anyone's calendar by the app, and no permission from a calendar provider is needed.
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function calendarLinks({ title = '', startIso = '', endIso = '', details = '', location = '' } = {}) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const end = Number.isFinite(Date.parse(endIso)) ? Date.parse(endIso) : start + 60 * 60000;
  const t = String(title).slice(0, 120);
  const d = String(details).slice(0, 500);
  const l = String(location).slice(0, 200);
  const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(t)}&dates=${stamp(start)}/${stamp(end)}`
    + `&details=${encodeURIComponent(d)}&location=${encodeURIComponent(l)}`;
  const outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent'
    + `&subject=${encodeURIComponent(t)}&startdt=${encodeURIComponent(new Date(start).toISOString())}`
    + `&enddt=${encodeURIComponent(new Date(end).toISOString())}&body=${encodeURIComponent(d)}&location=${encodeURIComponent(l)}`;
  return { google, outlook };
}
