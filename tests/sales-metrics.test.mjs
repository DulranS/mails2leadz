// Sales metrics (Pass 157): quota attainment, pipeline velocity and customer lifetime value.
import assert from 'node:assert/strict';
import { quotaLines, quotaText, pipelineVelocityDays, lifetimeValueByEmail } from '../lib/sales-metrics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-03T10:00:00Z');

t('quota attainment compares each salesperson\'s won value for the month with their target', () => {
  const deals = [
    { stage: 'closed_won', value: 600, ownerId: 'm1', stageTimes: { closed_won: '2026-10-05T09:00:00Z' } },
    { stage: 'closed_won', value: 500, ownerId: 'm1', stageTimes: { closed_won: '2026-10-25T09:00:00Z' } },
    { stage: 'closed_won', value: 900, ownerId: 'm1', stageTimes: { closed_won: '2026-11-02T09:00:00Z' } },
  ];
  const lines = quotaLines({ deals, members: [{ id: 'm1', name: 'Ann', quota: 1000 }, { id: 'm2', name: 'Bob' }], year: 2026, month: 10 });
  assert.deepEqual(lines, [{ name: 'Ann', won: 1100, quota: 1000, pct: 110 }]);
  assert.match(quotaText(lines)[0], /Ann: 1100\.00 won of a 1000\.00 target \(110%\)/);
});

t('pipeline velocity is the average days from creation to a win, over the last year', () => {
  const deals = [
    { stage: 'closed_won', createdAt: '2026-10-01T00:00:00Z', stageTimes: { closed_won: '2026-10-11T00:00:00Z' } },
    { stage: 'closed_won', createdAt: '2026-10-01T00:00:00Z', stageTimes: { closed_won: '2026-10-21T00:00:00Z' } },
    { stage: 'closed_won', createdAt: '2024-01-01T00:00:00Z', stageTimes: { closed_won: '2024-01-11T00:00:00Z' } }, // older than a year
    { stage: 'closed_lost', createdAt: '2026-10-01T00:00:00Z', lostAt: '2026-10-05T00:00:00Z' },
  ];
  assert.equal(pipelineVelocityDays(deals, now), 15);
  assert.equal(pipelineVelocityDays([], now), null);
});

t('lifetime value is the paid total per customer, voided invoices excluded', () => {
  const invoices = [
    { email: 'Ann@x.com', amountPaid: 100, status: 'paid' },
    { email: 'ann@x.com', amountPaid: 50, status: 'part_paid' },
    { email: 'ann@x.com', total: 999, status: 'void' },
    { email: 'bob@x.com', status: 'open', total: 300 },
  ];
  assert.deepEqual(lifetimeValueByEmail(invoices), { 'ann@x.com': 150 });
});

console.log(`\n${n} passed`);
