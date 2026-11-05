// Quote follow-up (Pass 167): a quote viewed but not answered is flagged once it has been quiet for three days.
import assert from 'node:assert/strict';
import { viewedNoAnswer } from '../lib/quote-followup.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-03T10:00:00Z');
const ago = (d) => new Date(now - d * 86400000).toISOString();

t('a viewed quote with no answer, quiet for three days, is flagged', () => {
  const r = viewedNoAnswer([{ id: 'q1', customerEmail: 'Ann@x.com', title: 'Website', status: 'sent', viewCount: 2, lastViewedAt: ago(4) }], now);
  assert.deepEqual(r, [{ id: 'q1', email: 'ann@x.com', title: 'Website', viewCount: 2, daysSince: 4 }]);
});

t('never-viewed, recently viewed, answered, expired and withdrawn quotes are not flagged', () => {
  const quotes = [
    { id: 'a', status: 'sent', viewCount: 0, lastViewedAt: null },
    { id: 'b', status: 'sent', viewCount: 1, lastViewedAt: ago(1) },
    { id: 'c', status: 'accepted', viewCount: 3, lastViewedAt: ago(9) },
    { id: 'd', status: 'sent', viewCount: 1, lastViewedAt: ago(9), validUntil: '2026-10-01' },
    { id: 'e', status: 'withdrawn', viewCount: 1, lastViewedAt: ago(9) },
  ];
  assert.deepEqual(viewedNoAnswer(quotes, now), []);
});

console.log(`\n${n} passed`);
