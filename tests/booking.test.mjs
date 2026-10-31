import assert from 'node:assert/strict';
import { sanitizeService, sanitizeHours, slotsFor, isSlotAllowed, sanitizeRequest, intervalOf } from '../lib/booking.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const TZ = 330; // Colombo, UTC+05:30
const MON = Date.UTC(2026, 10, 2, 3, 30); // Monday 2 Nov 2026, 09:00 local
const HOURS = sanitizeHours({ mon: ['09:00', '12:00'] }).hours;

t('a service needs a name and a sensible length; the price is optional', () => {
  assert.match(sanitizeService({ name: '', minutes: 60 }).error, /name/);
  assert.match(sanitizeService({ name: 'Cut', minutes: 2 }).error, /between 5 and 480/);
  assert.equal(sanitizeService({ name: 'Cut', minutes: 30 }).service.price, null);
  assert.equal(sanitizeService({ name: 'Cut', minutes: 30, price: '12.345' }).service.price, 12.35);
});

t('working hours: 24-hour times, one range a day, the end after the start; a closed day is null', () => {
  assert.deepEqual(sanitizeHours({ mon: ['09:00', '17:00'] }).hours.mon, ['09:00', '17:00']);
  assert.equal(sanitizeHours({ sun: null }).hours.sun, null);
  assert.match(sanitizeHours({ mon: ['9am', '17:00'] }).error, /24-hour/);
  assert.match(sanitizeHours({ mon: ['17:00', '09:00'] }).error, /after its start/);
});

t('free times are in the owner\'s local time, on the working days, on a fixed grid from opening time', () => {
  const slots = slotsFor({ now: MON - 3 * 86400000, hours: HOURS, tzOffsetMin: TZ, minutes: 60, horizonDays: 10 });
  const first = slots[0];
  assert.equal(first.startIso, new Date(MON).toISOString(), 'first Monday 09:00 local');
  assert.deepEqual(slots.slice(0, 3).map((s) => s.label.slice(11)), ['09:00', '10:00', '11:00']);
});

t('a taken time is not offered, and an overlapping one is not offered either', () => {
  const busy = [intervalOf(new Date(MON).toISOString(), 60)];
  const slots = slotsFor({ now: MON - 3 * 86400000, hours: HOURS, tzOffsetMin: TZ, minutes: 60, busy, horizonDays: 10 });
  assert.ok(!slots.some((s) => s.startIso === new Date(MON).toISOString()));
  const overlapping = slotsFor({ now: MON - 3 * 86400000, hours: HOURS, tzOffsetMin: TZ, minutes: 60, busy: [intervalOf(new Date(MON + 30 * 60000).toISOString(), 60)], horizonDays: 10 });
  assert.ok(!overlapping.some((s) => s.startIso === new Date(MON).toISOString()), 'a 09:30 booking takes the 09:00 slot too');
});

t('no time is offered sooner than the lead time, and none on a closed day', () => {
  const justBefore = MON - 30 * 60000; // within the lead time
  const slots = slotsFor({ now: justBefore, hours: HOURS, tzOffsetMin: TZ, minutes: 60, horizonDays: 3 });
  assert.ok(!slots.some((s) => new Date(s.startIso).getTime() < justBefore + 60 * 60000));
  assert.ok(slots.every((s) => s.label.slice(0, 10) !== '2026-11-03'), 'Tuesday is closed');
});

t('a requested time is allowed only if it is on the grid, in hours, and free', () => {
  const now = MON - 3 * 86400000;
  assert.equal(isSlotAllowed({ startIso: new Date(MON).toISOString(), now, hours: HOURS, tzOffsetMin: TZ, minutes: 60 }), true);
  assert.equal(isSlotAllowed({ startIso: new Date(MON + 30 * 60000).toISOString(), now, hours: HOURS, tzOffsetMin: TZ, minutes: 60 }), false, 'off the grid');
  assert.equal(isSlotAllowed({ startIso: new Date(MON - 60 * 60000).toISOString(), now, hours: HOURS, tzOffsetMin: TZ, minutes: 60 }), false, 'before opening');
  assert.equal(isSlotAllowed({ startIso: new Date(MON).toISOString(), now, hours: HOURS, tzOffsetMin: TZ, minutes: 60, busy: [intervalOf(new Date(MON).toISOString(), 60)] }), false, 'taken');
});

t('a request needs a name, a valid email and a time; a filled honeypot is a bot and records nothing', () => {
  assert.deepEqual(sanitizeRequest({ honeypot: 'yes' }), { bot: true });
  assert.match(sanitizeRequest({ name: 'A', email: 'nope', startIso: new Date(MON).toISOString() }).error, /email/);
  assert.match(sanitizeRequest({ name: 'A', email: 'a@x.com', startIso: 'soon' }).error, /time/);
  assert.equal(sanitizeRequest({ name: 'Ann', email: 'A@X.com', startIso: new Date(MON).toISOString() }).request.email, 'a@x.com');
});

console.log(`booking: ${n} passed`);
