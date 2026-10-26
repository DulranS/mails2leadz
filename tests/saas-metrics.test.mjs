import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTrialConversion, MIN_DECIDED } from '../lib/saas-metrics.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 27);
const row = (o) => ({ plan: 'trial', status: 'trialing', suspended: false, pays: false, trialEndsAt: new Date(NOW - DAY).toISOString(), ...o });
const finished = (pays) => row({ pays, trialEndsAt: new Date(NOW - 3 * DAY).toISOString() });
const live = (pays = false) => row({ pays, trialEndsAt: new Date(NOW + 5 * DAY).toISOString() });

test('below the minimum number of finished trials no rate is shown', () => {
  const r = computeTrialConversion({ tenants: [finished(true), finished(false)], now: NOW });
  assert.equal(r.decided, 2);
  assert.equal(r.ratePct, null);
  assert.equal(MIN_DECIDED, 5);
});

test('rate is paid over finished trials; live trials, internal and suspended accounts stay out of it', () => {
  const tenants = [
    finished(true), finished(true), finished(true),      // paid after the trial
    finished(false), finished(false),                    // lapsed
    live(), live(), live(), live(),                      // still trialing
    row({ plan: 'internal', pays: false, trialEndsAt: new Date(NOW - 3 * DAY).toISOString() }), // ours
    row({ suspended: true, pays: false, trialEndsAt: new Date(NOW - 3 * DAY).toISOString() }), // operator-suspended
    row({ trialEndsAt: '' }),                             // never on a trial
  ];
  const r = computeTrialConversion({ tenants, now: NOW });
  assert.deepEqual(
    [r.started, r.converted, r.lapsed, r.stillTrialing, r.decided, r.ratePct],
    [9, 3, 2, 4, 5, 60]
  );
});

test('an account that pays before its trial ends counts as converted and is in the denominator', () => {
  const tenants = [live(true), finished(true), finished(true), finished(true), finished(false)];
  const r = computeTrialConversion({ tenants, now: NOW });
  assert.equal(r.converted, 4);
  assert.equal(r.decided, 5);
  assert.equal(r.ratePct, 80);
});

test('an account granted a paid plan by hand without a Stripe subscription is not counted as paid', () => {
  const granted = row({ plan: 'growth', status: 'active', pays: false, trialEndsAt: new Date(NOW - 3 * DAY).toISOString() });
  const r = computeTrialConversion({ tenants: [granted], now: NOW });
  assert.equal(r.converted, 0);
  assert.equal(r.lapsed, 1);
});

test('no tenants gives an empty, honest result', () => {
  assert.deepEqual(computeTrialConversion({ tenants: [], now: NOW }), { started: 0, converted: 0, lapsed: 0, stillTrialing: 0, decided: 0, minDecided: MIN_DECIDED, ratePct: null });
});
