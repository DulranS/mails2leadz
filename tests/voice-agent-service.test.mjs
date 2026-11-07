// Voice agent through a service (Pass 185): the agent follows the no-prices rule, the webhook is checked, the summary is kept.
import assert from 'node:assert/strict';
import { agentConfig, callBody, webhookAllowed, parseEndOfCall } from '../lib/voice-agent.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the agent is the business assistant and keeps the no-prices and no-payments rules', () => {
  const c = agentConfig({ businessName: 'Ann Ltd', offer: 'care plans', serverUrl: 'https://x/api/voice-agent/webhook?id=1', serverSecret: 's' });
  assert.match(c.firstMessage, /assistant for Ann Ltd/);
  const sys = c.model.messages[0].content;
  assert.match(sys, /care plans/);
  assert.match(sys, /Do not quote prices, promise results or take payment details/);
  assert.deepEqual(c.serverMessages, ['end-of-call-report']);
});

t('a call is only started to a number with its country code', () => {
  assert.equal(callBody({ assistantId: 'a', phoneNumberId: 'p', number: '+44 7700 900000', name: 'Bo' }).customer.number, '+447700900000');
  assert.equal(callBody({ assistantId: 'a', phoneNumberId: 'p', number: '07700 900000' }), null);
});

t('the webhook needs the owner\'s secret, compared exactly', () => {
  assert.equal(webhookAllowed('s3cret', 's3cret'), true);
  assert.equal(webhookAllowed('s3cret', 'other!!'), false);
  assert.equal(webhookAllowed(undefined, 's3cret'), false);
  assert.equal(webhookAllowed('x', ''), false);
});

t('the end-of-call report yields the summary, the agreed next step and the number', () => {
  const p = parseEndOfCall({ message: { type: 'end-of-call-report', summary: 'Wants a care plan quote.', endedReason: 'customer-ended-call', call: { id: 'c1', customer: { number: '+447700900000' } }, analysis: { structuredData: { nextStep: 'Send the quote' } } } });
  assert.equal(p.summary, 'Wants a care plan quote.');
  assert.equal(p.nextStep, 'Send the quote');
  assert.equal(p.phone, '+447700900000');
  assert.equal(parseEndOfCall({ message: { type: 'status-update' } }), null);
});

console.log(`\n${n} passed`);
