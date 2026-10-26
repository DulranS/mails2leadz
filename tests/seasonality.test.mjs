import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSeasonIndex, learnSeasonIndex, seasonAhead, MONTH_LABELS } from '../lib/seasonality.js';
import { buildNextActions } from '../lib/next-actions.js';

const NOW = Date.UTC(2026, 9, 20);       // October 2026
const sale = (y, m, value) => ({ stage: 'closed_won', value, closedAt: new Date(Date.UTC(y, m, 10)).toISOString() });

test('a declared season is twelve percentages; flat or empty means none', () => {
  assert.equal(sanitizeSeasonIndex(undefined), null);
  assert.equal(sanitizeSeasonIndex([100, 100, 100]), null);
  assert.equal(sanitizeSeasonIndex(Array(12).fill('')), null);
  assert.equal(sanitizeSeasonIndex(Array(12).fill(100)), null);
  const s = sanitizeSeasonIndex(['50', '', 'x', 999, -5, 100, 100, 100, 100, 100, 100, 150]);
  assert.deepEqual(s, [50, 100, 100, 400, 0, 100, 100, 100, 100, 100, 100, 150]);
});

test('nothing is learned from too little history', () => {
  assert.equal(learnSeasonIndex([], NOW), null);
  assert.equal(learnSeasonIndex(Array.from({ length: 20 }, () => sale(2026, 3, 100)), NOW), null);       // plenty of sales, but only months of history
  assert.equal(learnSeasonIndex(Array.from({ length: 5 }, (_, i) => sale(2024 + (i % 2), i, 100)), NOW), null); // a long span, too few sales
});

test('a year or more of history teaches the pattern, quiet months included', () => {
  // two summers (Jun to Aug) of 3000 a month, everything else 1000: a tourism-shaped year
  const deals = [];
  for (const y of [2024, 2025]) for (let m = 0; m < 12; m++) deals.push(sale(y, m, m >= 5 && m <= 7 ? 3000 : 1000));
  for (let m = 0; m < 9; m++) deals.push(sale(2026, m, m >= 5 && m <= 7 ? 3000 : 1000));
  const l = learnSeasonIndex(deals, NOW);
  assert.ok(l && l.deals === 33);
  assert.ok(l.index[6] > 150, 'July is far above average');
  assert.ok(l.index[0] < 70, 'January is far below average');
  assert.ok(Math.abs(l.index.reduce((a, b) => a + b, 0) / 12 - 100) < 8, 'indices centre on 100');
});

test('season ahead: declared wins over learned, and the run rate is made season-neutral first', () => {
  const declared = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50, 50]; // Nov and Dec quiet
  const a = seasonAhead({ declared, learned: { index: Array(12).fill(200) }, runRateMonthly: 1000, now: NOW });
  assert.equal(a.source, 'declared');
  assert.deepEqual(a.rows.map((r) => r.label), ['Nov', 'Dec', 'Jan']);
  assert.deepEqual(a.rows.map((r) => r.index), [50, 50, 100]);
  assert.equal(a.avgIndex, 67);
  assert.equal(a.state, 'quiet');
  assert.equal(a.rows[0].expected, 500);              // last three months (Jul-Sep) were all average, so baseline 1000
  assert.match(a.message, /Build cash now/);
  // a busy recent quarter is not read as the new normal
  const peaky = seasonAhead({ declared: [100, 100, 100, 100, 100, 100, 200, 200, 200, 100, 100, 100], runRateMonthly: 2000, now: NOW });
  assert.equal(peaky.baseline, 1000);
  assert.equal(peaky.rows[0].expected, 1000);
});

test('season ahead: peak, ordinary, nothing set, and no run rate yet', () => {
  const idx = (n) => Array.from({ length: 12 }, (_, m) => (m === 10 || m === 11 || m === 0 ? n : 100));
  assert.equal(seasonAhead({ declared: idx(160), now: NOW }).state, 'peak');
  assert.match(seasonAhead({ declared: idx(160), now: NOW }).message, /delivery capacity/);
  assert.equal(seasonAhead({ declared: idx(105), now: NOW }).state, 'normal');
  assert.equal(seasonAhead({ now: NOW }).set, false);
  const noRate = seasonAhead({ declared: idx(60), now: NOW });
  assert.equal(noRate.baseline, null);
  assert.ok(noRate.rows.every((r) => r.expected === null));
  assert.equal(MONTH_LABELS.length, 12);
});

test('do this next: a coming quiet or busy season is said, an ordinary one is not', () => {
  const metrics = { settings: { currency: 'USD', avgDealValue: 1000, probabilities: {} }, present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 }, deals: [], past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } }, future: { horizons: [{ expected: 0 }] } };
  const get = (season) => buildNextActions({ metrics, season }).find((a) => a.id === 'season');
  assert.equal(get(null), undefined);
  assert.equal(get({ set: false }), undefined);
  assert.equal(get({ set: true, state: 'normal', avgIndex: 100, message: 'm', rows: [] }), undefined);
  const q = get({ set: true, state: 'quiet', avgIndex: 60, message: 'A quiet stretch is coming.', rows: [{ label: 'Nov' }] });
  assert.equal(q.tone, 'info');
  assert.match(q.title, /quiet season/i);
  assert.match(get({ set: true, state: 'peak', avgIndex: 150, message: 'A busy stretch', rows: [] }).title, /busy season/i);
});
