import assert from 'node:assert/strict';
import { signBookingToken, verifyBookingToken, customerMayChange, CHANGE_NOTICE_HOURS } from '../lib/server/booking-manage.js';
import { clashes, icsFor, intervalOf } from '../lib/booking.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const KEY = 'booking-test-key';
const NOW = Date.UTC(2026, 10, 2, 0, 0);
const H = 3600000;

t('a manage link works only for its own kind of thing, and only when it is genuine', () => {
  const tok = signBookingToken('manage', 'ownerUid0001', 'b1', KEY);
  assert.deepEqual(verifyBookingToken('manage', tok, KEY), { uid: 'ownerUid0001', id: 'b1' });
  assert.equal(verifyBookingToken('feed', tok, KEY), null, 'a manage link is not a calendar feed');
  assert.equal(verifyBookingToken('manage', tok, 'other'), null);
  assert.equal(verifyBookingToken('manage', `${tok}x`, KEY), null);
});

t('the customer may change a booking only with the notice period, and never once it is cancelled, declined or past', () => {
  const later = (hours) => ({ status: 'confirmed', startIso: new Date(NOW + hours * H).toISOString() });
  assert.equal(customerMayChange(later(CHANGE_NOTICE_HOURS + 1), NOW), true);
  assert.equal(customerMayChange(later(CHANGE_NOTICE_HOURS - 1), NOW), false);
  assert.equal(customerMayChange({ ...later(48), status: 'cancelled' }, NOW), false);
  assert.equal(customerMayChange({ ...later(48), status: 'no_show' }, NOW), false);
});

t('two bookings clash only if they overlap AND use the same staff member', () => {
  const a = { id: 'a', startIso: new Date(NOW).toISOString(), minutes: 60, staffId: 'owner' };
  const sameTime = { id: 'b', startIso: new Date(NOW + 30 * 60000).toISOString(), minutes: 60, status: 'confirmed', staffId: 'owner' };
  const otherStaff = { ...sameTime, id: 'c', staffId: 'uid-manager' };
  const cancelled = { ...sameTime, id: 'd', status: 'cancelled' };
  assert.equal(clashes(a, [sameTime]), true);
  assert.equal(clashes(a, [otherStaff]), false, 'a second staff member can take the same time');
  assert.equal(clashes(a, [cancelled]), false, 'a cancelled booking blocks nothing');
  assert.equal(clashes({ ...a, id: 'b' }, [sameTime]), false, 'a booking does not clash with itself');
});

t('the calendar feed lists only confirmed bookings, with escaped text and UTC times', () => {
  const ics = icsFor({ now: NOW, businessName: 'Studio, Ltd', bookings: [
    { id: 'ok', status: 'confirmed', startIso: new Date(NOW).toISOString(), minutes: 60, serviceName: 'Cut, colour', name: 'Ann;B', email: 'a@x.com' },
    { id: 'gone', status: 'cancelled', startIso: new Date(NOW).toISOString(), minutes: 60, serviceName: 'X', name: 'Y', email: 'y@x.com' },
  ] });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:ok@autoleads/);
  assert.doesNotMatch(ics, /gone@autoleads/);
  assert.match(ics, /SUMMARY:Cut\\, colour - Ann\\;B/);
  assert.match(ics, /DTSTART:20261102T000000Z/);
  assert.match(ics, /X-WR-CALNAME:Studio\\, Ltd/);
});

t('an interval is start and length in milliseconds', () => {
  const [s, e] = intervalOf(new Date(NOW).toISOString(), 45);
  assert.equal(e - s, 45 * 60000);
});

console.log(`booking-policy: ${n} passed`);
