// Market share (lib/market-share.js) and the twelve-month won revenue it uses (lib/business-metrics.js). Pure. Run: node --test tests/market-share.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { marketShare, sanitizeMarketSize } from '../lib/market-share.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 22);

test('a market size is a positive number or none', () => {
  assert.equal(sanitizeMarketSize('250000'), 250000);
  assert.equal(sanitizeMarketSize(''), 0, 'blank is none');
  assert.equal(sanitizeMarketSize('-5'), 0);
  assert.equal(sanitizeMarketSize('abc'), 0);
  assert.equal(sanitizeMarketSize(undefined), 0);
});

test('share is revenue over the market you typed, to two decimal places of a percent', () => {
  assert.deepEqual(marketShare({ ownRevenue: 25000, marketSize: 1000000 }), { sharePct: 2.5, reason: 'ok' });
  assert.deepEqual(marketShare({ ownRevenue: 1, marketSize: 3 }), { sharePct: 33.33, reason: 'ok' });
  assert.deepEqual(marketShare({ ownRevenue: 0, marketSize: 500 }), { sharePct: 0, reason: 'ok' }, 'no wins is a zero share, not blank');
});

test('no market size, or no revenue figure, gives no share and says why', () => {
  assert.deepEqual(marketShare({ ownRevenue: 100, marketSize: 0 }), { sharePct: null, reason: 'no_market' });
  assert.deepEqual(marketShare({ ownRevenue: 100, marketSize: undefined }), { sharePct: null, reason: 'no_market' });
  assert.deepEqual(marketShare({ ownRevenue: undefined, marketSize: 1000 }), { sharePct: null, reason: 'no_revenue' });
  assert.deepEqual(marketShare({ ownRevenue: -10, marketSize: 1000 }), { sharePct: null, reason: 'no_revenue' });
});

test('revenue above the market you typed is flagged, not shown as a share', () => {
  const r = marketShare({ ownRevenue: 1500, marketSize: 1000 });
  assert.equal(r.reason, 'over_market');
  assert.equal(r.sharePct, 150);
});

test('the twelve-month figure counts wins from the last 365 days only', () => {
  const deals = [
    { id: 'a', email: 'a@x.com', stage: 'closed_won', value: 1000, closedAt: new Date(NOW - 30 * DAY).toISOString() },
    { id: 'b', email: 'b@x.com', stage: 'closed_won', value: 2000, closedAt: new Date(NOW - 200 * DAY).toISOString() },
    { id: 'c', email: 'c@x.com', stage: 'closed_won', value: 9000, closedAt: new Date(NOW - 400 * DAY).toISOString() }, // older than a year
    { id: 'd', email: 'd@x.com', stage: 'proposal', value: 5000 }, // open, not won
  ];
  const m = computeBusinessMetrics({ deals, now: NOW });
  assert.equal(m.past.wonRevenue12m, 3000, 'wins from the last 365 days only');
  assert.equal(m.past.wonRevenue, 12000, 'all-time won revenue is unchanged');
});

test('the market share card is on the Business page and reads the typed size from settings', () => {
  const src = readFileSync(new URL('../app/business/page.js', import.meta.url), 'utf8');
  assert.ok(src.includes('marketShare({ ownRevenue: m.past.wonRevenue12m, marketSize: raw.settings?.marketSize })'));
  assert.ok(src.includes('Market share (last 12 months)'));
});

test('the account page saves the market size with the other settings', () => {
  const src = readFileSync(new URL('../app/account/page.js', import.meta.url), 'utf8');
  assert.ok(src.includes('marketSize: Math.max(0, Math.min(1e12, Number(marketSize) || 0)),'));
  assert.ok(src.includes('if (d.marketSize) setMarketSize(String(d.marketSize));'));
});
