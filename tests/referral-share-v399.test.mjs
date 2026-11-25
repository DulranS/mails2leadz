// v399: referral share of wins (lib/marketing.js computeMarketing). Pure. Run: node --test tests/referral-share-v399.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMarketing } from '../lib/marketing.js';

const now = Date.parse('2026-11-25T12:00:00Z');
const won = (source) => ({ stage: 'closed_won', source, closedAt: '2026-11-10T00:00:00Z', value: 100 });

test('referral share is the share of wins that came by referral', () => {
  const r = computeMarketing({ spend: [], deals: [won('referral'), won('inbound'), won('referral'), won('email')], now });
  assert.equal(r.referralSharePct, 50);
});

test('no wins in the window gives no referral share, not zero', () => {
  const r = computeMarketing({ spend: [], deals: [{ stage: 'qualified', source: 'referral', closedAt: '2026-11-10T00:00:00Z' }], now });
  assert.equal(r.referralSharePct, null);
});

test('wins outside the window are not counted', () => {
  const old = { stage: 'closed_won', source: 'referral', closedAt: '2025-01-10T00:00:00Z', value: 100 };
  const r = computeMarketing({ spend: [], deals: [old, won('inbound')], now });
  assert.equal(r.referralSharePct, 0);
});
