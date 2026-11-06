// KPI scorecard (Pass 173): the month's sales and marketing numbers, computed from the owner's own records.
import assert from 'node:assert/strict';
import { kpiScorecard, scorecardText } from '../lib/kpi-scorecard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const leads = [{ receivedAt: '2026-10-03T10:00:00Z' }, { receivedAt: '2026-10-20T10:00:00Z' }, { receivedAt: '2026-09-30T10:00:00Z' }, { receivedAt: '2026-11-01T10:00:00Z' }];
const deals = [
  { stage: 'closed_won', value: 1000, createdAt: '2026-09-01T00:00:00Z', stageTimes: { closed_won: '2026-10-11T00:00:00Z' } },
  { stage: 'closed_won', value: 500, createdAt: '2026-10-01T00:00:00Z', stageTimes: { closed_won: '2026-10-21T00:00:00Z' } },
  { stage: 'closed_lost', value: 300, createdAt: '2026-10-05T00:00:00Z', lostAt: '2026-10-09T00:00:00Z' },
  { stage: 'qualified', value: 200, createdAt: '2026-10-15T00:00:00Z' },
];

t('the month\'s leads, deals, wins, losses, win rate, cycle length and average value are counted from the records', () => {
  const k = kpiScorecard({ leads, deals, year: 2026, month: 10 });
  assert.equal(k.newLeads, 2);
  assert.equal(k.dealsOpened, 3);
  assert.equal(k.leadToDealPct, 150);
  assert.equal(k.won, 2);
  assert.equal(k.lost, 1);
  assert.equal(k.winRatePct, 66.7);
  assert.equal(k.avgWonValue, 750);
  assert.equal(k.wonValue, 1500);
  assert.equal(k.avgCycleDays, 30); // one win took 40 days, the other 20
});

t('a month with nothing shows n/a rather than a misleading zero', () => {
  const k = kpiScorecard({ leads: [], deals: [], year: 2025, month: 1 });
  assert.equal(k.leadToDealPct, null);
  assert.equal(k.winRatePct, null);
  assert.match(scorecardText(k)[2], /n\/a/);
});

console.log(`\n${n} passed`);
