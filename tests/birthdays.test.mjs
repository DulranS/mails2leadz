// Birthdays (Pass 269): only people who agreed to marketing are listed on their day.
import assert from 'node:assert/strict';
import { parseBirthdays, birthdaysDueToday } from '../lib/birthdays.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const now = Date.parse('2026-11-14T10:00:00Z');

t('birthdays are read as email and MM-DD; bad lines are skipped and counted', () => {
  const r = parseBirthdays('Ann@x.com | 11-14\nbad line\nBo@x.com | 2026-11-14');
  assert.deepEqual(r.map, { 'ann@x.com': '11-14' });
  assert.equal(r.skipped, 2);
});

t('a birthday is listed only on the day, and only for people who agreed to marketing', () => {
  const map = { 'ann@x.com': '11-14', 'bo@x.com': '11-14', 'cy@x.com': '12-01' };
  assert.deepEqual(birthdaysDueToday(map, now, new Set(['ann@x.com', 'cy@x.com'])), ['ann@x.com']);
});

console.log(`\n${n} passed`);
