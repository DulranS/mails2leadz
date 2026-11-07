// Google Ads purchase conversions (Pass 179): consented buyers only, hashed, with the owner's conversion action.
import assert from 'node:assert/strict';
import { googleConversionsBody } from '../lib/google-purchases.js';
import { hashEmail } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Google conversion is sent for a consented buyer and a new paid invoice, hashed, with the time, value and action', () => {
  const invoices = [
    { email: 'Ann@x.com', status: 'paid', paidAt: '2026-11-04T10:30:00Z', amountPaid: 80, chargeCurrency: 'eur' },
    { email: 'bob@x.com', status: 'paid', paidAt: '2026-11-04T10:30:00Z', amountPaid: 50 },
  ];
  const b = googleConversionsBody({ invoices, consentedEmails: new Set(['ann@x.com']), since: Date.parse('2026-11-01T00:00:00Z'), conversionAction: 'customers/1/conversionActions/9' });
  assert.equal(b.conversions.length, 1);
  const c = b.conversions[0];
  assert.equal(c.conversionAction, 'customers/1/conversionActions/9');
  assert.equal(c.conversionDateTime, '2026-11-04 10:30:00+00:00');
  assert.equal(c.conversionValue, 80);
  assert.equal(c.currencyCode, 'EUR');
  assert.equal(c.userIdentifiers[0].hashedEmail, hashEmail('ann@x.com'));
  assert.equal(b.partialFailure, true);
  assert.doesNotMatch(JSON.stringify(b), /@x\.com/);
});

console.log(`\n${n} passed`);
