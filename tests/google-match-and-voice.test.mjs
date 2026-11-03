// Google Customer Match bodies (hashed, consented, batched) and the live voice instructions and request (Pass 154).
import assert from 'node:assert/strict';
import { customerMatchBatches, userListBody, customerMatchJobBody, adsHeaders } from '../lib/google-customer-match.js';
import { liveVoiceInstructions, realtimeSessionBody } from '../lib/realtime-voice.js';
import { hashEmail } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const many = Array.from({ length: 2500 }, (_, i) => ({ email: `p${i}@x.com`, marketingConsent: true, consentAt: '2026-11-02', consentSource: 'double opt-in signup' }));

t('Customer Match sends hashed emails of consented customers only, in batches of 1000', () => {
  const batches = customerMatchBatches([...many, { email: 'no@x.com', marketingConsent: false, consentAt: '2026-11-02', consentSource: 'form' }]);
  assert.deepEqual(batches.map((b) => b.length), [1000, 1000, 500]);
  assert.deepEqual(batches[0][0], { create: { userIdentifiers: [{ hashedEmail: hashEmail('p0@x.com') }] } });
  assert.doesNotMatch(JSON.stringify(batches), /@x\.com/);
});

t('the list and job bodies are the documented shapes, and the headers carry the developer token', () => {
  assert.equal(userListBody().operations[0].create.crmBasedUserList.uploadKeyType, 'CONTACT_INFO');
  assert.deepEqual(customerMatchJobBody('customers/1/userLists/9').job, { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: 'customers/1/userLists/9' } });
  const h = adsHeaders({ GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '123-456-7890' }, 'tok');
  assert.equal(h['developer-token'], 'dev');
  assert.equal(h['login-customer-id'], '1234567890');
  assert.equal(h.Authorization, 'Bearer tok');
});

t('live voice instructions name the business and forbid prices, promises and payments', () => {
  const s = liveVoiceInstructions({ businessName: 'Ann Ltd', offer: 'website care plans' });
  assert.match(s, /voice assistant for Ann Ltd/);
  assert.match(s, /website care plans/);
  assert.match(s, /Do not quote prices, promise results or take payment details/);
});

t('the live voice request asks for a realtime session with the instructions and a voice', () => {
  const b = realtimeSessionBody({ instructions: 'hi', voice: 'alloy', model: 'gpt-realtime' });
  assert.equal(b.session.type, 'realtime');
  assert.equal(b.session.instructions, 'hi');
  assert.equal(b.session.audio.output.voice, 'alloy');
});

console.log(`\n${n} passed`);
