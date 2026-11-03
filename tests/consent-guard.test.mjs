// Bought lists and hashed ad-platform sync: blocked unless the source, lawful basis and consent are recorded.
import assert from 'node:assert/strict';
import { buyListGate, hashEmail, consentedCustomers, metaCapiPayload, isPersonalAddress } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a bought list needs a source and a lawful basis', () => {
  assert.equal(buyListGate({}, []).ok, false);
  assert.equal(buyListGate({ source: 'Trade show 2026' }, []).ok, false);
  assert.equal(buyListGate({ source: 'Trade show 2026', lawfulBasis: 'legitimate_interests_b2b' }, [{ email: 'ops@acme.co.uk' }]).ok, true);
});

t('personal addresses in a list need consent as the lawful basis', () => {
  const leads = [{ email: 'jo@gmail.com' }];
  const blocked = buyListGate({ source: 'Directory', lawfulBasis: 'legitimate_interests_b2b' }, leads);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reasons.join(' '), /Personal addresses/);
  assert.equal(buyListGate({ source: 'Directory', lawfulBasis: 'consent' }, leads).ok, true);
});

t('personal-address detection covers the common providers, not company domains', () => {
  assert.equal(isPersonalAddress('a@outlook.com'), true);
  assert.equal(isPersonalAddress('a@acme.co.uk'), false);
});

t('hashing matches the platform form: trimmed, lowercase, SHA-256 hex', () => {
  assert.equal(hashEmail('  Ann@Example.com '), hashEmail('ann@example.com'));
  assert.match(hashEmail('ann@example.com'), /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hashEmail('ann@example.com'), /ann/);
});

t('only customers with recorded consent, a consent source and no withdrawal are synced', () => {
  const customers = [
    { email: 'a@x.com', marketingConsent: true, consentAt: '2026-01-01', consentSource: 'checkout tick box' },
    { email: 'b@x.com', marketingConsent: true, consentAt: '2026-01-01' }, // no source
    { email: 'c@x.com', marketingConsent: false, consentAt: '2026-01-01', consentSource: 'form' },
    { email: 'd@x.com', marketingConsent: true, consentAt: '2026-01-01', consentSource: 'form', optedOut: true },
  ];
  assert.deepEqual(consentedCustomers(customers).map((c) => c.email), ['a@x.com']);
  const body = metaCapiPayload(customers, { eventTime: Date.UTC(2026, 10, 3) });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].user_data.em[0], hashEmail('a@x.com'));
  assert.doesNotMatch(JSON.stringify(body), /a@x\.com/);
});

console.log(`\n${n} passed`);
