// Pass 292: owners can tag leads and contacts (spec 2.4). Tags feed the existing segment filter, so a broadcast can reach "vip" people.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeTags, TAG_MAX, TAG_LEN } from '../lib/contact-tags.js';
import { applySegment } from '../lib/segments.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('tags are lowercased, trimmed, de-duplicated and kept in the order typed', () => {
  assert.deepEqual(sanitizeTags(' VIP, vip , Referral '), ['vip', 'referral']);
  assert.deepEqual(sanitizeTags('b, a, b'), ['b', 'a']);
  assert.deepEqual(sanitizeTags(''), []);
  assert.deepEqual(sanitizeTags(undefined), []);
});

t('symbols are dropped, but letters from other languages are kept', () => {
  assert.deepEqual(sanitizeTags('a/b, Café!!, spring  promo'), ['ab', 'café', 'spring promo']);
  assert.deepEqual(sanitizeTags(['<script>', 'ok']), ['script', 'ok']);
});

t('a contact holds at most 20 tags, and each tag at most 30 characters', () => {
  assert.equal(sanitizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, TAG_MAX);
  assert.equal(sanitizeTags('x'.repeat(80))[0].length, TAG_LEN);
});

t('a tagged lead is picked up by the existing segment filter', () => {
  const contacts = [
    { email: 'a@acme.co', tags: sanitizeTags('VIP, spring') },
    { email: 'b@acme.co', tags: sanitizeTags('spring') },
  ];
  const matched = applySegment(contacts, { tags: ['vip'] }, Date.now());
  assert.deepEqual(matched.map((c) => c.email), ['a@acme.co']);
});

t('the tag box saves to the owner\'s own lead record, using the cleaned list', () => {
  const src = fs.readFileSync('app/components/LeadTags.js', 'utf8');
  assert.ok(src.includes('setDoc(doc(db, "lead_inbox", id), { tags: next'));
  assert.ok(src.includes('sanitizeTags(text)'));
  assert.ok(!/innerHTML|dangerouslySetInnerHTML/.test(src));
});

t('the lead inbox shows the tag box on each lead row', () => {
  const src = fs.readFileSync('app/inbox/page.js', 'utf8');
  assert.ok(src.includes('import LeadTags'));
  assert.ok(src.includes('<LeadTags id={l._id} tags={l.tags} />'));
});

console.log(`\n${n} passed`);
