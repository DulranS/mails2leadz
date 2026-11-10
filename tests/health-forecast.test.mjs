// Health and forecast (Pass 213): deals at risk are named with the reason; customers at risk are named; the quarter forecast uses your own stage probabilities.
import assert from 'node:assert/strict';
import { dealHealth, customerHealth, quarterForecast } from '../lib/health.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('a deal is healthy with a value and a next step, and at risk when it has sat idle with neither', () => {
  assert.equal(dealHealth({ stage: 'proposal', value: 900, nextStep: 'Call Tues', updatedAt: new Date(now - 2 * DAY).toISOString() }, now).status, 'healthy');
  const bad = dealHealth({ stage: 'proposal', updatedAt: new Date(now - 20 * DAY).toISOString() }, now);
  assert.equal(bad.status, 'at_risk');
  assert.ok(bad.risks.includes('no movement for 20 days'));
  assert.equal(dealHealth({ stage: 'closed_won' }, now), null);
});

t('a customer is at risk with the reasons named: no purchase, an open complaint, a low score', () => {
  assert.equal(customerHealth({ lastPurchaseAt: new Date(now - 30 * DAY).toISOString(), now }).status, 'healthy');
  const c = customerHealth({ lastPurchaseAt: new Date(now - 200 * DAY).toISOString(), openComplaints: 1, lastScore: 3, now });
  assert.equal(c.status, 'at_risk');
  assert.ok(c.risks.some((r) => /low satisfaction/.test(r)));
});

t('the quarter forecast adds the wins so far to open deals weighted by stage, and compares with three months of target', () => {
  const deals = [
    { stage: 'closed_won', value: 1000, stageTimes: { closed_won: new Date(now - 5 * DAY).toISOString() } },
    { stage: 'proposal', value: 2000 },
    { stage: 'closed_lost', value: 500 },
  ];
  const f = quarterForecast({ deals, monthlyTarget: 1000, now, probabilities: { proposal: 50 } });
  assert.equal(f.wonThisQuarter, 1000);
  assert.equal(f.weightedOpen, 1000);
  assert.equal(f.expected, 2000);
  assert.equal(f.target, 3000);
  assert.equal(f.pctOfTarget, 67);
});

console.log(`\n${n} passed`);
