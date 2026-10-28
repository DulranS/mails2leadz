import test from 'node:test';
import assert from 'node:assert/strict';
import { channelMessages, whatsappLink, smsLink, digitsOf, CHANNEL_KINDS } from '../lib/channel-drafts.js';

test('WhatsApp and SMS links carry the number with its country code and the text, encoded', () => {
  assert.equal(whatsappLink('+94 11 234 5678', 'Hi there'), 'https://wa.me/94112345678?text=Hi%20there');
  assert.equal(smsLink('+94 11 234 5678', 'Hi there'), 'sms:+94112345678?body=Hi%20there');
  assert.equal(whatsappLink('12', 'Hi'), '', 'too few digits gives no link');
  assert.equal(smsLink('', 'Hi'), '');
  assert.equal(digitsOf('+94 (11) 234-5678'), '94112345678');
});

test('the draft prompt carries the offer, the business, the stage and the notes, and only known channels are accepted', () => {
  const m = channelMessages({ kind: 'sms', offer: 'Bookkeeping', company: 'Shop', stage: 'demo', note: 'asked about pricing' });
  assert.ok(m.prompt.includes('Bookkeeping') && m.prompt.includes('Shop') && m.prompt.includes('demo') && m.prompt.includes('asked about pricing'));
  assert.ok(m.system.includes('"text"'));
  assert.throws(() => channelMessages({ kind: 'telegram' }));
  assert.deepEqual(CHANNEL_KINDS, ['whatsapp', 'sms', 'call_brief']);
});

test('a call brief asks for what is not recorded instead of guessing', () => {
  const m = channelMessages({ kind: 'call_brief', offer: 'x', company: 'y', note: '' });
  assert.ok(m.system.includes('not recorded'));
  assert.ok(m.prompt.includes('none recorded'));
});
