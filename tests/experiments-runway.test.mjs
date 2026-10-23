import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeExperiment, suggest, computeExperiments, MAX_RUNNING } from '../lib/experiments.js';
import { computeRunway } from '../lib/runway.js';
import { buildNextActions } from '../lib/next-actions.js';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const D = (n) => new Date(NOW + n * 864e5).toISOString().slice(0, 10);
const good = { title: 'Plumbers in Colombo will pay for a maintenance plan', metric: 'qualified conversations', target: '5', startAt: D(0), reviewAt: D(14) };

test('an experiment needs an idea, something to count, a target and a judging date', () => {
  assert.match(sanitizeExperiment({ ...good, title: 'short' }).error, /sentence/);
  assert.match(sanitizeExperiment({ ...good, metric: '' }).error, /count/);
  assert.match(sanitizeExperiment({ ...good, target: '' }).error, /number you must reach/);
  assert.match(sanitizeExperiment({ ...good, target: 0 }).error, /number you must reach/);
  assert.match(sanitizeExperiment({ ...good, reviewAt: '' }).error, /judge/);
  assert.match(sanitizeExperiment({ ...good, reviewAt: D(-3) }).error, /before the start/);
  const ok = sanitizeExperiment({ ...good, title: '  Plumbers   in Colombo will pay for a maintenance plan  ' }, { now: NOW });
  assert.equal(ok.experiment.status, 'running');
  assert.equal(ok.experiment.target, 5);
  assert.equal(ok.experiment.title, 'Plumbers in Colombo will pay for a maintenance plan');
});

test('deciding needs the real number and a choice', () => {
  assert.match(sanitizeExperiment({ ...good, status: 'decided', actual: 3 }).error, /decided/);
  assert.match(sanitizeExperiment({ ...good, status: 'decided', decision: 'stop' }).error, /actually got/);
  const d = sanitizeExperiment({ ...good, status: 'decided', decision: 'stop', actual: 0 }, { now: NOW });
  assert.equal(d.experiment.actual, 0);
  assert.equal(d.experiment.decision, 'stop');
  assert.equal(d.experiment.decidedAt, D(0));
  assert.equal(sanitizeExperiment({ ...good, status: 'decided', decision: 'whatever', actual: 1 }).error, 'Choose what you decided.');
});

test('the number suggests, it never decides', () => {
  assert.equal(suggest(5, 5).id, 'double_down');
  assert.equal(suggest(3, 5).id, 'iterate');
  assert.equal(suggest(1, 5).id, 'stop');
  assert.equal(suggest(0, 5).id, 'stop');
  assert.equal(suggest('x', 5), null);
  assert.match(suggest(1, 5).text, /Do not keep going just because time was spent/);
});

test('running tests are ordered by deadline, overdue ones are flagged, only three at once', () => {
  const mk = (id, review, extra = {}) => ({ id, title: `Test number ${id} here`, metric: 'x', target: 5, startAt: D(-20), reviewAt: review, status: 'running', ...extra });
  const c = computeExperiments({ items: [mk('a', D(10)), mk('b', D(-2)), mk('c', D(0)), mk('d', D(5), { status: 'decided', actual: 6, decision: 'double_down', decidedAt: D(-1) })], now: NOW });
  assert.deepEqual(c.running.map((r) => r.id), ['b', 'c', 'a']);
  assert.equal(c.running[0].overdue, true);
  assert.equal(c.running[1].due, true);
  assert.equal(c.running[1].overdue, false);
  assert.equal(c.due.length, 2);
  assert.equal(c.canStartMore, false); // three are already running
  assert.equal(computeExperiments({ items: [mk('a', D(10))], now: NOW }).canStartMore, true);
  assert.equal(c.hitRatePct, null); // fewer than 3 decided: no rate
});

test('hit rate appears after three decisions', () => {
  const dec = (id, actual) => ({ id, title: `Decided test ${id} here`, metric: 'x', target: 5, startAt: D(-30), reviewAt: D(-16), status: 'decided', actual, decision: 'stop', decidedAt: D(-10) });
  assert.equal(computeExperiments({ items: [dec('a', 6), dec('b', 1), dec('c', 5)], now: NOW }).hitRatePct, 67);
});

test('runway: no cash figure, no number; burn, profitable, unknown costs, stale figure, money owed', () => {
  assert.equal(computeRunway({}).set, false);
  assert.equal(computeRunway({ cashOnHand: '' }).set, false);
  assert.equal(computeRunway({ cashOnHand: -5 }).set, false);
  const short = computeRunway({ cashOnHand: 3000, cashAsOf: D(-2), netMonthly: -1000, profitReady: true, owedToYou: 1500, now: NOW });
  assert.deepEqual([short.state, short.months, short.monthsWithOwed, short.burnMonthly], ['short', 3, 4.5, 1000]);
  assert.match(short.message, /3 months/);
  assert.equal(computeRunway({ cashOnHand: 8000, cashAsOf: D(0), netMonthly: -1000, profitReady: true, now: NOW }).state, 'watch');
  assert.equal(computeRunway({ cashOnHand: 20000, cashAsOf: D(0), netMonthly: -1000, profitReady: true, now: NOW }).state, 'ok');
  const profitable = computeRunway({ cashOnHand: 100, cashAsOf: D(0), netMonthly: 200, profitReady: true, now: NOW });
  assert.equal(profitable.state, 'profitable');
  assert.equal(profitable.months, null);
  // before any sales: the burn is simply the running costs
  const pre = computeRunway({ cashOnHand: 6000, cashAsOf: D(0), operatingMonthly: 1000, profitReady: false, now: NOW });
  assert.deepEqual([pre.state, pre.months, pre.basedOnProfit], ['watch', 6, false]);
  assert.equal(computeRunway({ cashOnHand: 6000, cashAsOf: D(0), operatingMonthly: 0, profitReady: false, now: NOW }).state, 'unknown');
  assert.equal(computeRunway({ cashOnHand: 6000, cashAsOf: D(-45), netMonthly: -1000, profitReady: true, now: NOW }).stale, true);
  assert.equal(computeRunway({ cashOnHand: 6000, cashAsOf: '', netMonthly: -1000, profitReady: true, now: NOW }).stale, false);
});

test('next actions: an overdue experiment and a short runway get said, calm ones stay quiet', () => {
  const metrics = { settings: { currency: 'USD', avgDealValue: 1000, probabilities: {} }, present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 }, deals: [], past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } }, future: { horizons: [{ expected: 0 }] } };
  const ids = (extra) => buildNextActions({ metrics, ...extra }).map((a) => a.id);
  const running = (daysLeft) => ({ due: [{ id: 'x', title: 'Plumbers will pay for a plan', daysLeft }] });
  assert.ok(ids({ experiments: running(-3) }).includes('experiment_review'));
  assert.ok(!ids({ experiments: { due: [] } }).includes('experiment_review'));
  assert.ok(!ids({}).includes('experiment_review'));
  assert.ok(ids({ runway: { set: true, state: 'short', months: 3, message: 'm' } }).includes('runway'));
  assert.ok(!ids({ runway: { set: true, state: 'ok', months: 20, message: 'm' } }).includes('runway'));
  assert.ok(!ids({ runway: { set: false } }).includes('runway'));
});
