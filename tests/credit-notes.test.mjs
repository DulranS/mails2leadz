// Credit notes: numbering, the record written for a revised quote, allowed settlements, and what is still owed.
import assert from 'node:assert/strict';
import { formatCreditNumber, buildCreditNote, settleCredit, outstandingCredit, CREDIT_STATUS } from '../lib/credit-notes.js';

assert.equal(formatCreditNumber(1), 'CN-0001');
assert.equal(formatCreditNumber(42), 'CN-0042');

const quote = { customerEmail: 'Buyer@Example.com ', customerName: 'Acme' };
assert.equal(buildCreditNote({ uid: 'u', quoteId: 'q', quote, amount: 0, number: 'CN-0001' }).ok, false, 'nothing owed: refused');
assert.equal(buildCreditNote({ uid: 'u', quoteId: 'q', quote, amount: -5, number: 'CN-0001' }).ok, false, 'negative: refused');
const built = buildCreditNote({ uid: 'u', quoteId: 'q1', quote, currency: 'USD', amount: 120.456, number: 'CN-0001', now: new Date('2026-11-02T10:00:00Z') });
assert.equal(built.ok, true);
assert.equal(built.write.amount, 120.46, 'amount rounded to cents');
assert.equal(built.write.customerEmail, 'buyer@example.com', 'email normalised');
assert.equal(built.write.status, CREDIT_STATUS.OPEN, 'a new credit note starts open');
assert.equal(built.write.quoteId, 'q1', 'references the quote it adjusts');

const open = { status: 'open', amount: 120.46 };
const held = settleCredit(open, 'hold');
assert.equal(held.ok, true, 'open can be held as credit');
assert.equal(held.patch.status, CREDIT_STATUS.HELD);
const applied = settleCredit({ status: CREDIT_STATUS.HELD }, 'apply');
assert.equal(applied.ok, true, 'held credit can be applied');
assert.equal(settleCredit({ status: CREDIT_STATUS.APPLIED }, 'refund').ok, false, 'applied credit cannot then be refunded');
assert.equal(settleCredit({ status: CREDIT_STATUS.REFUNDED }, 'hold').ok, false, 'refunded credit cannot be settled again');
assert.equal(settleCredit(open, 'bogus').ok, false, 'unknown action refused');
assert.equal(settleCredit(open, 'refund').ok, true, 'open can be refunded in cash');

assert.equal(outstandingCredit([{ status: 'open', amount: 50 }, { status: 'credit_held', amount: 25.5 }, { status: 'applied', amount: 999 }, { status: 'refunded', amount: 10 }]), 75.5, 'only open and held count as owed');

console.log('credit-notes tests: all passed');
