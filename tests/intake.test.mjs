// Per-owner lead-form intake (Pass 176): each owner's forms are checked with that owner's keys only.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { FORMS, FORM_NAMES, checkForm, metaChallenge, intakeUrl, newIntakeId } from '../lib/intake.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const sig = (raw, secret) => `sha256=${createHmac('sha256', secret).update(raw).digest('base64')}`;
const q = (o) => new URLSearchParams(o);

t('the addresses are per owner and per form, and new addresses are distinct', () => {
  assert.equal(intakeUrl('https://app.example', 'abc', 'typeform'), 'https://app.example/api/intake?id=abc&p=typeform');
  assert.notEqual(newIntakeId(), newIntakeId());
  assert.ok(newIntakeId().length >= 20);
  assert.ok(FORM_NAMES.includes('TYPEFORM_WEBHOOK_SECRET') && FORM_NAMES.includes('META_APP_SECRET'));
});

t('a form is refused until its owner has saved the key it needs', () => {
  assert.equal(checkForm('typeform', { raw: '{}', headers: {} }, {}).status, 503);
});

t('a Typeform submission with a bad signature is refused; the owner\'s own signature is accepted', () => {
  const raw = JSON.stringify({ form_response: { answers: [] } });
  const secrets = { TYPEFORM_WEBHOOK_SECRET: 'owner-a-secret' };
  assert.equal(checkForm('typeform', { raw, headers: { 'typeform-signature': sig(raw, 'someone-else') } }, secrets).status, 401);
  assert.equal(checkForm('typeform', { raw, headers: { 'typeform-signature': sig(raw, 'owner-a-secret') } }, secrets).ok, true);
});

t('one owner\'s key cannot open another owner\'s form', () => {
  const raw = JSON.stringify({ form_response: { answers: [] } });
  const ownerB = { TYPEFORM_WEBHOOK_SECRET: 'owner-b-secret' };
  // a submission signed with owner A's secret, presented to owner B's address
  assert.equal(checkForm('typeform', { raw, headers: { 'typeform-signature': sig(raw, 'owner-a-secret') } }, ownerB).status, 401);
});

t('LinkedIn and TikTok need the owner\'s key in the address; a wrong key is refused', () => {
  const secrets = { LINKEDIN_LEAD_KEY: 'k-ln', TIKTOK_LEAD_KEY: 'k-tt' };
  assert.equal(checkForm('linkedin', { raw: '{}', search: q({ key: 'nope' }) }, secrets).status, 401);
  assert.equal(checkForm('tiktok', { raw: '{}', search: q({ key: 'nope' }) }, secrets).status, 401);
  assert.equal(checkForm('linkedin', { raw: '{}', search: q({ key: 'k-ln' }) }, secrets).ok, true);
});

t('Meta: the subscription check needs the owner\'s verify token, and a submission needs the owner\'s app secret', () => {
  assert.equal(metaChallenge(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'v1', 'hub.challenge': 'abc' }), { META_VERIFY_TOKEN: 'v1' }), 'abc');
  assert.equal(metaChallenge(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc' }), { META_VERIFY_TOKEN: 'v1' }), null);
  const raw = JSON.stringify({ entry: [] });
  const s = { META_APP_SECRET: 'app-a', META_PAGE_ACCESS_TOKEN: 'tok', META_PAGE_ID: 'p1', META_VERIFY_TOKEN: 'v1' };
  assert.equal(checkForm('meta', { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', 'app-b').update(raw).digest('hex')}` } }, s).status, 401);
  const hexSig = `sha256=${createHmac('sha256', 'app-a').update(raw).digest('hex')}`; // Meta signs in hex
  assert.equal(checkForm('meta', { raw, headers: { 'x-hub-signature-256': hexSig } }, s).ok, true);
});

t('every form has its own list of keys, and an unknown form is refused', () => {
  for (const [p, f] of Object.entries(FORMS)) assert.ok(f.needs.length >= 1, p);
  assert.equal(checkForm('nope', { raw: '{}' }, {}).status, 404);
});

console.log(`\n${n} passed`);
