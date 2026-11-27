// v402: the four ways to get customers. Pure. Run: node --test tests/marketing-matrix-v402.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketingMatrix, CHANNEL_CELL, MATRIX_CELLS } from '../lib/marketing-matrix.js';

test('each channel lands in one cell; shares add up to 100 with the unplaced line', () => {
  const spend = [
    { channel: 'paid_ads', month: '2026-11', amount: 1000 },
    { channel: 'content', month: '2026-11', amount: 300 },
    { channel: 'outreach_tools', month: '2026-11', amount: 200 },
    { channel: 'events', month: '2026-11', amount: 500 },
    { channel: 'other', month: '2026-11', amount: 100 },
  ];
  const r = marketingMatrix({ spend, months: ['2026-11'] });
  const cell = (id) => r.cells.find((c) => c.id === id);
  assert.equal(r.total, 2100);
  assert.equal(cell('paid_one_to_many').amount, 1500);
  assert.equal(cell('paid_one_to_many').sharePct, 71.4);
  assert.equal(cell('free_one_to_many').sharePct, 14.3);
  assert.equal(cell('cold_one_to_one').sharePct, 9.5);
  assert.equal(cell('warm_one_to_one').sharePct, 0, 'no warm channel in spend yet');
  assert.equal(r.unplaced.amount, 100);
  const sum = r.cells.reduce((t, c) => t + c.sharePct, 0) + r.unplaced.sharePct;
  assert.ok(Math.abs(sum - 100) < 0.2, `shares add to 100, got ${sum}`);
});

test('spend outside the window, zero or bad amounts are ignored', () => {
  const r = marketingMatrix({
    spend: [
      { channel: 'paid_ads', month: '2026-08', amount: 999 },
      { channel: 'paid_ads', month: '2026-11', amount: 0 },
      { channel: 'paid_ads', month: '2026-11', amount: NaN },
    ],
    months: ['2026-11'],
  });
  assert.equal(r.total, 0);
  assert.equal(r.cells.find((c) => c.id === 'paid_one_to_many').sharePct, null);
});

test('every channel in the marketing list has a placement or is shown as unplaced', () => {
  assert.equal(MATRIX_CELLS.length, 4);
  assert.deepEqual(Object.keys(CHANNEL_CELL).sort(), ['content', 'events', 'outreach_tools', 'paid_ads']);
});
