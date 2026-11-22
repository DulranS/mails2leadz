// New customers for CAC (lib/kpi-economics.js): a customer counts once, from their first paid invoice or first won deal, inside the last 12 months. Pure. Run: node --test tests/kpi-new-customers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { economics } from '../lib/kpi-economics.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 22);
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const inv = (email, daysAgo, amount = 50) => ({ status: 'paid', email, amountPaid: amount, paidAt: ago(daysAgo) });
const won = (email, daysAgo, value = 500) => ({ stage: 'closed_won', email, value, stageTimes: { closed_won: ago(daysAgo) } });
const newCount = (o) => economics({ now: NOW, monthlySpend: 1000, ...o }).newCustomersLast12Months;

test('a repeat buyer whose first purchase was over 12 months ago is not new', () => {
  assert.equal(newCount({ invoices: [inv('old@x.com', 400), inv('old@x.com', 30)] }), 0);
});

test('a first purchase inside the last 12 months is new, however many times they buy', () => {
  assert.equal(newCount({ invoices: [inv('new@x.com', 200), inv('new@x.com', 20), inv('new@x.com', 5)] }), 1);
});

test('one customer with both a paid invoice and a won deal counts once', () => {
  assert.equal(newCount({ invoices: [inv('both@x.com', 100)], deals: [won('both@x.com', 90)] }), 1);
});

test('a customer who was already paying before the window and wins a deal now is not new', () => {
  assert.equal(newCount({ invoices: [inv('back@x.com', 500)], deals: [won('back@x.com', 30)] }), 0);
});

test('two different customers count as two', () => {
  assert.equal(newCount({ invoices: [inv('a@x.com', 10), inv('b@x.com', 20)] }), 2);
});

test('a won deal with no email counts as its own customer', () => {
  assert.equal(newCount({ deals: [{ stage: 'closed_won', value: 300, stageTimes: { closed_won: ago(15) } }] }), 1);
});

test('an invoice with no paid date cannot show a first purchase, so it is not counted', () => {
  assert.equal(newCount({ invoices: [{ status: 'paid', email: 'nodate@x.com', amountPaid: 40 }] }), 0);
});

test('CAC is monthly spend times 12 over the new customers', () => {
  const e = economics({ now: NOW, monthlySpend: 1000, invoices: [inv('a@x.com', 10), inv('b@x.com', 20), inv('old@x.com', 400), inv('old@x.com', 30)] });
  assert.equal(e.newCustomersLast12Months, 2);
  assert.equal(e.cac, 6000);
});
