import test from 'node:test';
import assert from 'node:assert/strict';
import { planWonInvoices, WON_LOOKBACK_DAYS } from '../lib/billing-automation.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 6);
const won = (o = {}) => ({ stage: 'closed_won', email: 'Client@Example.com', businessName: 'Client Ltd', value: 500, valueIsEstimate: false, closedAt: new Date(NOW - 2 * DAY).toISOString(), ...o });

test('a recently won one-off sale gets exactly one invoice', () => {
  const first = planWonInvoices({ uid: 'u1', deals: [won()], invoices: [], now: NOW });
  assert.equal(first.length, 1);
  assert.equal(first[0].write.amount, 500);
  assert.equal(first[0].to, 'client@example.com');
  assert.equal(first[0].write.dealKey, 'won:client@example.com:' + new Date(NOW - 2 * DAY).toISOString().slice(0, 10));
  // the invoice carries its deal key, so the next run does not raise it again
  assert.equal(planWonInvoices({ uid: 'u1', deals: [won()], invoices: [first[0].write], now: NOW }).length, 0);
});

test('estimates, subscriptions, zero values and missing emails are not invoiced automatically', () => {
  const deals = [
    won({ valueIsEstimate: true }),
    won({ recurringMonthly: 99 }),
    won({ value: 0 }),
    won({ email: '' }),
    won({ stage: 'contacted' }),
  ];
  assert.equal(planWonInvoices({ uid: 'u1', deals, invoices: [], now: NOW }).length, 0);
});

test('switching the feature on never invoices old history', () => {
  const old = won({ closedAt: new Date(NOW - (WON_LOOKBACK_DAYS + 5) * DAY).toISOString() });
  assert.equal(planWonInvoices({ uid: 'u1', deals: [old], invoices: [], now: NOW }).length, 0);
});

test('a win already invoiced by hand (same customer, same amount, around the win date) is left alone', () => {
  const manual = { email: 'client@example.com', amount: 500, issuedAt: new Date(NOW - 1 * DAY).toISOString() };
  assert.equal(planWonInvoices({ uid: 'u1', deals: [won()], invoices: [manual], now: NOW }).length, 0);
});
