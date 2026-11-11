// Number format (Pass 222): thousands grouped with commas; cents only when present; no broken numbers.
import assert from 'node:assert/strict';
import { groupNumber } from '../lib/format.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('large amounts are grouped with commas, as the owner reads them', () => {
  assert.equal(groupNumber(500000), '500,000');
  assert.equal(groupNumber(5000000), '5,000,000');
  assert.equal(groupNumber('1500'), '1,500');
  assert.equal(groupNumber(-1000), '-1,000');
});

t('decimals stay only when there are some, and show at most two', () => {
  assert.equal(groupNumber(1234.5), '1,234.5');
  assert.equal(groupNumber(1234.567), '1,234.57');
  assert.equal(groupNumber(12), '12');
});

t('a missing or non-numeric value shows n/a, never a broken number', () => {
  assert.equal(groupNumber(null), 'n/a');
  assert.equal(groupNumber(undefined), 'n/a');
  assert.equal(groupNumber(''), 'n/a');
  assert.equal(groupNumber('abc'), 'n/a');
});

console.log(`\n${n} passed`);
