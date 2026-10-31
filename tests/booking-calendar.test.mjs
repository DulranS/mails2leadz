import assert from 'node:assert/strict';
import { hoursFor, slotsAcross, sanitizeHours } from '../lib/booking.js';
import { confirmationText } from '../lib/server/booking-mail.js';
import { busyFromIcs } from '../lib/server/calendar-read.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const H = 3600000;
const TZ = 330;
const FROM = Date.UTC(2026, 10, 1); const TO = Date.UTC(2026, 10, 22);

t('a staff member with their own hours is not bound by the shared hours; without their own they use the shared ones', () => {
  const cfg = { hours: { mon: ['09:00', '17:00'] }, staffHours: { m1: { mon: ['13:00', '18:00'] } } };
  assert.deepEqual(hoursFor(cfg, 'm1'), { mon: ['13:00', '18:00'] });
  assert.deepEqual(hoursFor(cfg, 'owner'), { mon: ['09:00', '17:00'] });
  assert.equal(sanitizeHours({ mon: ['13:00', '18:00'] }).error, undefined);
});

t('a time with no zone is the owner\'s own local time, whatever zone the server runs in', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:f', 'DTSTART:20261102T140000', 'DTEND:20261102T150000', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const busy = busyFromIcs(ics, { from: FROM, to: TO, tzOffsetMin: TZ });
  assert.equal(busy[0][0], Date.UTC(2026, 10, 2, 14, 0) - TZ * 60000);
});

t('a weekly repeat is expanded inside the window, with COUNT respected; a long line is unfolded', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'DTSTART:20261102T040000Z', 'DTEND:20261102T050000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:A very long title that is folded across',
    ' two lines', 'DTSTART:20261110T000000Z', 'DTEND:20261110T010000Z', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  const busy = busyFromIcs(ics, { from: FROM, to: Date.UTC(2026, 11, 31), tzOffsetMin: 0 });
  assert.deepEqual(busy.map((b) => new Date(b[0]).toISOString()).sort(), [
    '2026-11-02T04:00:00.000Z', '2026-11-09T04:00:00.000Z', '2026-11-10T00:00:00.000Z', '2026-11-16T04:00:00.000Z',
  ]);
});

t('the confirmation carries the customer\'s manage link and the time, and nothing else', () => {
  const m = confirmationText({ name: 'Ann', serviceName: 'Cut', startLabel: '2 Nov 2026 03:30 UTC', manageLink: 'https://a.example/manage?t=x', businessName: 'Studio' });
  assert.match(m.subject, /Confirmed: Cut/);
  assert.match(m.text, /https:\/\/a\.example\/manage\?t=x/);
  assert.match(m.text, /24 hours before/);
  assert.doesNotMatch(m.text, /undefined/);
});

t('one list of free times across staff: a shared start is offered once, tagged with the first staff member who has it', () => {
  const hours = { mon: ['09:00', '11:00'] };
  const now = Date.UTC(2026, 9, 31);
  const list = slotsAcross({ now, minutes: 60, horizonDays: 10, staff: [
    { id: 'owner', hours, tzOffsetMin: TZ, busy: [[Date.UTC(2026, 10, 2, 3, 30), Date.UTC(2026, 10, 2, 4, 30)]] },
    { id: 'm1', hours, tzOffsetMin: TZ, busy: [] },
  ] });
  const first = list.find((s) => s.label.startsWith('2026-11-02 09:00'));
  assert.equal(first.staffId, 'm1', 'the owner is busy at 09:00, so the manager takes it');
  const second = list.find((s) => s.label.startsWith('2026-11-02 10:00'));
  assert.equal(second.staffId, 'owner');
  assert.equal(list.filter((s) => s.label.startsWith('2026-11-02 10:00')).length, 1);
});

t('an all-day event blocks its whole day', () => {
  const busy = busyFromIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261105\nDTEND;VALUE=DATE:20261106\nEND:VEVENT\nEND:VCALENDAR', { from: FROM, to: TO, tzOffsetMin: TZ });
  assert.equal(busy.length, 1);
  assert.equal(busy[0][1] - busy[0][0], 24 * 3600000);
});

t('a repeat with a named time zone and an exception: the first and third occurrences are busy at the local time, the excepted one is not', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=America/New_York:20261102T090000', 'DTEND;TZID=America/New_York:20261102T100000',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=2;COUNT=3', 'EXDATE;TZID=America/New_York:20261202T090000', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const busy = busyFromIcs(ics, { from: FROM, to: Date.UTC(2027, 1, 1) });
  assert.deepEqual(busy.map((b) => new Date(b[0]).toISOString()), ['2026-11-02T14:00:00.000Z', '2027-01-02T14:00:00.000Z']);
});

t('a single occurrence moved in the calendar is busy at its new time, and its old time is free', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261104T090000Z', 'DTEND:20261104T100000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'RECURRENCE-ID:20261105T090000Z', 'DTSTART:20261105T130000Z', 'DTEND:20261105T140000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const starts = busyFromIcs(ics, { from: FROM, to: TO }).map((b) => new Date(b[0]).toISOString());
  assert.ok(starts.includes('2026-11-05T13:00:00.000Z'));
  assert.ok(!starts.includes('2026-11-05T09:00:00.000Z'));
});

t('a single occurrence cancelled in the calendar is free; "free" events and cancelled events block nothing; all-day blocks its day', () => {
  const cancelled = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261104T090000Z', 'DTEND:20261104T100000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'RECURRENCE-ID:20261105T090000Z', 'DTSTART:20261105T090000Z', 'DTEND:20261105T100000Z', 'STATUS:CANCELLED', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  assert.ok(!busyFromIcs(cancelled, { from: FROM, to: TO }).some((b) => new Date(b[0]).toISOString() === '2026-11-05T09:00:00.000Z'));
  const free = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:e', 'DTSTART:20261110T090000Z', 'DTEND:20261110T100000Z', 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  assert.equal(busyFromIcs(free, { from: FROM, to: TO }).length, 0);
  const allDay = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:d', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const day = busyFromIcs(allDay, { from: FROM, to: TO });
  assert.equal(day.length, 1);
  assert.equal(day[0][1] - day[0][0], 24 * 3600000);
});

t('something that is not a calendar is refused, so the caller fails closed', () => {
  assert.throws(() => busyFromIcs('<html>login</html>', { from: FROM, to: TO }));
});

console.log(`booking-calendar: ${n} passed`);
