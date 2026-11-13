// Paid versus signed (Pass 237): cash received in the last year is counted from paid invoices only, separate from signed (won) deals.
import assert from 'node:assert/strict';
import { economics } from '../lib/kpi-economics.js';

const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');
const invoices = [
  { status: 'paid', email: 'a@x.com', amountPaid: 300, paidAt: new Date(now - 10 * DAY).toISOString() },
  { status: 'paid', email: 'b@x.com', amountPaid: 200, paidAt: new Date(now - 20 * DAY).toISOString() },
  { status: 'sent', email: 'c@x.com', amountPaid: 999, paidAt: '' },
];
const e = economics({ invoices, deals: [{ stage: 'closed_won', value: 5000, stageTimes: { closed_won: new Date(now - 5 * DAY).toISOString() } }], now });
assert.equal(e.paidRevenueLast12Months, 500);
console.log('\n  ok - cash received counts paid invoices only; signed deals are not counted as cash');
console.log('\n1 passed');
