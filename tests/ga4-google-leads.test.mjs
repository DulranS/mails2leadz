// GA4 conversions (no customer data) and Google Ads lead forms (shared key, then the inbox). Off until their server settings are set.
import assert from 'node:assert/strict';
import { ga4Ready, ga4Body, businessClientId, GA4_EVENTS } from '../lib/ga4.js';
import { googleKeyOk, leadFromGoogle } from '../lib/google-leads.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('GA4 is off until both settings exist', () => {
  assert.equal(ga4Ready({}), false);
  assert.equal(ga4Ready({ GA4_MEASUREMENT_ID: 'G-1' }), false);
  assert.equal(ga4Ready({ GA4_MEASUREMENT_ID: 'G-1', GA4_API_SECRET: 's' }), true);
});

t('a payment is sent as a purchase with value and currency, and carries no customer data', () => {
  const b = ga4Body({ uid: 'owner1', event: 'payment.received', data: { amount: 120.456, email: 'ann@example.com', name: 'Ann' }, currency: 'eur' });
  assert.equal(b.events[0].name, 'purchase');
  assert.deepEqual(b.events[0].params, { currency: 'EUR', value: 120.46 });
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /ann@example\.com|Ann/);
});

t('the business id is stable per owner and is not the owner id itself', () => {
  assert.equal(businessClientId('owner1'), businessClientId('owner1'));
  assert.notEqual(businessClientId('owner1'), businessClientId('owner2'));
  assert.doesNotMatch(businessClientId('owner1'), /owner1/);
});

t('only mapped events are sent; an unmapped one is skipped', () => {
  assert.equal(ga4Body({ uid: 'u', event: 'reply.hot', data: {} }), null);
  assert.deepEqual(Object.keys(GA4_EVENTS).sort(), ['booking.confirmed', 'enquiry.received', 'payment.received', 'quote.accepted']);
  assert.equal(ga4Body({ uid: 'u', event: 'quote.accepted', data: {} }).events[0].name, 'quote_accepted');
});

t('a Google lead form submission is accepted only with the shared key', () => {
  const p = { google_key: 'k-123', campaign_id: '42' };
  assert.equal(googleKeyOk(p, 'k-123'), true);
  assert.equal(googleKeyOk(p, 'k-124'), false);
  assert.equal(googleKeyOk({}, 'k-123'), false);
  assert.equal(googleKeyOk(p, ''), false);
});

t('Google question columns map to the inbox lead; no email means no lead', () => {
  const lead = leadFromGoogle({
    campaign_id: '42',
    user_column_data: [
      { column_id: 'FULL_NAME', string_value: 'Ann Lee' },
      { column_id: 'EMAIL', string_value: 'ann@example.com' },
      { column_id: 'PHONE_NUMBER', string_value: '+447700900000' },
      { column_id: 'COMPANY_NAME', string_value: 'Ann Ltd' },
    ],
  });
  assert.deepEqual(lead, { email: 'ann@example.com', first_name: 'Ann', last_name: 'Lee', phone_primary: '+447700900000', business_name: 'Ann Ltd', campaign: 'google-lead-form 42' });
  assert.equal(leadFromGoogle({ user_column_data: [{ column_id: 'FULL_NAME', string_value: 'No Email' }] }), null);
});

console.log(`\n${n} passed`);
