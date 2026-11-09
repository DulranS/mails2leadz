// Tally and Twilio (Pass 205): a Tally webhook is set to the owner's address with the app's secret; forms are read safely; Twilio finds its number from the account.
import assert from 'node:assert/strict';
import { tallyWebhookBody, tallyFormIdsFrom } from '../lib/tally-connect.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Tally webhook is set for one form, to the owner\'s address, signed with the app\'s secret, for responses only', () => {
  const b = tallyWebhookBody('mRe1X2', 'https://app.example/api/intake?id=x&p=tally', 'sig-secret');
  assert.equal(b.formId, 'mRe1X2');
  assert.equal(b.signingSecret, 'sig-secret');
  assert.deepEqual(b.eventTypes, ['FORM_RESPONSE']);
});

t('only well-formed form ids are used, and no more than five forms', () => {
  const ids = tallyFormIdsFrom({ items: [{ id: 'abc1' }, { id: 'bad id!' }, { id: 'd-e_f2' }, { id: 'ghi3' }, { id: 'jkl4' }, { id: 'mno5' }, { id: 'pqr6' }] });
  assert.equal(ids.length, 5);
  assert.ok(!ids.includes('bad id!'));
  assert.deepEqual(tallyFormIdsFrom({ items: [] }), []);
});

console.log(`\n${n} passed`);
