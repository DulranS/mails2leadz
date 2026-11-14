// Open-day rules (Pass 266): work runs once per owner per day, and once for everyone per day; a second open the same day changes nothing.
import assert from 'node:assert/strict';
import { ownerJobsDue, sharedJobsDue, dayKey } from '../lib/open-day.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const now = Date.parse('2026-11-14T08:00:00Z');

t('an owner\'s work is due on the first open of the day, and not again that day', () => {
  assert.equal(ownerJobsDue('', now), true);
  assert.equal(ownerJobsDue('2026-11-13', now), true);
  assert.equal(ownerJobsDue(dayKey(now), now), false);
});

t('shared work is due once for everyone per day', () => {
  assert.equal(sharedJobsDue('', now), true);
  assert.equal(sharedJobsDue(dayKey(now), now), false);
});

console.log(`\n${n} passed`);
