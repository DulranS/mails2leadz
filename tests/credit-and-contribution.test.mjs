// Credit risk and contribution (Pass 238): unpaid invoices past their limit are grouped by customer; a sale's contribution is what is left after the cost of delivering it.
import assert from 'node:assert/strict';
import { creditRisk } from '../lib/credit-risk.js';
import { priceQuote } from '../lib/pricing.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('unpaid invoices older than thirty days are grouped by customer, oldest first; paid and recent ones are left out', () => {
  const r = creditRisk([
    { email: 'a@x.com', total: 300, status: 'sent', issuedAt: new Date(now - 45 * DAY).toISOString() },
    { email: 'a@x.com', total: 200, status: 'sent', issuedAt: new Date(now - 60 * DAY).toISOString() },
    { email: 'b@x.com', total: 999, status: 'paid', issuedAt: new Date(now - 90 * DAY).toISOString() },
    { email: 'c@x.com', total: 50, status: 'sent', issuedAt: new Date(now - 5 * DAY).toISOString() },
  ], now);
  assert.equal(r.length, 1);
  assert.equal(r[0].email, 'a@x.com');
  assert.equal(r[0].owed, 500);
  assert.equal(r[0].oldestDays, 60);
  assert.equal(r[0].invoices, 2);
});

t('a sale\'s contribution is what is left after the cost of delivering it, before tax', () => {
  const q = priceQuote({ unitPrice: 100, quantity: 2, discountPct: 10, taxPct: 20, costPerUnit: 40 });
  assert.equal(q.ok, true);
  assert.equal(q.contribution, 100);
  assert.equal(q.contributionPct, 55.56);
});

t('without a cost entered, no contribution is shown rather than a made-up one', () => {
  assert.equal(priceQuote({ unitPrice: 100, quantity: 1 }).contribution, undefined);
});

console.log(`\n${n} passed`);
