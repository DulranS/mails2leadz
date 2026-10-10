import assert from 'node:assert/strict';
import { startOfTodayIso, startOfTomorrowIso, toMillis } from '../lib/server/daily-count.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('day boundaries are ISO strings (the format every sentAt is stored in), 24h apart', () => {
  const now = new Date(2026, 9, 10, 15, 30);
  const a = startOfTodayIso(now), b = startOfTomorrowIso(now);
  assert.match(a, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(new Date(b) - new Date(a) >= 23 * 3600e3 && new Date(b) - new Date(a) <= 25 * 3600e3);
});
t('a send made earlier today sorts at or after the start of today as a STRING compare (what Firestore does)', () => {
  const now = new Date(2026, 9, 10, 15, 30);
  const sentAt = new Date(2026, 9, 10, 9, 0).toISOString();
  const yesterday = new Date(2026, 9, 9, 23, 59).toISOString();
  assert.ok(sentAt >= startOfTodayIso(now));
  assert.ok(!(yesterday >= startOfTodayIso(now)));
});
t('toMillis understands every stored shape and rejects junk', () => {
  const d = new Date('2026-10-10T10:00:00Z');
  assert.equal(toMillis(d.toISOString()), d.getTime());
  assert.equal(toMillis(d), d.getTime());
  assert.equal(toMillis({ toDate: () => d }), d.getTime());
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('not a date'), null);
});
console.log(`\n${n} passed`);
