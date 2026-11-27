// v400: ad metrics on the marketing spend (lib/marketing.js): impressions, clicks and reach per entry, and CPM, CPC, CTR,
// ad frequency and cost per acquisition. Pure. Run: node --test tests/ad-metrics-v400.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMarketing, sanitizeSpend } from '../lib/marketing.js';

const now = Date.parse('2026-11-25T12:00:00Z');
const won = (value = 100) => ({ stage: 'closed_won', source: 'inbound', closedAt: '2026-11-10T00:00:00Z', value });

test('a spend entry can record impressions, clicks and reach', () => {
  const r = sanitizeSpend({ channel: 'paid_ads', amount: '300', month: '2026-11', impressions: '60000', clicks: '600', reach: '20000' });
  assert.equal(r.entry.impressions, 60000);
  assert.equal(r.entry.clicks, 600);
  assert.equal(r.entry.reach, 20000);
});

test('blank ad fields are not recorded at all, not stored as zero', () => {
  const r = sanitizeSpend({ channel: 'paid_ads', amount: '300', month: '2026-11', impressions: '', clicks: '', reach: '' });
  assert.equal('impressions' in r.entry, false);
  assert.equal('clicks' in r.entry, false);
  assert.equal('reach' in r.entry, false);
});

test('clicks cannot be more than impressions', () => {
  const r = sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', impressions: '100', clicks: '101' });
  assert.match(r.error, /Clicks cannot be more than impressions/);
});

test('reach cannot be more than impressions', () => {
  const r = sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', impressions: '100', reach: '150' });
  assert.match(r.error, /Reach cannot be more than impressions/);
});

test('clicks or reach need impressions too', () => {
  assert.match(sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', clicks: '5' }).error, /Enter impressions too/);
  assert.match(sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', reach: '5' }).error, /Enter impressions too/);
});

test('ad figures must be whole numbers, 0 or more', () => {
  assert.ok(sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', impressions: '1.5' }).error);
  assert.ok(sanitizeSpend({ channel: 'paid_ads', amount: '1', month: '2026-11', impressions: '-3' }).error);
});

test('CPM, CPC, CTR, frequency and cost per acquisition from the entries that recorded them', () => {
  const r = computeMarketing({
    spend: [
      { channel: 'paid_ads', amount: 300, month: '2026-11', impressions: 60000, clicks: 600, reach: 20000 },
      { channel: 'paid_ads', amount: 200, month: '2026-10', impressions: 40000, clicks: 200, reach: 10000 },
      { channel: 'outreach_tools', amount: 999, month: '2026-11' }, // no ad figures: spend counts, but not in the ad metrics
    ],
    deals: [won(), won()],
    now,
  });
  assert.equal(r.adSpend90, 500);
  assert.equal(r.impressions90, 100000);
  assert.equal(r.cpm, 5);
  assert.equal(r.cpc, 0.63);
  assert.equal(r.ctrPct, 0.8);
  assert.equal(r.adFrequency, 3.33);
  assert.equal(r.costPerAcquisition, r.blendedCostPerWin);
  assert.equal(r.costPerAcquisition, 750);
});

test('no ad figures gives no ad metrics, not zero', () => {
  const r = computeMarketing({ spend: [{ channel: 'paid_ads', amount: 300, month: '2026-11' }], deals: [won()], now });
  assert.equal(r.cpm, null);
  assert.equal(r.cpc, null);
  assert.equal(r.ctrPct, null);
  assert.equal(r.adFrequency, null);
});

test('impressions without clicks still give CPM but no CTR or CPC', () => {
  const r = computeMarketing({ spend: [{ channel: 'paid_ads', amount: 100, month: '2026-11', impressions: 20000 }], deals: [], now });
  assert.equal(r.cpm, 5);
  assert.equal(r.ctrPct, null);
  assert.equal(r.cpc, null);
});
