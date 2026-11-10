// Corrective actions (Pass 217): a missed target produces one next step; a met target produces nothing; figures come from paid invoices.
import assert from 'node:assert/strict';
import { correctiveActions, paidFigures } from '../lib/corrective.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('a revenue target under 80% produces a next step that names the action', () => {
  const a = correctiveActions({ targets: { monthlyRevenue: 1000 }, revenueMonthly: 500 });
  assert.equal(a.length, 1);
  assert.match(a[0], /50% of your monthly target/);
  assert.match(a[0], /open deals/);
});

t('a target at or above 80% produces nothing, and an unset target is never flagged', () => {
  assert.deepEqual(correctiveActions({ targets: { monthlyRevenue: 1000 }, revenueMonthly: 800 }), []);
  assert.deepEqual(correctiveActions({ targets: {}, revenueMonthly: 10 }), []);
  assert.deepEqual(correctiveActions({ targets: { newCustomersPerMonth: 4 }, newCustomersMonthly: null }), []);
});

t('both targets can be missed, each with its own step', () => {
  const a = correctiveActions({ targets: { monthlyRevenue: 1000, newCustomersPerMonth: 4 }, revenueMonthly: 100, newCustomersMonthly: 1 });
  assert.equal(a.length, 2);
  assert.match(a[1], /source/);
});

t('the figures come from paid invoices in the last year only, and unpaid ones are left out', () => {
  const inv = [
    { status: 'paid', email: 'a@x.com', amountPaid: 1200, paidAt: new Date(now - 10 * DAY).toISOString() },
    { status: 'paid', email: 'a@x.com', amountPaid: 1200, paidAt: new Date(now - 20 * DAY).toISOString() },
    { status: 'sent', email: 'b@x.com', amountPaid: 9999, paidAt: '' },
    { status: 'paid', email: 'old@x.com', amountPaid: 9999, paidAt: new Date(now - 400 * DAY).toISOString() },
  ];
  const f = paidFigures(inv, now);
  assert.equal(f.revenueMonthly, 200);
  assert.equal(f.newCustomersMonthly, 0.1);
});

console.log(`\n${n} passed`);
