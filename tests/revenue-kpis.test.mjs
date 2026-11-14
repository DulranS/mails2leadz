// Revenue KPIs (Pass 279): payback, pipeline coverage, net revenue retention and discount approval come from the figures given; a missing figure is null, not a guess.
import assert from 'node:assert/strict';
import { paybackMonths, pipelineCoverage, netRevenueRetention, approvalNeeded } from '../lib/revenue-kpis.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const DAY = 86400000, now = Date.parse('2026-11-14T12:00:00Z');

t('payback is how many months of gross margin repay the cost of winning a customer; a missing margin gives no figure', () => {
  assert.equal(paybackMonths(600, 100, 50), 12);
  assert.equal(paybackMonths(600, 100, null), null);
  assert.equal(paybackMonths(0, 100, 50), null);
});

t('pipeline coverage is open pipeline over what is still needed; no target gives no figure', () => {
  assert.equal(pipelineCoverage(3000, 1000), 3);
  assert.equal(pipelineCoverage(3000, null), null);
});

t('net revenue retention compares what earlier customers paid last year with the year before', () => {
  const inv = [
    { email: 'a@x.com', status: 'paid', amountPaid: 1000, paidAt: new Date(now - 400 * DAY).toISOString() },
    { email: 'a@x.com', status: 'paid', amountPaid: 1200, paidAt: new Date(now - 100 * DAY).toISOString() },
    { email: 'b@x.com', status: 'paid', amountPaid: 1000, paidAt: new Date(now - 400 * DAY).toISOString() },
  ];
  assert.equal(netRevenueRetention(inv, now), 60);
  assert.equal(netRevenueRetention([], now), null);
});

t('a discount above your limit needs approval; at or below it does not', () => {
  assert.equal(approvalNeeded(20, 15), true);
  assert.equal(approvalNeeded(15, 15), false);
  assert.equal(approvalNeeded(20, null), false);
});

console.log(`\n${n} passed`);
