// Do-now list (Pass 237): only what needs attention, most urgent first, at most five, each with one place to go.
import assert from 'node:assert/strict';
import { buildTodayActions, MAX_ITEMS } from '../lib/today-actions.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('nothing needing attention gives an empty list', () => {
  assert.deepEqual(buildTodayActions({}), []);
  assert.deepEqual(buildTodayActions({ leadsWaiting: 0 }), []);
});

t('the most urgent comes first, and wording is singular or plural to match the count', () => {
  const list = buildTodayActions({ leadsWaiting: 3, supportPastTarget: 1, dealsAtRisk: 2 });
  assert.equal(list[0].key, 'supportPastTarget');
  assert.equal(list[0].text, '1 customer question is past its two-hour target');
  assert.equal(list[1].text, '3 new leads are waiting for a first reply');
});

t('the list never shows more than five items', () => {
  const all = { supportPastTarget: 1, leadsWaiting: 1, supportOpen: 1, dealsAtRisk: 1, journeyStepsDue: 1, broadcastDrafts: 1, socialDrafts: 1, listingsToDecide: 1, eventsSoon: 1 };
  assert.equal(buildTodayActions(all).length, MAX_ITEMS);
});

t('every item has one place to go', () => {
  for (const it of buildTodayActions({ leadsWaiting: 2, socialDrafts: 1 })) assert.match(it.href, /^\/[a-z-]+$/);
});

console.log(`\n${n} passed`);
