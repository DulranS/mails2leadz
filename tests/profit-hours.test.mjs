// The profit view counts the hours actually logged on the time log before a typed per-customer figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProfit } from '../lib/profit.js';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const won = (email, value, cost, daysAgo = 10, extra = {}) => ({ email, stage: 'closed_won', value, valueIsEstimate: false, deliveryCost: cost, closedAt: day(daysAgo), lastUpdate: day(daysAgo), ...extra });

test('logged hours win over the typed figure', () => {
  const deals = [won('a@x.com', 1000, 100, 10, { hoursSpent: 5 }), won('b@x.com', 1000, 100, 11, { hoursSpent: 5 })];
  const p = computeProfit({ deals, loggedHoursByEmail: { 'a@x.com': 2, 'b@x.com': 3 }, now: NOW });
  assert.equal(p.time.hours, 5);
});

test('the typed figure is used when nothing is logged for that customer', () => {
  const deals = [won('a@x.com', 1000, 100, 10, { hoursSpent: 4 })];
  const p = computeProfit({ deals, loggedHoursByEmail: {}, now: NOW });
  assert.equal(p.time.hours, 4);
});
