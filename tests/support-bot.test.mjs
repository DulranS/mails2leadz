// Automatic support (Pass 196): answers only from the owner's own answers; complaints, refunds and requests for a person go to a person; automatic replies are never answered.
import assert from 'node:assert/strict';
import { decideSupport, cleanLibrary, MAX_REPLY } from '../lib/support-bot.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const lib = [{ q: 'What are your opening hours?', a: 'We are open 9am to 5pm, Monday to Friday.' }, { q: 'Do you deliver to Colombo?', a: 'Yes, next day within Colombo.' }];

t('a question that matches the owner\'s library is answered with the owner\'s own words', () => {
  const d = decideSupport('hi, what are your opening hours on Saturday?', lib);
  assert.equal(d.action, 'reply');
  assert.match(d.reply, /open 9am to 5pm/);
  assert.match(d.reply, /Automatic reply/);
});

t('a complaint, a refund, a legal matter or a request for a person goes to a person, never answered', () => {
  for (const text of ['I want a refund now', 'this is a scam', 'can I speak to a manager', 'my order arrived broken', 'I was charged twice']) {
    const d = decideSupport(text, lib);
    assert.equal(d.action, 'escalate', text);
  }
  assert.equal(decideSupport('my order arrived broken', lib).kind, 'complaint');
});

t('a question the library does not cover is handed to a person, not guessed at', () => {
  assert.equal(decideSupport('do you make custom furniture for boats', lib).action, 'escalate');
  assert.equal(decideSupport('hours', lib).action, 'escalate', 'one word is not enough to match');
});

t('automatic replies and empty messages are never answered, so two bots cannot talk to each other', () => {
  assert.equal(decideSupport('This is an automatic reply: I am out of the office', lib).action, 'escalate');
  assert.equal(decideSupport('', lib).action, 'escalate');
});

t('the library keeps only complete, trimmed entries, and no reply goes over the length limit', () => {
  const clean = cleanLibrary([{ q: ' Hours? ', a: 'x'.repeat(900) }, { q: '', a: 'no question' }, { q: 'Empty answer?', a: '' }]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].q, 'Hours?');
  assert.equal(clean[0].a.length, MAX_REPLY);
});

console.log(`\n${n} passed`);
