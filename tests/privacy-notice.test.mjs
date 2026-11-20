// Privacy notice for sourced people (pass 334): keys, text, due dates. Run: node tests/privacy-notice.test.mjs
import assert from 'node:assert/strict';
import { noticeKey, noticeDocId, noticeText, withNotice, overdueNotices } from '../lib/privacy-notice.js';
import { inboxKey } from '../lib/lead-inbox.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('one key per person: e-mail first, then phone, then profile link', () => {
  assert.equal(noticeKey({ email: ' Ann@X.com ', phone: '+94 77 123 4567' }), 'e:ann@x.com');
  assert.equal(noticeKey({ phone: '+94 77 123 4567' }), 't:94771234567');
  assert.equal(noticeKey({ website: 'https://LinkedIn.com/in/ann' }), 'u:https://linkedin.com/in/ann');
  assert.equal(noticeKey({ phone: '12' }), '');
  assert.equal(noticeKey({}), '');
});

t('the key matches the inbox lead for the same person (e-mail and phone)', () => {
  assert.equal(inboxKey({ email: 'ann@x.com' }), noticeKey({ email: 'ann@x.com' }));
  assert.equal(inboxKey({ whatsapp_number: '94771234567' }), noticeKey({ phone: '+94 77 123 4567' }));
});

t('document id is per owner, and never contains a slash', () => {
  assert.equal(noticeDocId('u1', 'e:a/b@x.com'), 'u1:e%3Aa%2Fb%40x.com');
  assert.ok(!noticeDocId('u1', 'u:https://x.com/a/b').includes('/'));
});

t('notice text names the source, the basis and the controller, and says how to object', () => {
  const s = noticeText({ controller: 'Acme Ltd', source: 'Applicants to job ad', lawfulBasis: 'legitimate_interests_b2b' });
  assert.match(s, /found your details through Applicants to job ad/);
  assert.match(s, /our legitimate interest in contacting businesses like yours/);
  assert.match(s, /Acme Ltd uses your name/);
  assert.match(s, /ask us to stop contacting you/);
  assert.ok(!s.includes('legitimate_interests_b2b'), 'raw basis code must not reach the reader');
});

t('notice text falls back to safe wording when fields are empty or hostile', () => {
  const s = noticeText({ controller: '', source: '', lawfulBasis: '' });
  assert.match(s, /found your details through a list/);
  assert.match(s, /the sender of this email uses/);
  const hostile = noticeText({ controller: 'A\r\nBcc: spy@x.com', source: 'x'.repeat(500), lawfulBasis: 'consent' });
  assert.ok(!hostile.split('\n').some((line) => line.startsWith('Bcc:')), 'a line break in a name must not start a new line');
  assert.match(hostile, /A Bcc: spy@x\.com uses your name/);
  assert.ok(hostile.length < 1200, 'clipped');
});

t('the notice is appended after the body; no notice means the body is unchanged', () => {
  assert.equal(withNotice('Hello', ''), 'Hello');
  assert.equal(withNotice('Hello', null), 'Hello');
  assert.equal(withNotice('Hello', 'About you'), 'Hello\n\n---\nAbout you');
});

t('overdue: only given-nothing records whose date has passed', () => {
  const recs = [
    { id: 'a', noticeBy: '2026-12-01', givenAt: null },
    { id: 'b', noticeBy: '2026-12-18', givenAt: null }, // due today: not yet overdue
    { id: 'c', noticeBy: '2026-11-30', givenAt: '2026-11-30T09:00:00Z' }, // given: never overdue
    { id: 'd', noticeBy: '2026-11-05', givenAt: null },
    { id: 'e', noticeBy: 'soon', givenAt: null },
  ];
  assert.deepEqual(overdueNotices(recs, '2026-12-18').map((r) => r.id), ['d', 'a']);
  assert.deepEqual(overdueNotices(recs, '2026-12-19').map((r) => r.id), ['d', 'a', 'b']);
  assert.deepEqual(overdueNotices(recs, 'not-a-date'), []);
  assert.deepEqual(overdueNotices(null, '2026-12-19'), []);
});

console.log(`privacy notice: ${n} checks passed`);
