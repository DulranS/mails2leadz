// Commissions (Pass 155): per salesperson on deals won in the month; unassigned is shown; no rate means nothing.
import assert from 'node:assert/strict';
import { commissionLines, commissionText } from '../lib/commissions.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const members = [{ id: 'm1', name: 'Ann' }, { id: 'm2', name: 'Bob' }];
const deals = [
  { stage: 'closed_won', value: 1000, ownerId: 'm1', stageTimes: { closed_won: '2026-10-05T09:00:00Z' } },
  { stage: 'closed_won', value: 500, ownerId: 'm2', stageTimes: { closed_won: '2026-10-20T09:00:00Z' } },
  { stage: 'closed_won', value: 300, stageTimes: { closed_won: '2026-10-22T09:00:00Z' } },
  { stage: 'closed_won', value: 900, ownerId: 'm1', stageTimes: { closed_won: '2026-11-01T09:00:00Z' } }, // November: not October
  { stage: 'closed_lost', value: 700, ownerId: 'm1', lostAt: '2026-10-09T09:00:00Z' },
];

t('commission is the percentage of value won in the month, per salesperson', () => {
  const lines = commissionLines({ deals, members, pct: 10, year: 2026, month: 10 });
  assert.deepEqual(lines.map((l) => [l.name, l.wonCount, l.wonValue, l.commission]), [['Ann', 1, 1000, 100], ['Bob', 1, 500, 50], ['Unassigned', 1, 300, 30]]);
});

t('no rate, or no wins, means no commission lines', () => {
  assert.deepEqual(commissionLines({ deals, members, pct: 0, year: 2026, month: 10 }), []);
  assert.deepEqual(commissionLines({ deals, members, pct: 10, year: 2026, month: 9 }), []);
});

t('the digest text names each person with their wins and commission', () => {
  const lines = commissionLines({ deals, members, pct: 10, year: 2026, month: 10 });
  const text = commissionText(lines, 10);
  assert.match(text[0], /- Ann: 1 won, 1000\.00 in value, commission 100\.00 at 10%/);
});

console.log(`\n${n} passed`);
