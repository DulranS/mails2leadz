import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProfit, forecastProfit } from '../lib/profit.js';
import { buildDealWrite } from '../lib/deal-utils.js';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const won = (email, value, cost, daysAgo = 10, extra = {}) => ({ email, stage: 'closed_won', value, valueIsEstimate: false, deliveryCost: cost, closedAt: day(daysAgo), lastUpdate: day(daysAgo), ...extra });

test('nothing won: not ready, says so', () => {
  const p = computeProfit({ deals: [], now: NOW });
  assert.equal(p.ready, false);
  assert.equal(p.netProfit90, 0 - 0);
  assert.ok(p.notes.some((n) => /No deal was won/.test(n)));
});

test('gross profit, margin and net profit from entered numbers', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 400), won('b@x.com', 500, 100)], settings: { monthlyCost: 50, monthlyOverhead: 150 }, now: NOW });
  assert.equal(p.revenue, 1500);
  assert.equal(p.deliveryCosts, 500);
  assert.equal(p.grossProfit, 1000);
  assert.equal(p.marginPct, 67);
  assert.equal(p.operating90, 600); // (50+150) x 3
  assert.equal(p.netProfit90, 400);
  assert.equal(p.netMonthly, 133);
  assert.equal(p.complete, true);
  assert.equal(p.breakEvenMonthly, Math.round(200 / 0.67));
});

test('AI cost is converted with the owner exchange rate', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 0)], settings: { usdRate: 300 }, aiCostUsd: 2, now: NOW });
  assert.equal(p.aiCost90, 600);
  assert.equal(p.netProfit90, 400);
});

test('wins without a cost are flagged, margin uses costed wins only, never silently 100%', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 500), won('b@x.com', 1000, null)], now: NOW });
  assert.equal(p.costedWins, 1);
  assert.equal(p.coverage, 50);
  assert.equal(p.complete, false);
  assert.equal(p.marginPct, 50);
  assert.ok(p.notes.some((n) => /no delivery cost entered/.test(n)));
});

test('zero cost is a real answer, missing cost is not', () => {
  const zero = computeProfit({ deals: [won('a@x.com', 800, 0)], now: NOW });
  assert.equal(zero.costedWins, 1);
  assert.equal(zero.marginPct, 100);
  const missing = computeProfit({ deals: [{ ...won('a@x.com', 800, 0), deliveryCost: undefined }], now: NOW });
  assert.equal(missing.costedWins, 0);
  assert.equal(missing.marginPct, null);
});

test('only the last 90 days, one deal per email, lost deals ignored', () => {
  const p = computeProfit({ deals: [won('old@x.com', 9999, 0, 120), won('a@x.com', 100, 10), { ...won('a@x.com', 300, 30), lastUpdate: day(1) }, { email: 'l@x.com', stage: 'closed_lost', value: 5000 }], now: NOW });
  assert.equal(p.wins, 1);
  assert.equal(p.revenue, 300);
});

test('a deal that cost more than it earned is listed as a loss', () => {
  const p = computeProfit({ deals: [won('a@x.com', 200, 350), won('b@x.com', 900, 100)], now: NOW });
  assert.equal(p.losers.length, 1);
  assert.equal(p.losers[0].loss, 150);
});

test('estimated deal value is flagged', () => {
  const p = computeProfit({ deals: [{ email: 'a@x.com', stage: 'closed_won', value: 0, deliveryCost: 100, closedAt: day(5) }], settings: { avgDealValue: 700 }, now: NOW });
  assert.equal(p.revenue, 700);
  assert.ok(p.notes.some((n) => /estimate/.test(n)));
});

test('forecast uses the seen margin and scales running costs; withheld without a margin', () => {
  const p = computeProfit({ deals: [won('a@x.com', 1000, 500)], settings: { monthlyOverhead: 100 }, now: NOW });
  const f = forecastProfit({ profit: p, expectedRevenue: 2000, days: 30 });
  assert.deepEqual([f.gross, f.running, f.net], [1000, 100, 900]);
  assert.equal(forecastProfit({ profit: computeProfit({ deals: [], now: NOW }), expectedRevenue: 2000 }), null);
});

test('deliveryCost is validated on the deal write', () => {
  const base = { uid: 'u', email: 'a@x.com', stage: 'closed_won' };
  assert.equal(buildDealWrite({ ...base, deliveryCost: '125.456' }).deliveryCost, 125.46);
  assert.equal(buildDealWrite({ ...base, deliveryCost: 0 }).deliveryCost, 0);
  assert.equal(buildDealWrite({ ...base, deliveryCost: '' }).deliveryCost, null);
  assert.equal(buildDealWrite({ ...base, deliveryCost: -5 }).deliveryCost, null);
  assert.equal(buildDealWrite({ ...base, deliveryCost: 'abc' }).deliveryCost, null);
  assert.equal('deliveryCost' in buildDealWrite(base), false);
});
