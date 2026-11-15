// Pass 294: the owner's timezone (spec 10.9). The zone name is saved; daylight saving is read correctly; tasks and Today use it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isZone, offsetMinFor, effectiveOffsetMin, DEFAULT_OFFSET_MIN } from '../lib/timezone-rules.js';
import { sanitizeAutoSend } from '../lib/autosend.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const jan = Date.parse('2026-01-15T12:00:00Z');
const jul = Date.parse('2026-07-15T12:00:00Z');

t('only real zone names are accepted', () => {
  assert.equal(isZone('Asia/Colombo'), true);
  assert.equal(isZone('Europe/London'), true);
  assert.equal(isZone('Mars/Base'), false);
  assert.equal(isZone(''), false);
  assert.equal(isZone(undefined), false);
  assert.equal(isZone('x'.repeat(70)), false);
});

t('Colombo is +05:30 all year; New York changes with daylight saving', () => {
  assert.equal(offsetMinFor('Asia/Colombo', jan), 330);
  assert.equal(offsetMinFor('Asia/Colombo', jul), 330);
  assert.equal(offsetMinFor('America/New_York', jan), -300);
  assert.equal(offsetMinFor('America/New_York', jul), -240);
});

t('the zone wins over a stale stored offset; the stored offset is used only when no zone is set', () => {
  assert.equal(effectiveOffsetMin({ timezone: 'America/New_York', tzOffsetMin: 330 }, jul), -240);
  assert.equal(effectiveOffsetMin({ timezone: 'Not/AZone', tzOffsetMin: 60 }, jul), 60, 'an invalid zone is ignored');
  assert.equal(effectiveOffsetMin({ tzOffsetMin: 120 }, jul), 120);
  assert.equal(effectiveOffsetMin({}, jul), DEFAULT_OFFSET_MIN, 'nothing saved: Sri Lanka time');
});

t('the autopilot settings keep a valid zone and drop an invalid one', () => {
  assert.equal(sanitizeAutoSend({ timezone: 'Europe/London' }).timezone, 'Europe/London');
  assert.equal(sanitizeAutoSend({ timezone: 'bad zone!!' }).timezone, '');
});

t('every reader of the owner clock uses the zone-aware helper', () => {
  const readers = ['lib/server/daily-ops.js', 'lib/server/autosend.js', 'lib/server/availability.js', 'lib/autosend.js'];
  for (const f of readers) assert.ok(fs.readFileSync(f, 'utf8').includes('effectiveOffsetMin('), f);
  for (const f of ['lib/server/daily-ops.js', 'lib/server/autosend.js']) {
    assert.ok(!/localParts\(now, cfg\.tzOffsetMin\)/.test(fs.readFileSync(f, 'utf8')), `${f} still reads the stored offset directly`);
  }
  assert.ok(fs.readFileSync('app/api/tasks/route.js', 'utf8').includes('ownerOffsetMin(db, who.uid, now)'));
  assert.ok(fs.readFileSync('lib/server/today-actions.js', 'utf8').includes('ownerOffsetMin(db, uid, now)'));
});

t('the account save records the browser zone name next to the offset', () => {
  assert.ok(fs.readFileSync('app/account/page.js', 'utf8').includes('next.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone'));
});

console.log(`\n${n} passed`);
