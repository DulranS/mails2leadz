import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFinderSettings, recordSearchRun, isDry, drySearches, pickNightlySearch, searchKey, DRY_AFTER, FINDER_DEFAULTS } from '../lib/lead-finder.js';
import { buildNextActions } from '../lib/next-actions.js';

const A = { term: 'plumbers', location: 'Colombo, Sri Lanka', minScore: 40 };
const B = { term: 'dentists', location: 'Kandy', minScore: 40 };
const C = { term: 'electricians', location: 'Galle', minScore: 40 };
const T = new Date('2026-10-20T00:00:00Z');

test('a search is dry only after two finished runs in a row that found nothing new', () => {
  let h = recordSearchRun({}, A, 12, T);
  assert.equal(isDry(h, A), false);
  h = recordSearchRun(h, A, 0, T);
  assert.equal(isDry(h, A), false);            // one empty run is not enough
  h = recordSearchRun(h, A, 0, T);
  assert.equal(h[searchKey(A)].dryRuns, DRY_AFTER);
  assert.equal(isDry(h, A), true);
  h = recordSearchRun(h, A, 5, T);              // it found something again (new businesses opened): no longer dry
  assert.equal(isDry(h, A), false);
  assert.equal(h[searchKey(A)].runs, 4);
});

test('the night skips dry searches and takes turns among the rest', () => {
  const dry = recordSearchRun(recordSearchRun({}, B, 0, T), B, 0, T);
  const s = { searches: [A, B, C], next: 1, health: dry };
  const p = pickNightlySearch(s);
  assert.equal(p.search.term, 'electricians');  // B is next in turn but dry, so C
  assert.equal(p.allDry, false);
  assert.equal(pickNightlySearch({ ...s, next: 0 }).search.term, 'plumbers');
  assert.equal(pickNightlySearch({ searches: [], next: 0, health: {} }), null);
});

test('when every search is dry it still tries the next in turn and says so', () => {
  let h = {};
  for (const x of [A, B]) h = recordSearchRun(recordSearchRun(h, x, 0, T), x, 0, T);
  const s = { searches: [A, B], next: 1, health: h };
  const p = pickNightlySearch(s);
  assert.equal(p.allDry, true);
  assert.equal(p.search.term, 'dentists');
  assert.equal(drySearches(s).length, 2);
});

test('health is kept for searches that still exist and dropped for ones removed; junk is cleaned', () => {
  const h = recordSearchRun(recordSearchRun({}, A, 0, T), B, 3, T);
  const saved = sanitizeFinderSettings({ enabled: true, searches: [A], next: 0, health: { ...h, 'x|y': { runs: 9 } } });
  assert.deepEqual(Object.keys(saved.health), [searchKey(A)]);
  const junk = sanitizeFinderSettings({ enabled: true, searches: [A], health: { [searchKey(A)]: { runs: -5, dryRuns: 'x', lastDelivered: 1e12, lastRunAt: 42 } } });
  assert.deepEqual(junk.health[searchKey(A)], { runs: 0, dryRuns: 0, lastDelivered: 100000, lastRunAt: '' });
  assert.deepEqual(FINDER_DEFAULTS.health, {});
  assert.deepEqual(sanitizeFinderSettings(undefined).health, {});
});

test('do this next: says so when searches run dry, quiet otherwise', () => {
  const metrics = { settings: { currency: 'USD', avgDealValue: 1000, probabilities: {} }, present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 }, deals: [], past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } }, future: { horizons: [{ expected: 0 }] } };
  const find = (finder) => buildNextActions({ metrics, finder }).find((a) => a.id === 'finder_dry');
  assert.equal(find(null), undefined);
  assert.equal(find({ enabled: true, total: 3, dry: [] }), undefined);
  assert.equal(find({ enabled: false, total: 3, dry: ['plumbers in Colombo'] }), undefined);
  const some = find({ enabled: true, total: 3, dry: ['plumbers in Colombo'] });
  assert.equal(some.tone, 'info');
  assert.match(some.title, /A nightly search has stopped/);
  assert.match(some.detail, /plumbers in Colombo/);
  const all = find({ enabled: true, total: 2, dry: ['a in b', 'c in d'] });
  assert.equal(all.tone, 'warn');
  assert.match(all.title, /nightly searches have stopped/);
  assert.equal(all.href, '/inbox');
});
