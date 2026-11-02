// Customer statement: balances, aging, voided and other-customer invoices, credit notes, and the expiring link.
import assert from 'node:assert/strict';
import { buildStatement, agingOf } from '../lib/statement.js';
import { signStatementToken, verifyStatementToken } from '../lib/statement-token.js';

const invoices = [
  { id: 'i1', email: 'A@x.com', number: 'INV-1', amount: 100, total: 110, taxAmount: 10, status: 'partial', amountPaid: 50, issuedAt: '2026-01-01T00:00:00Z', dueAt: '2026-01-15T00:00:00Z' },
  { id: 'i2', email: 'a@x.com', number: 'INV-2', amount: 200, total: 200, status: 'paid', amountPaid: 200, issuedAt: '2026-02-01T00:00:00Z', paidAt: '2026-02-10T00:00:00Z' },
  { id: 'i3', email: 'a@x.com', number: 'INV-3', amount: 999, total: 999, status: 'void', issuedAt: '2026-03-01T00:00:00Z' },
  { id: 'i9', email: 'b@x.com', number: 'INV-9', amount: 50, total: 50, status: 'open', issuedAt: '2026-01-05T00:00:00Z', dueAt: '2026-01-20T00:00:00Z' },
];
const credits = [{ customerEmail: 'a@x.com', number: 'CN-1', amount: 20, reason: 'Revision', status: 'open', issuedAt: '2026-02-20T00:00:00Z' }];
const now = Date.parse('2026-02-20T12:00:00Z');
const s = buildStatement({ invoices, credits, customerEmail: 'a@x.com', customerName: 'Acme', now });

// Totals agree with the invoice list: billed 110 + 200, paid 50 + 200, credited 20.
assert.equal(s.totals.billed, 310);
assert.equal(s.totals.paid, 250);
assert.equal(s.totals.credited, 20);
assert.equal(s.totals.outstanding, 40, 'outstanding = billed - paid - credited');
assert.equal(s.lines[s.lines.length - 1].balance, 40, 'the running balance ends at the outstanding amount');

// Voided and other-customer invoices never appear; the statement is for one customer only.
assert.ok(!s.lines.some((l) => l.ref === 'INV-3'), 'voided invoice left out');
assert.ok(!s.lines.some((l) => l.ref === 'INV-9'), 'another customer is left out');
assert.equal(s.customerEmail, 'a@x.com');

// Lines are in date order, and a payment is dated by its paid date (or the issue date when none was recorded).
const dates = s.lines.map((l) => l.date);
assert.deepEqual(dates, [...dates].sort(), 'lines sorted by date');
assert.ok(s.lines.some((l) => l.type === 'Payment' && l.date === '2026-02-10'), 'paid invoice dated by its paid date');
assert.ok(s.lines.some((l) => /date not recorded/.test(l.description)), 'part payment without a paid date is marked');

// Aging: the 110 invoice has 60 still owed and is 36 days past due on 20 Feb, so it sits in 31 to 60 days.
assert.equal(s.aging.days31to60, 60);
assert.equal(s.aging.current, 0);
assert.equal(s.openInvoices.length, 1);
assert.equal(s.openInvoices[0].balance, 60);

// A credit larger than the bill leaves a credit balance owed to the customer.
const over = buildStatement({ invoices: [{ email: 'c@x.com', number: 'INV-7', amount: 30, total: 30, status: 'paid', amountPaid: 30, issuedAt: '2026-01-01T00:00:00Z', paidAt: '2026-01-02T00:00:00Z' }], credits: [{ customerEmail: 'c@x.com', amount: 10, number: 'CN-2', issuedAt: '2026-01-03T00:00:00Z' }], customerEmail: 'c@x.com', now });
assert.equal(over.totals.outstanding, -10);
assert.equal(over.creditBalance, 10);

// agingOf buckets: not yet due, 1 to 30 days, and over 90 days.
const aged = agingOf([
  { total: 100, amount: 100, status: 'open', dueAt: '2026-03-01T00:00:00Z' },
  { total: 50, amount: 50, status: 'open', dueAt: '2026-02-10T00:00:00Z' },
  { total: 25, amount: 25, status: 'open', dueAt: '2025-10-01T00:00:00Z' },
], Date.parse('2026-02-20T00:00:00Z'));
assert.equal(aged.current, 100);
assert.equal(aged.days1to30, 50);
assert.equal(aged.over90, 25);

// The link: valid until it expires; forged, altered, and expired links are refused.
const key = 'statement-test-key-1234567890';
const now2 = Date.parse('2026-06-01T00:00:00Z');
const tok = signStatementToken('uid1', 'Buyer@Example.com', { now: now2, k: key });
assert.deepEqual(verifyStatementToken(tok, { now: now2 + 86400000, k: key }), { uid: 'uid1', email: 'buyer@example.com', expiresAt: now2 + 90 * 86400000 }, 'valid link verifies, email normalised');
assert.equal(verifyStatementToken(tok, { now: now2 + 91 * 86400000, k: key }), null, 'expired after 90 days');
assert.equal(verifyStatementToken(tok, { now: now2, k: 'another-key-altogether-000000' }), null, 'wrong key refused');
const [, sg] = tok.split('.');
const forged = Buffer.from(JSON.stringify({ u: 'uid2', e: 'buyer@example.com', x: now2 + 1e10 })).toString('base64url');
assert.equal(verifyStatementToken(`${forged}.${sg}`, { now: now2, k: key }), null, 'changed account refused');
assert.equal(verifyStatementToken('nonsense', { now: now2, k: key }), null);

console.log('statement tests: all passed');
