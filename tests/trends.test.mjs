import assert from 'node:assert/strict';
import { linearTrend } from '../lib/trends.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a rising series is "up", and its next value continues the line', () => {
  const tr = linearTrend([100, 200, 300, 400]);
  assert.equal(tr.direction, 'up');
  assert.equal(tr.slope, 100);
  assert.equal(tr.next, 500);
});

t('a falling series is "down", never below zero', () => {
  const tr = linearTrend([300, 200, 100]);
  assert.equal(tr.direction, 'down');
  assert.equal(tr.next, 0);
});

t('a flat series is "flat"; fewer than three months gives no trend at all', () => {
  assert.equal(linearTrend([500, 500, 501, 499]).direction, 'flat');
  assert.equal(linearTrend([100, 200]), null);
  assert.equal(linearTrend([]), null);
});

console.log(`trends: ${n} passed`);
