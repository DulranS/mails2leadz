// Retention (v389): the share of customers who paid in the last 12 months and have paid more than once. Run: node tests/retention-share.test.mjs
import assert from 'node:assert/strict';
import { repeatShare, economics } from '../lib/kpi-economics.js';

const NOW = Date.parse('2026-11-24T00:00:00Z');
const YEAR = NOW - 365 * 86400000;
const inv = (email, paidAt, extra = {}) => ({ email, status: 'paid', amountPaid: 100, paidAt: new Date(paidAt).toISOString(), ...extra });
const recent = NOW - 30 * 86400000;
const old = NOW - 400 * 86400000;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a customer who paid twice (one of them in the last year) is a repeat customer', () => {
  const r = repeatShare([inv('ana@x.lk', recent), inv('ana@x.lk', old)], YEAR);
  assert.deepEqual(r, { activeCustomers12m: 1, repeatCustomers12m: 1, retentionPct: 100 });
});

t('a customer who paid once is not a repeat customer', () => {
  const r = repeatShare([inv('bob@x.lk', recent), inv('cy@x.lk', recent), inv('cy@x.lk', recent + 1000)], YEAR);
  assert.equal(r.activeCustomers12m, 2);
  assert.equal(r.repeatCustomers12m, 1);
  assert.equal(r.retentionPct, 50);
});

t('customers who have not paid in the last year are not counted at all', () => {
  const r = repeatShare([inv('old@x.lk', old), inv('old@x.lk', old - 1000)], YEAR);
  assert.deepEqual(r, { activeCustomers12m: 0, repeatCustomers12m: 0, retentionPct: null });
});

t('unpaid, void and emailless invoices do not count; email matching ignores case and spaces', () => {
  const r = repeatShare([
    inv('Dee@X.lk ', recent), inv('dee@x.lk', recent),
    { email: 'eve@x.lk', status: 'sent', amountPaid: 0, total: 100, paidAt: '' },
    { email: 'fay@x.lk', status: 'void', amountPaid: 100, paidAt: new Date(recent).toISOString() },
    { email: '', status: 'paid', amountPaid: 100, paidAt: new Date(recent).toISOString() },
  ], YEAR);
  assert.deepEqual(r, { activeCustomers12m: 1, repeatCustomers12m: 1, retentionPct: 100 });
});

t('no invoices gives no figure, not zero', () => {
  assert.equal(repeatShare([], YEAR).retentionPct, null);
});

t('economics() reports the retention figures alongside the other money measures', () => {
  const e = economics({ invoices: [inv('g@x.lk', recent), inv('g@x.lk', old), inv('h@x.lk', recent)], deals: [], leads: [], now: NOW });
  assert.equal(e.retentionPct, 50);
  assert.equal(e.repeatCustomers12m, 1);
  assert.equal(e.activeCustomers12m, 2);
});

console.log(`\nretention-share: ${n} passed`);
