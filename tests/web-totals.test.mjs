// Web totals (Pass 270): click-through rate is clicks over impressions; GA4 totals are read in the order they were asked for; no data is never shown as zero.
import assert from 'node:assert/strict';
import { parseSeoRows, ctrPercent, parseGa4Totals } from '../lib/seo-totals.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('click-through rate is clicks over impressions, as a percentage; no impressions gives no figure', () => {
  const s = parseSeoRows({ rows: [{ clicks: 30, impressions: 400 }, { clicks: 10, impressions: 100 }] });
  assert.deepEqual(s, { clicks: 40, impressions: 500 });
  assert.equal(ctrPercent(s.clicks, s.impressions), 8);
  assert.equal(ctrPercent(0, 0), null);
});

t('GA4 totals are read in the order requested: sessions, users, bounce rate', () => {
  const g = parseGa4Totals({ rows: [{ metricValues: [{ value: '1200' }, { value: '900' }, { value: '0.4215' }] }] });
  assert.deepEqual(g, { sessions: 1200, users: 900, bouncePct: 42.2 });
  assert.equal(parseGa4Totals({}), null);
});

console.log(`\n${n} passed`);
