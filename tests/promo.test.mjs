// Discount codes: the code format, what the owner can save, and how a code changes a price (never to zero, never past its limits).
import assert from 'node:assert/strict';
import { normalizeCode, sanitizePromo, evaluatePromo, discountInvoice } from '../lib/promo.js';

assert.equal(normalizeCode('spring 25'), 'SPRING25', 'spaces removed, upper-cased');
assert.equal(normalizeCode('ab'), '', 'too short');
assert.equal(normalizeCode('a-b-c'), '', 'dashes not allowed');

const now = Date.parse('2026-06-01T00:00:00Z');
assert.equal(sanitizePromo({ code: 'x', type: 'percent', value: 10 }, now).ok, false, 'short code refused');
assert.match(sanitizePromo({ code: 'SAVE', type: 'percent', value: 150 }, now).error, /cannot be more than 100/);
assert.equal(sanitizePromo({ code: 'SAVE', type: 'fixed', value: 0 }, now).ok, false, 'zero discount refused');
assert.equal(sanitizePromo({ code: 'SAVE', type: 'percent', value: 10, maxUses: 0 }, now).ok, false, 'zero uses refused');
assert.match(sanitizePromo({ code: 'SAVE', type: 'percent', value: 10, validTo: '2020-01-01' }, now).error, /in the past/);
assert.match(sanitizePromo({ code: 'SAVE', type: 'percent', value: 10, validFrom: '2026-09-01', validTo: '2026-08-01' }, now).error, /after the start/);
const good = sanitizePromo({ code: 'spring25', type: 'percent', value: '25', minAmount: '', maxUses: '50', validTo: '2027-01-01', oncePerCustomer: true }, now);
assert.equal(good.ok, true);
assert.equal(good.value.code, 'SPRING25');
assert.equal(good.value.value, 25);
assert.equal(good.value.maxUses, 50);
assert.equal(good.value.active, true);

// Percent: 10% of 99.99 is 10.00 (rounded to cents); the total is what the customer pays.
const pct = evaluatePromo({ code: 'TEN', type: 'percent', value: 10, active: true }, { amount: 99.99, now });
assert.deepEqual([pct.discount, pct.total], [10, 89.99]);
// Percent with awkward cents: 33% of 33.33 rounds to 11.00.
assert.deepEqual(evaluatePromo({ code: 'T', type: 'percent', value: 33, active: true }, { amount: 33.33, now }).total, 22.33);
// Fixed: taken off the price. A fixed amount that would make the price zero or less is refused.
assert.equal(evaluatePromo({ code: 'F', type: 'fixed', value: 20, active: true }, { amount: 50, now }).total, 30);
assert.match(evaluatePromo({ code: 'F', type: 'fixed', value: 60, active: true }, { amount: 50, now }).error, /zero/);

// The rules that limit a code.
const base = { code: 'L', type: 'percent', value: 10, active: true };
assert.match(evaluatePromo({ ...base, active: false }, { amount: 50, now }).error, /not active/);
assert.match(evaluatePromo({ ...base, minAmount: 60 }, { amount: 50, now }).error, /at least 60/);
assert.match(evaluatePromo({ ...base, validFrom: '2026-07-01T00:00:00Z' }, { amount: 50, now }).error, /not valid yet/);
assert.match(evaluatePromo({ ...base, validTo: '2026-05-01T00:00:00Z' }, { amount: 50, now }).error, /expired/);
assert.match(evaluatePromo({ ...base, maxUses: 5 }, { amount: 50, now, usesSoFar: 5 }).error, /used up/);
assert.equal(evaluatePromo({ ...base, maxUses: 5 }, { amount: 50, now, usesSoFar: 4 }).ok, true, 'one use still left');
assert.match(evaluatePromo({ ...base, oncePerCustomer: true }, { amount: 50, now, usesByEmail: 1 }).error, /already used/);
assert.equal(evaluatePromo({ ...base, oncePerCustomer: true }, { amount: 50, now, usesByEmail: 0 }).ok, true, 'first use for this customer is fine');
assert.match(evaluatePromo(base, { amount: 0, now }).error, /nothing to discount/);

// On an unpaid invoice: the price, the tax and the total all follow the discount; the due date is not touched.
const inv = { id: 'i1', userId: 'u1', email: 'a@x.com', businessName: 'Acme', amount: 100, taxAmount: 10, total: 110, status: 'open', amountPaid: 0, note: 'Consulting' };
const pct10 = { code: 'TEN', type: 'percent', value: 10, active: true };
const applied = discountInvoice(inv, pct10, { taxRate: 10, now });
assert.equal(applied.ok, true, 'an unpaid invoice takes a code');
assert.equal(applied.discount, 10);
assert.equal(applied.patch.promoCode, 'TEN');
assert.equal(applied.patch.listAmount, 100, 'the list price is kept for the record');
assert.equal(applied.patch.amount, 90, 'the amount drops by the discount');
assert.equal(applied.patch.total, applied.total, 'the total matches what the customer will pay');
assert.equal(applied.patch.discount, 10);
assert.equal(applied.patch.dueAt, undefined, 'the due date is not changed');
assert.match(discountInvoice({ ...inv, amountPaid: 20 }, pct10, { taxRate: 10, now }).error, /before any payment/);
assert.match(discountInvoice({ ...inv, status: 'paid' }, pct10, { taxRate: 10, now }).error, /already settled/);
assert.match(discountInvoice({ ...inv, promoCode: 'OLD' }, pct10, { taxRate: 10, now }).error, /already has a discount/);
assert.match(discountInvoice(inv, { ...pct10, active: false }, { taxRate: 10, now }).error, /not active/);
assert.match(discountInvoice(inv, { ...pct10, oncePerCustomer: true }, { taxRate: 10, now, usesByEmail: 1 }).error, /already used/, 'once per customer holds on invoices too');

console.log('promo tests: all passed');
