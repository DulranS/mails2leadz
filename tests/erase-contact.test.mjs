// Erasing one contact: what counts as their data, what is scrubbed rather than deleted, and what is deliberately kept.
import assert from 'node:assert/strict';
import { cleanEmail, emailHash, holdsEmail, sentEmailScrub, SCAN_COLLECTIONS, RETAINED, ERASE_CONFIRM } from '../lib/erase-contact.js';

assert.equal(cleanEmail('  Buyer@Example.COM '), 'buyer@example.com', 'address is cleaned');
assert.equal(cleanEmail('no-at-sign'), '', 'not an address: refused');
assert.equal(cleanEmail('a b@example.com'), '', 'spaces refused');

// The audit fingerprint is stable per account and does not contain the address.
const h = emailHash('u1', 'buyer@example.com');
assert.equal(h, emailHash('u1', 'BUYER@example.com'), 'same person, same fingerprint');
assert.notEqual(h, emailHash('u2', 'buyer@example.com'), 'a different account gets a different fingerprint');
assert.ok(!h.includes('buyer'), 'fingerprint holds no part of the address');

// Matching looks at every text value, at the top level and in lists, ignoring case.
assert.equal(holdsEmail({ to: 'Buyer@example.com', body: 'hi' }, 'buyer@example.com'), true, 'top-level field, any case');
assert.equal(holdsEmail({ recipients: ['x@a.com', 'buyer@example.com'] }, 'buyer@example.com'), true, 'inside a list');
assert.equal(holdsEmail({ body: 'write to buyer@example.com please' }, 'buyer@example.com'), false, 'only an exact address counts, not text that mentions it');
assert.equal(holdsEmail({ to: 'other@example.com' }, 'buyer@example.com'), false, 'a different address does not match');

// A sent email keeps its counts and dates, and loses everything that identifies the person.
const scrub = sentEmailScrub(new Date('2026-11-02T10:00:00Z'));
assert.equal(scrub.to, 'erased');
assert.equal(scrub.body, '');
assert.equal(scrub.businessName, '');
assert.equal(scrub.erasedAt, '2026-11-02T10:00:00.000Z');
assert.ok(!('sentAt' in scrub) && !('opened' in scrub), 'counts and dates are not touched');

// Invoices, credit notes and the opt-out record are never on the scan list; each kept item has a reason.
assert.equal(SCAN_COLLECTIONS.includes('invoices'), false, 'invoices are not erased');
assert.equal(SCAN_COLLECTIONS.includes('credit_notes'), false, 'credit notes are not erased');
assert.equal(SCAN_COLLECTIONS.includes('suppressions'), false, 'the opt-out record is kept');
for (const k of ['invoices', 'credit_notes', 'suppressions']) assert.ok(RETAINED[k] && RETAINED[k].length > 10, `${k} has a stated reason`);
assert.equal(ERASE_CONFIRM, 'ERASE', 'the confirmation word is fixed');

console.log('erase-contact tests: all passed');
