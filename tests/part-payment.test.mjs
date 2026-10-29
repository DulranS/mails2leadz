import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceOf, recordPaymentPatch, invoiceBase, paidSoFar } from '../lib/billing.js';

const inv = { amount: 1000, status: 'open' };

test('a part payment leaves the invoice open with the balance still owed', () => {
  const r = recordPaymentPatch(inv, 400);
  assert.equal(r.ok, true);
  assert.equal(r.settled, false);
  assert.equal(r.patch.status, 'partial');
  assert.equal(r.patch.amountPaid, 400);
  assert.equal(r.balance, 600);
  assert.equal(balanceOf({ ...inv, ...r.patch }), 600);
});

test('paying the rest settles the invoice; paying more than is owed is refused', () => {
  const partial = { ...inv, amountPaid: 400, status: 'partial' };
  const done = recordPaymentPatch(partial, 600, new Date('2026-10-20T00:00:00Z'));
  assert.equal(done.settled, true);
  assert.equal(done.patch.status, 'paid');
  assert.equal(done.patch.amountPaid, 1000);
  assert.equal(recordPaymentPatch(partial, 700).ok, false);
  assert.equal(recordPaymentPatch(inv, 0).ok, false);
});

test('tax is part of what is owed, and paid and voided invoices owe nothing', () => {
  const taxed = { amount: 1000, total: 1150, status: 'open' };
  assert.equal(invoiceBase(taxed), 1150);
  assert.equal(balanceOf(taxed), 1150);
  assert.equal(balanceOf({ amount: 1000, status: 'paid' }), 0);
  assert.equal(balanceOf({ amount: 1000, status: 'void' }), 0);
  assert.equal(paidSoFar({ amountPaid: 250.5 }), 250.5);
});
