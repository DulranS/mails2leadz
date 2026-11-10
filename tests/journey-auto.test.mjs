// Automatic journey email (Pass 218): off unless switched on; email only; only where agreement is recorded; never to a do-not-contact address; every email carries an opt-out.
import assert from 'node:assert/strict';
import { autoSendDecision, withOptOut } from '../lib/journey-send.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const step = { channel: 'email', text: 'Hello' };
const agreed = { consentConfirmedAt: '2026-11-01T00:00:00Z' };

t('nothing is sent while the switch is off', () => {
  assert.equal(autoSendDecision({ enrolment: agreed, step, switchOn: false }).send, false);
});

t('an email step is sent only where agreement is recorded and the address is not suppressed', () => {
  assert.equal(autoSendDecision({ enrolment: agreed, step, switchOn: true }).send, true);
  assert.equal(autoSendDecision({ enrolment: {}, step, switchOn: true }).why, 'no_agreement_recorded');
  assert.equal(autoSendDecision({ enrolment: agreed, step, suppressed: true, switchOn: true }).why, 'do_not_contact');
});

t('SMS and WhatsApp steps are never sent automatically', () => {
  assert.equal(autoSendDecision({ enrolment: agreed, step: { channel: 'sms', text: 'Hi' }, switchOn: true }).why, 'manual_channel');
});

t('every automatic email carries an opt-out line', () => {
  assert.match(withOptOut('Hello', 'https://app.example/unsub?x=1'), /stop these messages/);
  assert.match(withOptOut('Hello'), /reply STOP/);
});

console.log(`\n${n} passed`);
