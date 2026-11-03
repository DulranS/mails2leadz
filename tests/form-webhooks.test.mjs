// Typeform and Tally submissions (Pass 149): signatures checked before anything is read; answers mapped to the inbox lead.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTypeformSignature, verifyTallySignature, leadFromTypeform, leadFromTally } from '../lib/form-webhooks.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const SECRET = 'shh-form-secret';
const typeformBody = JSON.stringify({ event_type: 'form_response', form_response: {
  form_id: 'abc', definition: { fields: [{ id: 'f1', title: 'Your name' }, { id: 'f2', title: 'Company name' }, { id: 'f3', title: 'Email' }, { id: 'f4', title: 'Phone' }] },
  answers: [{ type: 'text', text: 'Ann Lee', field: { id: 'f1' } }, { type: 'text', text: 'Ann Ltd', field: { id: 'f2' } }, { type: 'email', email: 'ann@example.com', field: { id: 'f3' } }, { type: 'phone_number', phone_number: '+447700900000', field: { id: 'f4' } }],
} });
const tallyBody = JSON.stringify({ eventType: 'FORM_RESPONSE', data: { formId: 'xyz', fields: [
  { label: 'Full name', type: 'INPUT_TEXT', value: 'Bob Stone' }, { label: 'Company', type: 'INPUT_TEXT', value: 'Stone Co' },
  { label: 'Email', type: 'INPUT_EMAIL', value: 'bob@example.com' }, { label: 'Phone', type: 'INPUT_PHONE_NUMBER', value: '+447700900111' },
] } });

t('a Typeform submission is accepted only with its signature', () => {
  const sig = 'sha256=' + createHmac('sha256', SECRET).update(typeformBody).digest('base64');
  assert.equal(verifyTypeformSignature(typeformBody, sig, SECRET), true);
  assert.equal(verifyTypeformSignature(typeformBody + ' ', sig, SECRET), false);
  assert.equal(verifyTypeformSignature(typeformBody, sig, 'other'), false);
  assert.equal(verifyTypeformSignature(typeformBody, undefined, SECRET), false);
});

t('a Tally submission is accepted only with its signature', () => {
  const sig = createHmac('sha256', SECRET).update(tallyBody).digest('base64');
  assert.equal(verifyTallySignature(tallyBody, sig, SECRET), true);
  assert.equal(verifyTallySignature(tallyBody, 'bogus', SECRET), false);
  assert.equal(verifyTallySignature(tallyBody, sig, ''), false);
});

t('Typeform answers map to the inbox lead by their type and title', () => {
  assert.deepEqual(leadFromTypeform(JSON.parse(typeformBody)), { email: 'ann@example.com', first_name: 'Ann', last_name: 'Lee', phone_primary: '+447700900000', business_name: 'Ann Ltd', campaign: 'typeform abc' });
});

t('Tally fields map to the inbox lead by their type and label', () => {
  assert.deepEqual(leadFromTally(JSON.parse(tallyBody)), { email: 'bob@example.com', first_name: 'Bob', last_name: 'Stone', phone_primary: '+447700900111', business_name: 'Stone Co', campaign: 'tally xyz' });
});

t('a submission with no email is not stored', () => {
  assert.equal(leadFromTypeform({ form_response: { answers: [{ type: 'text', text: 'No email', field: { id: 'x' } }], definition: { fields: [] } } }), null);
  assert.equal(leadFromTally({ data: { fields: [{ label: 'Name', type: 'INPUT_TEXT', value: 'No email' }] } }), null);
});

console.log(`\n${n} passed`);
