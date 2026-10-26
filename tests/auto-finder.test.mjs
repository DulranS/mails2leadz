import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFinderSettings, needsAutoRefresh, mergeAutoSearches, searchKey, MAX_SAVED_SEARCHES, DRY_AFTER } from '../lib/lead-finder.js';
import { refreshAutoSearches, saveFinderSettings } from '../lib/server/lead-finder-job.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 3);
const iso = (ms) => new Date(ms).toISOString();
const base = (o = {}) => sanitizeFinderSettings({ enabled: true, autoFind: true, area: 'Colombo, Sri Lanka', searches: [], ...o });
const dry = (term) => ({ [searchKey({ term, location: 'Colombo, Sri Lanka' })]: { runs: DRY_AFTER, dryRuns: DRY_AFTER, lastDelivered: 0, lastRunAt: '' } });

test('auto-find settings are kept, the area is cleaned, and a non-boolean switch is ignored', () => {
  const s = sanitizeFinderSettings({ enabled: true, autoFind: 'yes', area: '  Colombo\n\n  Sri Lanka  ', retired: ['a|b', 'a|b', ''] });
  assert.equal(s.autoFind, false);
  assert.equal(s.area, 'Colombo Sri Lanka');
  assert.deepEqual(s.retired, ['a|b']);
  assert.equal(sanitizeFinderSettings({ autoFind: true }).autoFind, true);
});

test('a refresh is asked for only when auto-find, the finder and an area are all on', () => {
  assert.equal(needsAutoRefresh(base({ enabled: false })), false);
  assert.equal(needsAutoRefresh(base({ autoFind: false })), false);
  assert.equal(needsAutoRefresh(base({ area: '' })), false);
  assert.equal(needsAutoRefresh(base(), NOW), true); // on, area set, nothing saved yet
});

test('a refresh is not repeated within a day, and happens when every search is dry or a week has passed', () => {
  const withSearch = base({ searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }], autoFindedAt: iso(NOW - 2 * 3600e3) });
  assert.equal(needsAutoRefresh(withSearch, NOW), false); // refreshed 2 hours ago
  const allDry = base({ searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }], health: dry('Restaurant'), autoFindedAt: iso(NOW - 3 * DAY) });
  assert.equal(needsAutoRefresh(allDry, NOW), true);
  const weekOld = base({ searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }], autoFindedAt: iso(NOW - 8 * DAY) });
  assert.equal(needsAutoRefresh(weekOld, NOW), true);
  const recent = base({ searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }], autoFindedAt: iso(NOW - 3 * DAY) });
  assert.equal(needsAutoRefresh(recent, NOW), false);
});

test('the merge keeps working searches, retires dry ones, skips duplicates and retired ones, and never exceeds the limit', () => {
  const s = base({
    searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }, { term: 'Hotel', location: 'Colombo, Sri Lanka' }],
    health: dry('Hotel'),
    retired: [searchKey({ term: 'Pharmacy', location: 'Colombo, Sri Lanka' })],
  });
  const m = mergeAutoSearches(s, [{ term: 'Restaurant' }, { term: 'Pharmacy' }, { term: 'Dental clinic' }, { term: 'Gym' }, { term: 'Salon' }, { term: 'Bakery' }]);
  assert.deepEqual(m.searches.map((x) => x.term), ['Restaurant', 'Dental clinic', 'Gym', 'Salon', 'Bakery']);
  assert.equal(m.searches.length, MAX_SAVED_SEARCHES);
  assert.equal(m.dropped, 1);
  assert.ok(m.retired.includes(searchKey({ term: 'Hotel', location: 'Colombo, Sri Lanka' })));
  assert.ok(m.searches.every((x) => x.location === 'Colombo, Sri Lanka'));
});

function fakeDeps() {
  const saved = [];
  const marks = [];
  return {
    saved, marks,
    deps: {
      loadSettings: async () => null,
      saveSettings: async (uid, patch, merge) => { saved.push({ uid, patch, merge }); },
      markFinderUser: async (uid, on) => { marks.push({ uid, on }); },
    },
  };
}

test('a refresh saves the suggested searches for the area with a plain note of what changed', async () => {
  const f = fakeDeps();
  const out = await refreshAutoSearches(null, 'u1', {
    settings: base(), deps: f.deps, now: NOW,
    suggest: async () => [{ term: 'Restaurant', why: 'x' }, { term: 'Gym', why: 'y' }],
  });
  assert.deepEqual(out.searches.map((x) => x.term), ['Restaurant', 'Gym']);
  assert.match(f.saved[0].patch.autoNote, /Added 2 new searches: Restaurant, Gym/);
  assert.equal(f.saved[0].merge, true);
});

test('when the AI cannot suggest, nothing is lost: the note says why and the searches stay as they were', async () => {
  const f = fakeDeps();
  const current = base({ searches: [{ term: 'Restaurant', location: 'Colombo, Sri Lanka' }] });
  const out = await refreshAutoSearches(null, 'u1', {
    settings: current, deps: f.deps, now: NOW,
    suggest: async () => { throw Object.assign(new Error('NO_PROFILE'), { code: 'NO_PROFILE' }); },
  });
  assert.deepEqual(out.searches, current.searches);
  assert.match(f.saved[0].patch.autoNote, /Describe what you sell/);
  assert.equal(f.saved[0].patch.searches, undefined); // the searches are not overwritten on a failed suggestion
  const f2 = fakeDeps();
  await refreshAutoSearches(null, 'u1', { settings: current, deps: f2.deps, now: NOW, suggest: async () => { throw new Error('network'); } });
  assert.match(f2.saved[0].patch.autoNote, /try again on a later night/);
});

test('a user with auto-find on but no saved searches is marked for the nightly run, so they are not skipped', async () => {
  const f = fakeDeps();
  await saveFinderSettings(null, 'u1', { enabled: true, autoFind: true, area: 'Colombo, Sri Lanka', searches: [] }, f.deps);
  assert.equal(f.marks.at(-1).on, true);
  const g = fakeDeps();
  await saveFinderSettings(null, 'u1', { enabled: true, autoFind: false, area: '', searches: [] }, g.deps);
  assert.equal(g.marks.at(-1).on, false);
});
