// Copy checks (Pass 267): pressure, fear, over-promising, a message that never speaks to the reader, and length are flagged; a plain, honest message is not.
import assert from 'node:assert/strict';
import { copyChecks } from '../lib/copy-checks.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const ids = (s) => copyChecks(s).warnings.map((w) => w.id);

t('pressure, fear and promises you cannot prove are each flagged', () => {
  assert.ok(ids('Act now, last chance for you!').includes('pressure'));
  assert.ok(ids('You will regret it if you wait, you are losing money.').includes('fear'));
  assert.ok(ids('We are guaranteed results, risk-free, for you.').includes('overpromise'));
});

t('a plain, honest message that speaks to the reader is not flagged', () => {
  assert.deepEqual(copyChecks('Hi Ann, your booking page can save you two hours a week. Want a 15-minute walkthrough?').warnings, []);
});

t('a message that never says "you" is flagged, and so is a very long one', () => {
  assert.ok(ids('We build software for clinics and care about quality.').includes('reader'));
  assert.ok(ids(Array.from({ length: 130 }, () => 'word').join(' ') + ' you').includes('length'));
});

console.log(`\n${n} passed`);
