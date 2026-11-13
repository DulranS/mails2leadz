// Offers, trust and the recommended package (Pass 239): offers need a real end date and stop when they end; trust is shown with its parts; the middle package is the recommended one.
import assert from 'node:assert/strict';
import { parseOffers, activeOffers, endingSoon } from '../lib/offers.js';
import { trustScore } from '../lib/trust.js';
import { recommendedIndex } from '../lib/packages.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('an offer needs a name, a sensible discount and a real end date; bad lines are skipped and counted', () => {
  const r = parseOffers('Spring fitting | 10 | 2026-12-15 | Money back in 30 days\nNo date | 10 | soon\nToo big | 95 | 2026-12-15');
  assert.equal(r.offers.length, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.offers[0].guarantee, 'Money back in 30 days');
});

t('an offer that has ended is never shown as running, and one ending within three days is flagged', () => {
  const offers = [
    { name: 'Ended', endsAt: new Date(now - DAY).toISOString() },
    { name: 'Ends soon', endsAt: new Date(now + 2 * DAY).toISOString() },
    { name: 'Later', endsAt: new Date(now + 20 * DAY).toISOString() },
  ];
  assert.deepEqual(activeOffers(offers, now).map((o) => o.name), ['Ends soon', 'Later']);
  assert.deepEqual(endingSoon(offers, now).map((o) => o.name), ['Ends soon']);
});

t('the trust score names each part it is made from, and falls with open complaints', () => {
  const good = trustScore({ supportTargetMetPct: 100, openComplaints: 0, creditRiskCount: 0 });
  assert.equal(good.score, 100);
  assert.equal(good.label, 'Reliable');
  const worse = trustScore({ supportTargetMetPct: 60, openComplaints: 2, creditRiskCount: 1 });
  assert.ok(worse.score < good.score);
  assert.ok(worse.parts.some((p) => p.name === 'Open complaints' && p.value === '2'));
  assert.equal(trustScore({}).score, 100, 'no data is not counted against you');
});

t('with three packages, the middle one is marked as recommended; with any other number, none is', () => {
  assert.equal(recommendedIndex(3), 1);
  assert.equal(recommendedIndex(2), -1);
  assert.equal(recommendedIndex(4), -1);
});

console.log(`\n${n} passed`);
