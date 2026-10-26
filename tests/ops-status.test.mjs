import test from 'node:test';
import assert from 'node:assert/strict';
import { opsStatus, STALE_HOURS } from '../lib/ops-status.js';

const HOUR = 3600000;
const NOW = Date.UTC(2026, 9, 20, 8);
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const find = (r, id) => r.items.find((i) => i.id === id);

test('nothing switched on means nothing is reported, and it counts as healthy', () => {
  const r = opsStatus({ autopilot: {}, connection: null, finder: null, now: NOW });
  assert.deepEqual(r.items, []);
  assert.equal(r.healthy, true);
});

test('a quiet night that ran is fine: the heartbeat, not a job that had work, proves it ran', () => {
  const r = opsStatus({ autopilot: { autoBilling: true, lastRunAt: ago(5) }, now: NOW });
  assert.equal(find(r, 'nightly').status, 'ok');
  assert.equal(r.healthy, true);
});

test('a nightly routine that has stopped is flagged, and so is one that never ran', () => {
  const stopped = opsStatus({ autopilot: { dailyBrief: true, lastRunAt: ago(STALE_HOURS + 10) }, now: NOW });
  assert.equal(find(stopped, 'nightly').status, 'warn');
  assert.match(find(stopped, 'nightly').detail, /hours ago/);
  const never = opsStatus({ autopilot: { dailyBrief: true }, now: NOW });
  assert.equal(find(never, 'nightly').status, 'warn');
  assert.equal(never.healthy, false);
});

test('an expired Gmail connection is a problem with a plain next step', () => {
  const r = opsStatus({ autopilot: {}, connection: { status: 'expired', lastError: 'Token revoked' }, now: NOW });
  assert.equal(find(r, 'gmail').status, 'problem');
  assert.equal(find(r, 'gmail').detail, 'Token revoked');
});

test('the reply check is judged only when it is switched on and Gmail is connected', () => {
  const stale = opsStatus({ autopilot: {}, connection: { status: 'ok', lastCheckAt: ago(STALE_HOURS + 2) }, now: NOW });
  assert.equal(find(stale, 'replies').status, 'warn');
  const off = opsStatus({ autopilot: { autoReplyCheck: false }, connection: { status: 'ok', lastCheckAt: ago(100) }, now: NOW });
  assert.equal(find(off, 'replies'), undefined);
  const fresh = opsStatus({ autopilot: {}, connection: { status: 'ok', lastCheckAt: ago(3) }, now: NOW });
  assert.equal(find(fresh, 'replies').status, 'ok');
});

test('a failing posting hook is a problem; a failing auto-find suggestion is a warning with the fix', () => {
  const posting = opsStatus({ autopilot: { autoPostError: 'HTTP 500' }, now: NOW });
  assert.equal(find(posting, 'posting').status, 'problem');
  const finder = opsStatus({ finder: { enabled: true, autoFind: true, area: 'Colombo', autoNote: 'The AI could not suggest searches just now.' }, now: NOW });
  assert.equal(find(finder, 'finder').status, 'warn');
  assert.match(find(finder, 'finder').action, /Describe what you sell/);
  const noArea = opsStatus({ finder: { enabled: true, autoFind: true, area: '' }, now: NOW });
  assert.match(find(noArea, 'finder').detail, /Set your area/);
});
