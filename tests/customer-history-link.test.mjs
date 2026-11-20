// Customer row -> history link (pass 335). Run: node tests/customer-history-link.test.mjs
import assert from 'node:assert/strict';
import { historyHref } from '../lib/customer-history-link.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('a valid email becomes the history link, lower-cased and encoded', () => {
  assert.equal(historyHref(' Ann+1@X.com '), '/history?email=ann%2B1%40x.com');
});

t('anything that is not an email gives the plain history page', () => {
  assert.equal(historyHref(''), '/history');
  assert.equal(historyHref(undefined), '/history');
  assert.equal(historyHref('ann@x.com&evil=1'), '/history');
  assert.equal(historyHref('a b@x.com'), '/history');
  assert.equal(historyHref('no-at-sign'), '/history');
});

console.log(`customer history link: ${n} checks passed`);
