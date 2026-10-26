import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProfit } from '../lib/profit.js';
import { computeCashCycle } from '../lib/cash-cycle.js';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const won = (email, value, cost, daysAgo = 10) => ({ email, stage: 'closed_won', value, valueIsEstimate: false, deliveryCost: cost, closedAt: day(daysAgo), lastUpdate: day(daysAgo) });

test('contribution margin: revenue less delivery, partner commission and AI, as a share of revenue', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 300), won('b@x.com', 1000, 300)], partnerPayouts90: 200, aiCostUsd: 0, now: NOW });
  assert.equal(p.complete, true);
  assert.equal(p.contributionPct, 60); // (2000 - 600 - 200) / 2000
  assert.equal(p.marginPct, 70);       // gross margin unchanged: (2000 - 600) / 2000
});

test('contribution margin is withheld while any win lacks a delivery cost, like gross margin', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 300), won('b@x.com', 1000, null)], partnerPayouts90: 200, now: NOW });
  assert.equal(p.complete, false);
  assert.equal(p.contributionPct, null);
});

test('cash cycle adds days to get paid and days stock sits', () => {
  const c = computeCashCycle({ avgDaysToPay: 21, avgDaysToSell: 40 });
  assert.deepEqual([c.days, c.dso, c.dio, c.stock], [61, 21, 40, true]);
});

test('a service business with no stock is measured on days to get paid alone', () => {
  const c = computeCashCycle({ avgDaysToPay: 18, avgDaysToSell: null });
  assert.deepEqual([c.days, c.stock], [18, false]);
});

test('no paid invoice yet means no cash cycle, not a guess', () => {
  assert.equal(computeCashCycle({ avgDaysToPay: null, avgDaysToSell: 30 }).days, null);
});
