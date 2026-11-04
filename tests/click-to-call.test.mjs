// Click-to-call (Pass 163): numbers are checked, and the TwiML dials only the checked lead number, escaped.
import assert from 'node:assert/strict';
import { e164, clickToCallTwiml } from '../lib/click-to-call.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('phone numbers are accepted with a country code, spaces and dashes removed; anything else is refused', () => {
  assert.equal(e164('+44 7700-900 000'), '+447700900000');
  assert.equal(e164('(+94) 77 123 4567'), '+94771234567');
  assert.equal(e164('07700900000'), '+07700900000', 'a national number is kept as digits; the owner must add the country code for dialling');
  assert.equal(e164('abc'), null);
  assert.equal(e164('+12'), null);
});

t('the TwiML dials only the checked number, with the business number as caller ID, escaped', () => {
  const x = clickToCallTwiml('+447700900000', '+15550001111');
  assert.match(x, /<Dial callerId="\+15550001111">\+447700900000<\/Dial>/);
  assert.equal(clickToCallTwiml('<script>', '+15550001111'), null);
  assert.doesNotMatch(clickToCallTwiml('+447700900000', '+15550001111'), /<script>/);
});

console.log(`\n${n} passed`);
