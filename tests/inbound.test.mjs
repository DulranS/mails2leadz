import assert from 'node:assert/strict';
import { twilioSignature, verifyTwilioSignature, parseInbound, isStopKeyword, twilioNumber } from '../lib/server/inbound-messages.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const URL_ = 'https://app.example.com/api/inbound/twilio';
const P = { From: 'whatsapp:+94771234567', To: 'whatsapp:+94110000000', Body: 'STOP', MessageSid: 'SM1' };
const TOKEN = 'auth-token-test';

t('a request signed with the account token verifies; a changed field, URL, token or missing signature does not', () => {
  const sig = twilioSignature(URL_, P, TOKEN);
  assert.equal(verifyTwilioSignature(URL_, P, TOKEN, sig), true);
  assert.equal(verifyTwilioSignature(URL_, { ...P, Body: 'hello' }, TOKEN, sig), false);
  assert.equal(verifyTwilioSignature('https://evil.example/api/inbound/twilio', P, TOKEN, sig), false);
  assert.equal(verifyTwilioSignature(URL_, P, 'other-token', sig), false);
  assert.equal(verifyTwilioSignature(URL_, P, TOKEN, null), false);
  assert.equal(verifyTwilioSignature(URL_, P, '', sig), false);
});

t('the signature does not depend on the order the fields arrive in', () => {
  const reversed = Object.fromEntries(Object.entries(P).reverse());
  assert.equal(twilioSignature(URL_, P, TOKEN), twilioSignature(URL_, reversed, TOKEN));
});

t('a WhatsApp prefix is removed from the number, and the channel is read from it', () => {
  assert.equal(twilioNumber('whatsapp:+9477'), '+9477');
  const m = parseInbound(P);
  assert.equal(m.from, '+94771234567');
  assert.equal(m.channel, 'whatsapp');
  assert.equal(parseInbound({ From: '+94770000000', To: '+94110000000', Body: 'hi' }).channel, 'sms');
});

t('only the exact keyword withdraws consent; a sentence containing "stop" is a reply, not an opt-out', () => {
  for (const s of ['STOP', ' stop ', 'Unsubscribe', 'QUIT']) assert.equal(isStopKeyword(s), true, s);
  for (const s of ['please stop calling me', 'do not stop the order', 'START', '']) assert.equal(isStopKeyword(s), false, s);
});

t('the body is cleaned and kept to a sane length', () => {
  const m = parseInbound({ ...P, Body: `  hi\n\nthere   ${'x'.repeat(2000)}` });
  assert.ok(m.body.length <= 1000);
  assert.ok(!m.body.includes('\n'));
});

console.log(`inbound: ${n} passed`);
