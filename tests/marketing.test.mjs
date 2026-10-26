import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMarketing, sanitizeSpend, recentMonths } from '../lib/marketing.js';

const NOW = Date.UTC(2026, 9, 20, 12); // October 2026
const won = (source, closedAt) => ({ stage: 'closed_won', source, closedAt: new Date(closedAt).toISOString() });
const oct = Date.UTC(2026, 9, 5), sep = Date.UTC(2026, 8, 5), aug = Date.UTC(2026, 7, 5), jun = Date.UTC(2026, 5, 5);

test('sanitizeSpend accepts a real entry and rejects bad ones', () => {
  assert.deepEqual(sanitizeSpend({ channel: 'paid_ads', amount: '120.456', month: '2026-10', note: ' boosted  post ' }).entry,
    { channel: 'paid_ads', amount: 120.46, month: '2026-10', note: 'boosted post', recurring: false });
  assert.match(sanitizeSpend({ channel: 'nope', amount: 1, month: '2026-10' }).error, /channel/);
  assert.match(sanitizeSpend({ channel: 'events', amount: '', month: '2026-10' }).error, /spent/);
  assert.match(sanitizeSpend({ channel: 'events', amount: -5, month: '2026-10' }).error, /spent/);
  assert.match(sanitizeSpend({ channel: 'events', amount: 5, month: '10/2026' }).error, /month/);
});

test('recent months are the current month and the two before it, newest first', () => {
  assert.deepEqual(recentMonths(NOW, 3), ['2026-10', '2026-09', '2026-08']);
});

test('cost per win counts spend and wins in the last three months only', () => {
  const r = computeMarketing({
    spend: [
      { channel: 'paid_ads', amount: 300, month: '2026-10' },
      { channel: 'content', amount: 200, month: '2026-09' },
      { channel: 'events', amount: 999, month: '2026-06' }, // outside the window
    ],
    deals: [won('inbound', oct), won('referral', sep), won('email', jun)], // the June win is outside the window too
    now: NOW,
  });
  assert.equal(r.spend90, 500);
  assert.equal(r.wins90, 2);
  assert.equal(r.blendedCostPerWin, 250);
});

test('cost per inbound win uses only inbound-channel spend and inbound-tagged wins', () => {
  const r = computeMarketing({
    spend: [
      { channel: 'paid_ads', amount: 300, month: '2026-10' },
      { channel: 'outreach_tools', amount: 100, month: '2026-10' }, // cold-email cost, not inbound
    ],
    deals: [won('inbound', oct), won('inbound', sep), won('email', oct)],
    now: NOW,
  });
  assert.equal(r.inboundSpend90, 300);
  assert.equal(r.inboundWins90, 2);
  assert.equal(r.costPerInboundWin, 150);
});

test('partial spend is flagged, because a missing month overstates cost per win', () => {
  const r = computeMarketing({ spend: [{ channel: 'paid_ads', amount: 300, month: '2026-10' }], deals: [won('inbound', oct)], now: NOW });
  assert.equal(r.monthsEntered, 1);
  assert.equal(r.partial, true);
});

test('nothing is invented: no spend or no wins gives n/a, never zero', () => {
  const noSpend = computeMarketing({ spend: [], deals: [won('inbound', oct)], now: NOW });
  assert.equal(noSpend.blendedCostPerWin, null);
  assert.equal(noSpend.ready, false);
  const noWins = computeMarketing({ spend: [{ channel: 'paid_ads', amount: 300, month: '2026-10' }], deals: [], now: NOW });
  assert.equal(noWins.blendedCostPerWin, null);
  assert.equal(noWins.costPerInboundWin, null);
});

test('a same-every-month entry counts once for each month in the window, from the month it starts', () => {
  const r = computeMarketing({ spend: [{ channel: 'outreach_tools', amount: 50, month: '2026-08', recurring: true }], deals: [], now: NOW });
  assert.equal(r.spend90, 150);
  assert.equal(r.monthsEntered, 3);
});

test('a recurring entry that starts inside the window counts only from its start month', () => {
  const r = computeMarketing({ spend: [{ channel: 'outreach_tools', amount: 50, month: '2026-09', recurring: true }], deals: [], now: NOW });
  assert.equal(r.spend90, 100);
});

test('the recurring flag is kept when set and defaults off', () => {
  assert.equal(sanitizeSpend({ channel: 'events', amount: 5, month: '2026-10', recurring: true }).entry.recurring, true);
  assert.equal(sanitizeSpend({ channel: 'events', amount: 5, month: '2026-10' }).entry.recurring, false);
});
