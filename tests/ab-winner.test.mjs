// A/B winner (Pass 166): picked only with enough sends and a clear difference in reply rate.
import assert from 'node:assert/strict';
import { abStats, pickWinner, AB_MIN_SENDS } from '../lib/ab-winner.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const rows = (tpl, sent, replied) => Array.from({ length: sent }, (_, i) => ({ template: tpl, abTest: true, replied: i < replied }));

t('only real test sends are counted, per version', () => {
  const s = abStats([...rows('A', 3, 1), ...rows('B', 2, 2), { template: 'B', abTest: false, replied: true }]);
  assert.deepEqual(s, { A: { sent: 3, replied: 1 }, B: { sent: 2, replied: 2 } });
});

t('no winner until each version has the minimum sends', () => {
  const w = pickWinner(abStats([...rows('A', 50, 5), ...rows('B', 50, 25)]));
  assert.equal(w.winner, null);
  assert.match(w.reason, new RegExp(`at least ${AB_MIN_SENDS}`));
});

t('a clear difference in reply rate picks the better version, with the rates as the reason', () => {
  const w = pickWinner(abStats([...rows('A', 200, 10), ...rows('B', 200, 40)]));
  assert.equal(w.winner, 'B');
  assert.match(w.reason, /5\.0% for A and 20\.0% for B/);
});

t('a small difference is not called a winner', () => {
  const w = pickWinner(abStats([...rows('A', 200, 20), ...rows('B', 200, 22)]));
  assert.equal(w.winner, null);
});

console.log(`\n${n} passed`);
