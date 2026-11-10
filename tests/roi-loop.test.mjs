// ROI loop (Pass 209): revenue against spend per channel, one budget suggestion, and customer value by source.
import assert from 'node:assert/strict';
import { channelRoi, budgetSuggestion, ltvBySource, parseSpend } from '../lib/roi-loop.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('each channel shows its monthly revenue against its monthly spend, best first', () => {
  const rows = channelRoi([{ channel: 'meta', amount: 1200 }, { channel: 'google', amount: 600 }], { meta: 100, google: 100 });
  assert.equal(rows[0].channel, 'meta');
  assert.equal(rows[0].roi, 1);
  assert.equal(rows[1].roi, 0.5);
});

t('a budget suggestion needs two funded channels, and names the move', () => {
  const rows = channelRoi([{ channel: 'meta', amount: 2400 }, { channel: 'google', amount: 600 }], { meta: 100, google: 100 });
  assert.match(budgetSuggestion(rows), /moving about 10% of google spend to meta/);
  assert.equal(budgetSuggestion(channelRoi([{ channel: 'meta', amount: 2400 }], { meta: 100 })), null);
});

t('customer value is averaged by where the customer came from', () => {
  const r = ltvBySource([{ email: 'a@x.com', source: 'referral' }, { email: 'b@x.com', source: 'meta' }, { email: 'c@x.com', source: 'referral' }], { 'a@x.com': 300, 'b@x.com': 100, 'c@x.com': 200 });
  assert.equal(r[0].source, 'referral');
  assert.equal(r[0].averageLtv, 250);
});

t('spend is read from "channel: amount" lines; bad lines are ignored', () => {
  assert.deepEqual(parseSpend('Meta: 300\nGoogle: 1,500\nnonsense'), { meta: 300, google: 1500 });
});

console.log(`\n${n} passed`);
