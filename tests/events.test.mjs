// Events (Pass 215): valid events only; capacity counts each person once; reminders once, a day before.
import assert from 'node:assert/strict';
import { validEvent, rsvpStatus, reminderDue } from '../lib/events.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('an event needs a name, a real date and a sensible capacity', () => {
  assert.equal(validEvent({ title: 'Open day', startsAt: '2026-11-20T10:00:00Z', capacity: 30 }).ok, true);
  assert.equal(validEvent({ title: 'x', startsAt: '2026-11-20T10:00:00Z' }).ok, false);
  assert.equal(validEvent({ title: 'Open day', startsAt: 'soon' }).ok, false);
  assert.equal(validEvent({ title: 'Open day', startsAt: '2026-11-20T10:00:00Z', capacity: 0 }).ok, false);
  assert.equal(validEvent({ title: 'Open day', startsAt: '2026-11-20T10:00:00Z', capacity: 9999 }).ok, false);
});

t('capacity counts each person once, and a full event is marked full', () => {
  const ev = { capacity: 2 };
  const st = rsvpStatus(ev, [{ email: 'a@x.com' }, { email: 'A@x.com' }, { email: 'b@x.com' }]);
  assert.equal(st.going, 2);
  assert.equal(st.spotsLeft, 0);
  assert.equal(st.full, true);
  assert.equal(rsvpStatus({ capacity: null }, [{ email: 'a@x.com' }]).spotsLeft, null);
});

t('a reminder is due once, only within a day of the start', () => {
  assert.equal(reminderDue({ startsAt: new Date(now + 6 * 3600000).toISOString(), reminded: false }, now), true);
  assert.equal(reminderDue({ startsAt: new Date(now + 6 * 3600000).toISOString(), reminded: true }, now), false);
  assert.equal(reminderDue({ startsAt: new Date(now + 3 * DAY).toISOString(), reminded: false }, now), false);
  assert.equal(reminderDue({ startsAt: new Date(now - 3600000).toISOString(), reminded: false }, now), false);
});

console.log(`\n${n} passed`);
