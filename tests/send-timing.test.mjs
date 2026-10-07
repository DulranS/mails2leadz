import assert from 'node:assert/strict';
import { computeSendTiming, MIN_TOTAL_SENT } from '../lib/send-timing.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
// local-time Date (Tuesday 2025-01-07, 10:00 local)
const at = (day, hour) => new Date(2025, 0, 5 + day, hour, 0, 0).toISOString();

t('not enough data: says so instead of guessing', () => {
  const r = computeSendTiming(Array.from({ length: 10 }, () => ({ sentAt: at(2, 10), replied: true })));
  assert.equal(r.enough, false);
  assert.equal(r.needed, MIN_TOTAL_SENT);
  assert.equal(r.best, undefined);
});
t('finds the window with the best reply RATE (counting every email sent, not only replies)', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ sentAt: at(2, 10), replied: i < 4 }); // Tue 9-12: 4/10
  for (let i = 0; i < 20; i++) rows.push({ sentAt: at(4, 15), replied: i < 2 }); // Thu 15-18: 2/20
  const r = computeSendTiming(rows);
  assert.equal(r.enough, true);
  assert.equal(r.best.day, 'Tuesday');
  assert.equal(r.best.sent, 10);
  assert.equal(r.best.replies, 4);
  assert.equal(Math.round(r.best.rate * 100), 40);
  assert.equal(Math.round(r.overallRate * 100), 20);
  assert.equal(r.liftPct, 100);
});
t('a window with only 1-2 sends is never crowned best', () => {
  const rows = Array.from({ length: 30 }, () => ({ sentAt: at(1, 9), replied: false }));
  rows.push({ sentAt: at(3, 14), replied: true }, { sentAt: at(3, 14), replied: true });
  assert.equal(computeSendTiming(rows).best, undefined);
});
t('ignores rows with no usable date', () => {
  assert.equal(computeSendTiming([{ sentAt: null }, { sentAt: 'nope' }]).sample, 0);
});
console.log(`\n${n} passed`);
