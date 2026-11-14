// Payment metrics (Pass 245): days sales outstanding from paid invoices in the last year; won deals with no invoice yet.
import assert from 'node:assert/strict';
import { daysSalesOutstanding, wonNotInvoiced } from '../lib/payment-metrics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('days sales outstanding is the average days from issue to payment, for paid invoices in the last year', () => {
  const inv = [
    { status: 'paid', issuedAt: new Date(now - 40 * DAY).toISOString(), paidAt: new Date(now - 20 * DAY).toISOString() },
    { status: 'paid', issuedAt: new Date(now - 30 * DAY).toISOString(), paidAt: new Date(now - 10 * DAY).toISOString() },
    { status: 'sent', issuedAt: new Date(now - 30 * DAY).toISOString() },
  ];
  assert.equal(daysSalesOutstanding(inv, now), 20);
  assert.equal(daysSalesOutstanding([], now), null);
});

t('a won deal with no invoice to that customer since it was won is flagged; one already invoiced is not', () => {
  const won = now - 5 * DAY;
  const deals = [
    { stage: 'closed_won', email: 'a@x.com', stageTimes: { closed_won: new Date(won).toISOString() } },
    { stage: 'closed_won', email: 'b@x.com', stageTimes: { closed_won: new Date(won).toISOString() } },
  ];
  const invoices = [{ email: 'b@x.com', issuedAt: new Date(now - 1 * DAY).toISOString() }];
  assert.deepEqual(wonNotInvoiced(deals, invoices, now).map((d) => d.email), ['a@x.com']);
});

console.log(`\n${n} passed`);
