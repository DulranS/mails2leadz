import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceWrite } from '../lib/billing.js';
import { invoiceEmailText } from '../lib/billing-automation.js';

const base = { uid: 'u1', email: 'client@example.com', businessName: 'Client', amount: 1000, now: new Date('2026-10-20T06:00:00Z') };

test('with no tax rate, the invoice is unchanged: no tax, total equals the price', () => {
  const r = buildInvoiceWrite(base);
  assert.equal(r.ok, true);
  assert.equal(r.write.amount, 1000);
  assert.equal(r.write.taxAmount, 0);
  assert.equal(r.write.total, 1000);
});

test('with a tax rate, the price stays net and the tax and total are recorded', () => {
  const r = buildInvoiceWrite({ ...base, taxRate: 15 });
  assert.equal(r.write.amount, 1000);
  assert.equal(r.write.taxAmount, 150);
  assert.equal(r.write.total, 1150);
});

test('tax is rounded to cents and the rate is kept within 0 to 30', () => {
  assert.equal(buildInvoiceWrite({ ...base, amount: 12.345, taxRate: 15 }).write.taxAmount, 1.85);
  assert.equal(buildInvoiceWrite({ ...base, taxRate: 90 }).write.taxRate, 30);
  assert.equal(buildInvoiceWrite({ ...base, taxRate: -5 }).write.taxRate, 0);
});

test('the invoice email shows the tax and the total only when there is tax', () => {
  const withTax = invoiceEmailText({ name: 'Ann', amount: 1000, currency: 'USD', dueAt: '2026-11-03T00:00:00Z', taxAmount: 150, total: 1150 });
  assert.ok(withTax.body.includes('plus tax'));
  assert.ok(withTax.body.includes('total'));
  const noTax = invoiceEmailText({ name: 'Ann', amount: 1000, currency: 'USD', dueAt: '2026-11-03T00:00:00Z' });
  assert.ok(!noTax.body.includes('plus tax'));
});
