import fs from 'node:fs';
// v395: Australia, Canada and the UAE need recorded consent for marketing email (conservative default, per the buyer-market research).
// Singapore and the US stay opt-out. Pure. Run: node --test tests/opt-in-markets-v395.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOptInMarket, contactBasisFor, coldOutreachAllowed } from '../lib/consent-rules.js';

test('a recorded Australian, Canadian or UAE country needs consent for marketing', () => {
  for (const cc of ['au', 'ca', 'ae', 'AU']) {
    assert.equal(isOptInMarket('buyer@firm.com', cc), true, cc);
    assert.equal(contactBasisFor({ email: 'buyer@firm.com', country: cc }).marketingAllowed, false, cc);
  }
});

test('a .com.au or .ca address is read as an opt-in market when no country is recorded', () => {
  assert.equal(isOptInMarket('buyer@firm.com.au'), true);
  assert.equal(isOptInMarket('buyer@firm.ca'), true);
});

test('recorded consent still lets marketing go to an Australian contact', () => {
  assert.deepEqual(contactBasisFor({ email: 'buyer@firm.com.au', country: 'au', marketingConsent: true, consentSource: 'web form' }), { basis: 'consent', marketingAllowed: true });
});

test('Singapore and the US stay opt-out (marketing allowed with an opt-out link)', () => {
  assert.equal(isOptInMarket('buyer@firm.com', 'sg'), false);
  assert.equal(isOptInMarket('buyer@firm.com', 'us'), false);
  assert.equal(contactBasisFor({ email: 'buyer@firm.com', country: 'us' }).marketingAllowed, true);
});

test('cold outreach is held for opt-in markets and allowed elsewhere', () => {
  assert.equal(coldOutreachAllowed({ email: 'buyer@firm.co.uk' }), false);
  assert.equal(coldOutreachAllowed({ email: 'buyer@firm.com.au' }), false);
  assert.equal(coldOutreachAllowed({ email: 'buyer@firm.com', country: 'ca' }), false);
  assert.equal(coldOutreachAllowed({ email: 'buyer@firm.com', country: 'us' }), true);
  assert.equal(coldOutreachAllowed({ email: 'buyer@firm.com.sg' }), true);
});

test('the send-time check in queue-checks.js calls the cold-outreach rule', () => {
  const src = fs.readFileSync(new URL('../lib/server/queue-checks.js', import.meta.url), 'utf8');
  assert.ok(src.includes('coldOutreachAllowed({ email: q.email, country: q.country })'));
});
