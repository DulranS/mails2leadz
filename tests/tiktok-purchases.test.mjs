// TikTok purchase events (Pass 178): consented customers' paid invoices only, hashed, in TikTok's web-event shape.
import assert from 'node:assert/strict';
import { tiktokPurchaseBody } from '../lib/tiktok-purchases.js';
import { hashEmail } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a TikTok purchase is sent only for a consented buyer and a new paid invoice, with a hashed email and the amount', () => {
  const invoices = [
    { email: 'Ann@x.com', status: 'paid', paidAt: '2026-11-04T10:00:00Z', amountPaid: 80, chargeCurrency: 'usd' },
    { email: 'bob@x.com', status: 'paid', paidAt: '2026-11-04T10:00:00Z', amountPaid: 50 },
    { email: 'ann@x.com', status: 'paid', paidAt: '2026-10-01T10:00:00Z', amountPaid: 9 },
  ];
  const body = tiktokPurchaseBody({ invoices, consentedEmails: new Set(['ann@x.com']), since: Date.parse('2026-11-01T00:00:00Z'), pixelCode: 'PIX1' });
  assert.equal(body.event_source, 'web');
  assert.equal(body.event_source_id, 'PIX1');
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].event, 'CompletePayment');
  assert.equal(body.data[0].user.email, hashEmail('ann@x.com'));
  assert.deepEqual(body.data[0].properties, { value: 80, currency: 'USD' });
  assert.doesNotMatch(JSON.stringify(body), /@x\.com/);
});

console.log(`\n${n} passed`);
