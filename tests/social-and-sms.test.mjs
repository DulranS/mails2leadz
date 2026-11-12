// Social posts and SMS (Pass 233): posts check their limits and links; nothing publishes without a typed POST; texts go only to valid mobile numbers with text consent.
import assert from 'node:assert/strict';
import { facebookDraft, instagramDraft, canPost } from '../lib/social.js';
import { smsRecipients } from '../lib/segments.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Facebook post needs text, stays within its limit, and any link must be https', () => {
  assert.equal(facebookDraft({ text: 'Hi' }).ok, false);
  assert.equal(facebookDraft({ text: 'Hello there, new opening hours.', link: 'https://example.com' }).ok, true);
  assert.equal(facebookDraft({ text: 'Hello there, new opening hours.', link: 'http://example.com' }).ok, false);
  assert.equal(facebookDraft({ text: 'x'.repeat(5001) }).ok, false);
});

t('an Instagram post needs a caption and a https picture link', () => {
  assert.equal(instagramDraft({ caption: 'New stock', imageUrl: 'https://cdn.example.com/a.jpg' }).ok, true);
  assert.equal(instagramDraft({ caption: 'New stock', imageUrl: 'https://cdn.example.com/a.gif' }).ok, false);
  assert.equal(instagramDraft({ caption: '', imageUrl: 'https://cdn.example.com/a.png' }).ok, false);
});

t('nothing publishes without the typed POST, and a posted draft cannot be posted twice', () => {
  assert.equal(canPost({ status: 'draft' }, 'post').ok, false);
  assert.equal(canPost({ status: 'draft' }, 'POST').ok, true);
  assert.equal(canPost({ status: 'posted' }, 'POST').ok, false);
});

t('texts go only to a valid mobile number, with recorded text consent, and never to someone opted out', () => {
  const r = smsRecipients([
    { email: 'a@x.com', phone: '+94 77 123 4567', smsConsent: true },
    { email: 'b@x.com', phone: '+94771234568', smsConsent: false },
    { email: 'c@x.com', phone: '0771234567', smsConsent: true },
    { email: 'd@x.com', phone: '+94771234569', smsConsent: true },
  ], new Set(['d@x.com']));
  assert.deepEqual(r.eligible, ['+94771234567']);
  assert.equal(r.excluded.find((x) => x.email === 'b@x.com').why, 'no agreement to receive texts');
  assert.equal(r.excluded.find((x) => x.email === 'c@x.com').why, 'no valid mobile number');
  assert.equal(r.excluded.find((x) => x.email === 'd@x.com').why, 'opted out or do-not-contact');
});

console.log(`\n${n} passed`);
