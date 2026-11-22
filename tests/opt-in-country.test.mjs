// The EU/UK opt-in rule reads the country the enquirer chose before the email domain (lib/consent-rules.js). Pure. Run: node --test tests/opt-in-country.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOptInMarket, contactBasisFor, contactPurposeFor } from '../lib/consent-rules.js';

test('a recorded EU country decides, even on a .com address', () => {
  assert.equal(isOptInMarket('buyer@firm.com', 'de'), true);
  assert.equal(isOptInMarket('buyer@firm.com', 'DE'), true, 'upper case is accepted');
  assert.equal(contactBasisFor({ email: 'buyer@firm.com', country: 'fr' }).marketingAllowed, false);
});

test('GB is read as the UK entry', () => {
  assert.equal(isOptInMarket('buyer@firm.com', 'gb'), true);
  assert.equal(isOptInMarket('buyer@firm.com', 'GB'), true);
});

test('a recorded country that is not an opt-in market wins over an EU-looking address', () => {
  assert.equal(isOptInMarket('buyer@firm.de', 'us'), false);
  assert.equal(contactBasisFor({ email: 'buyer@firm.de', country: 'us' }).marketingAllowed, true);
});

test('without a usable country the email domain decides, as before', () => {
  assert.equal(isOptInMarket('buyer@firm.de'), true);
  assert.equal(isOptInMarket('buyer@firm.com'), false);
  assert.equal(isOptInMarket('buyer@firm.de', ''), true);
  assert.equal(isOptInMarket('buyer@firm.de', 'Germany'), true, 'a name is not a code, so the address decides');
  assert.equal(isOptInMarket('buyer@firm.com', 'D'), false, 'one letter is not a code');
});

test('a recorded country gives the purpose the same way', () => {
  assert.equal(contactPurposeFor({ email: 'buyer@firm.com', country: 'it' }), 'enquiry_reply');
  assert.equal(contactPurposeFor({ email: 'buyer@firm.com', country: 'lk' }), 'enquiry_reply', 'lk is in the opt-in list (pass 340), so a recorded LK needs consent for marketing');
});

test('recorded consent still wins over the country', () => {
  assert.deepEqual(contactBasisFor({ email: 'buyer@firm.com', country: 'de', marketingConsent: true, consentSource: 'web form' }), { basis: 'consent', marketingAllowed: true });
});

test('the enquiry route passes the chosen country into both calls', () => {
  const src = readFileSync(new URL('../app/api/inbound/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes('contactBasisFor({ email: e.email, country: e.country })'));
  assert.ok(src.includes('contactPurposeFor({ email: e.email, country: e.country })'));
});
