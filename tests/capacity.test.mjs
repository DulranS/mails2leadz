import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCapacity } from '../lib/capacity.js';
import { buildNextActions } from '../lib/next-actions.js';

test('not set: nothing is claimed', () => {
  for (const max of [0, '', undefined, null, 'abc', -3]) {
    const c = computeCapacity({ active: 7, max });
    assert.equal(c.set, false);
    assert.equal(c.pct, null);
    assert.equal(c.state, 'unset');
  }
});

test('states: ok, near at 80 percent, full, over', () => {
  assert.equal(computeCapacity({ active: 5, max: 10 }).state, 'ok');
  assert.equal(computeCapacity({ active: 8, max: 10 }).state, 'near');
  assert.equal(computeCapacity({ active: 10, max: 10 }).state, 'full');
  const over = computeCapacity({ active: 12, max: 10 });
  assert.equal(over.state, 'over');
  assert.equal(over.free, 0);
  assert.match(over.message, /2 more customers/);
  assert.equal(computeCapacity({ active: 8, max: '10' }).free, 2);
});

test('a rush of near-wins is flagged when it would not fit', () => {
  const c = computeCapacity({ active: 9, max: 10, inDelivery: 3 });
  assert.equal(c.wouldOverflow, true);
  assert.equal(computeCapacity({ active: 5, max: 10, inDelivery: 3 }).wouldOverflow, false);
});

test('next actions: a full or nearly full delivery shows up, a comfortable one stays quiet', () => {
  const metrics = {
    settings: { currency: 'USD', avgDealValue: 1000, probabilities: {} },
    present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 },
    deals: [],
    past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } },
    future: { horizons: [{ expected: 0 }] },
  };
  const ids = (cap) => buildNextActions({ metrics, capacity: cap }).map((a) => a.id);
  assert.ok(ids(computeCapacity({ active: 10, max: 10 })).includes('capacity'));
  assert.ok(ids(computeCapacity({ active: 8, max: 10 })).includes('capacity'));
  assert.ok(!ids(computeCapacity({ active: 3, max: 10 })).includes('capacity'));
  assert.ok(!ids(computeCapacity({ active: 9, max: 0 })).includes('capacity'));
  assert.ok(!ids(null).includes('capacity'));
  const full = buildNextActions({ metrics, capacity: computeCapacity({ active: 10, max: 10 }) }).find((a) => a.id === 'capacity');
  assert.equal(full.tone, 'warn');
  assert.equal(full.href, '/customers');
});
