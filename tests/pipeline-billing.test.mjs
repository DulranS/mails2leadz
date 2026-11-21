// Pipeline Billing column and customers' points: the summary is checked directly (pure), the rest on the source.
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { billingSummaryByEmail } from '../lib/billing.js';
const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');
const money = (n) => `LKR ${n.toFixed(2)}`;
const now = Date.parse('2026-11-21T00:00:00Z');
const day = 86400000;

const s = billingSummaryByEmail([
  { email: 'Late@Example.com', amount: 1000, status: 'open', dueAt: new Date(now - 10 * day).toISOString() },   // overdue
  { email: 'open@example.com', amount: 500, status: 'open', dueAt: new Date(now + 10 * day).toISOString() },    // owed, not due
  { email: 'part@example.com', amount: 800, amountPaid: 300, status: 'partial', dueAt: new Date(now + day).toISOString() }, // 500 owed
  { email: 'paid@example.com', amount: 900, status: 'paid' },                                                     // paid by mark-paid (no amountPaid set)
  { email: 'void@example.com', amount: 700, status: 'void' },                                                     // void: left out entirely
  { email: 'mix@example.com', amount: 200, status: 'paid' },
  { email: 'mix@example.com', amount: 300, status: 'open', dueAt: new Date(now - 2 * day).toISOString() },        // overdue, makes the customer overdue
], { now, money });

assert.equal(s['late@example.com'].text, 'Overdue LKR 1000.00');
assert.equal(s['late@example.com'].tone, 'red', 'case-insensitive key, overdue is red');
assert.equal(s['open@example.com'].text, 'Owed LKR 500.00');
assert.equal(s['open@example.com'].tone, 'amber');
assert.equal(s['part@example.com'].text, 'Owed LKR 500.00', 'part payment leaves the rest owed');
assert.equal(s['paid@example.com'].text, 'Paid', 'marked-paid invoice counts as paid (balance zero)');
assert.equal(s['paid@example.com'].tone, 'green');
assert.equal(s['void@example.com'], undefined, 'a void-only customer has no billing line');
assert.equal(s['mix@example.com'].text, 'Overdue LKR 300.00', 'only the owed part of each invoice counts');
assert.deepEqual(billingSummaryByEmail([]), {});
assert.deepEqual(billingSummaryByEmail(null), {});

const crm = read('app/crm/page.js');
assert.match(crm, /getInvoices\(db, user\.uid\)\.catch/, 'pipeline loads invoices');
assert.match(crm, /billingSummaryByEmail\(\(invoicesSnap/, 'summary built from them');
assert.match(crm, /billingByEmail=\{data\.billingByEmail \|\| \{\}\}/, 'passed to the table');
const table = read('app/components/CRM.js');
assert.match(table, /key: "billing"/); assert.match(table, /No invoice/);
assert.match(table, /billingByEmail\[lead\.email\]/);
const cust = read('app/customers/page.js');
assert.match(cust, /\/api\/loyalty\?emails=/, 'one request for the visible customers');
assert.match(cust, /points\[lower\(c\.email\)\] > 0/, 'points shown per row');
const route = read('app/api/loyalty/route.js');
assert.match(route, /sp\.has\('emails'\)/); assert.match(route, /slice\(0, 100\)/, 'capped at 100');
assert.match(route, /const EMAIL = \/\^\[\^\\s@\]\+@/, 'email check escaped correctly');
console.log('pipeline billing ok');
