import assert from 'node:assert/strict';
import { headerSafe, clip, pickOriginal, daysSince, dealBlocksContact } from '../lib/server/route-helpers.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const doc = (data) => ({ data: () => data });

t('headerSafe removes anything that could start a new email header', () => {
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const evil = `Hello\r\nBcc: attacker@example.com\nX: y${LS}Z${PS}`;
  const out = headerSafe(evil);
  assert.equal(/[\r\n]/.test(out) || out.includes(LS) || out.includes(PS), false);
  assert.equal(out, 'Hello Bcc: attacker@example.com X: y Z');
});
t('clip strips control characters and caps length', () => {
  assert.equal(clip('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(7) + 'c', 10), 'a b c');
  assert.equal(clip('x'.repeat(50), 10).length, 10);
  assert.equal(clip(null), '');
});
t('pickOriginal prefers the row carrying the follow-up counter, else the earliest send', () => {
  const early = doc({ sentAt: '2026-01-01T00:00:00Z', followUpCount: 0 });
  const late = doc({ sentAt: '2026-02-01T00:00:00Z', followUpCount: 0 });
  assert.equal(pickOriginal([late, early]).doc, early);
  const counted = doc({ sentAt: '2026-02-01T00:00:00Z', followUpCount: 2 });
  assert.equal(pickOriginal([early, counted]).doc, counted);
  assert.equal(pickOriginal([early, counted]).count, 2);
});
t('daysSince handles ISO strings, junk and missing values', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  assert.equal(daysSince('2026-10-07T00:00:00Z', now), 3);
  assert.equal(daysSince('nonsense', now), null);
  assert.equal(daysSince(null, now), null);
});

t('a Lost deal blocks contact; open, won or missing deals do not', () => {
  assert.equal(dealBlocksContact({ stage: 'closed_lost' }), true);
  assert.equal(dealBlocksContact({ stage: 'lost' }), true);
  assert.equal(dealBlocksContact({ stage: 'qualified' }), false);
  assert.equal(dealBlocksContact({ stage: 'closed_won' }), false);
  assert.equal(dealBlocksContact(null), false);
});
console.log(`\n${n} passed`);
