// Slack alerts, mailbox verification and Meta Lead Ads intake (Pass 141). Each switches on with one key or one URL; without it nothing changes.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { isSlackWebhook, slackText } from '../lib/slack.js';
import { hunterVerdict } from '../lib/mailbox-verify.js';
import { mailboxVerdict } from '../lib/server/mailbox-verify.js';
import { verifyMetaSignature, leadgenEvents, leadFromFields } from '../lib/meta-leads.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Slack URL is accepted only in the incoming-webhook form', () => {
  assert.equal(isSlackWebhook('https://hooks.slack.com/services/T000/B000/abcdefghijklmnop'), true);
  assert.equal(isSlackWebhook('http://hooks.slack.com/services/T000/B000/abcdefghijklmnop'), false);
  assert.equal(isSlackWebhook('https://evil.example.com/services/T000/B000/abcdefghijklmnop'), false);
  assert.equal(isSlackWebhook(''), false);
  assert.equal(isSlackWebhook(undefined), false);
});

t('a Slack line names the event and the fields it carries, and nothing else', () => {
  assert.equal(slackText('reply.hot', { name: 'Ann', summary: 'Wants a price' }), 'Hot reply: Ann - Wants a price');
  assert.equal(slackText('payment.received', { businessName: 'Ann Ltd', amount: '120.00' }), 'Payment received: Ann Ltd (120.00)');
  assert.equal(slackText('enquiry.received', {}), 'New enquiry');
  assert.equal(slackText('deal.deleted', { name: 'x' }), null);
});

t('a mailbox verdict holds only invalid and disposable addresses', () => {
  assert.equal(hunterVerdict('invalid'), 'hold');
  assert.equal(hunterVerdict('disposable'), 'hold');
  assert.equal(hunterVerdict('valid'), 'ok');
  assert.equal(hunterVerdict('accept_all'), 'ok');
  assert.equal(hunterVerdict('unknown'), 'ok');
});

t('without a Hunter key no address is looked up and nothing is held (no network call)', async () => {
  const prev = process.env.HUNTER_API_KEY;
  delete process.env.HUNTER_API_KEY;
  const noNetwork = async () => { throw new Error('must not be called'); };
  try {
    assert.equal(await mailboxVerdict(null, 'u1', 'ann@example.com', { fetchImpl: noNetwork }), 'ok');
    assert.equal(await mailboxVerdict(null, 'u1', 'not-an-address', { fetchImpl: noNetwork }), 'ok');
  } finally {
    if (prev !== undefined) process.env.HUNTER_API_KEY = prev;
  }
});

const SECRET = 'app-secret-123';
const body = JSON.stringify({ object: 'page', entry: [{ id: '555', changes: [{ field: 'leadgen', value: { leadgen_id: '9001', page_id: '555', form_id: '77' } }] }] });
const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

t('a Meta POST is accepted only when its signature matches the app secret', () => {
  assert.equal(verifyMetaSignature(body, sig, SECRET), true);
  assert.equal(verifyMetaSignature(body + ' ', sig, SECRET), false);
  assert.equal(verifyMetaSignature(body, sig, 'other-secret'), false);
  assert.equal(verifyMetaSignature(body, undefined, SECRET), false);
  assert.equal(verifyMetaSignature(body, 'md5=abc', SECRET), false);
  assert.equal(verifyMetaSignature(body, sig, ''), false);
});

t('the leadgen events are read from a webhook payload, and other fields are ignored', () => {
  assert.deepEqual(leadgenEvents(JSON.parse(body)), [{ leadgenId: '9001', pageId: '555', formId: '77' }]);
  assert.deepEqual(leadgenEvents({ entry: [{ id: '1', changes: [{ field: 'feed', value: {} }] }] }), []);
  assert.deepEqual(leadgenEvents({}), []);
});

t('a Meta lead maps to the inbox fields; a lead with no email is not stored', () => {
  const lead = leadFromFields([
    { name: 'full_name', values: ['Ann Lee'] },
    { name: 'email', values: ['ann@example.com'] },
    { name: 'phone_number', values: ['+447700900000'] },
    { name: 'company_name', values: ['Ann Ltd'] },
  ], { formId: '77' });
  assert.deepEqual(lead, { email: 'ann@example.com', first_name: 'Ann', last_name: 'Lee', phone_primary: '+447700900000', business_name: 'Ann Ltd', campaign: 'meta-lead-form 77' });
  assert.equal(leadFromFields([{ name: 'full_name', values: ['No Email'] }]), null);
});

console.log(`\n${n} passed`);
