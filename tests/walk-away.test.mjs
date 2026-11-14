// Room to refuse (Pass 241): a sale below the minimum you set is flagged; with no minimum, nothing is flagged.
import assert from 'node:assert/strict';
import { belowFloor } from '../lib/pricing.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('a sale that keeps less than your minimum is flagged; one that keeps more is not', () => {
  assert.equal(belowFloor(20, 30), true);
  assert.equal(belowFloor(40, 30), false);
});

t('with no minimum set, or no contribution known, nothing is flagged', () => {
  assert.equal(belowFloor(10, ''), false);
  assert.equal(belowFloor(10, null), false);
  assert.equal(belowFloor(undefined, 30), false);
});

console.log(`\n${n} passed`);
