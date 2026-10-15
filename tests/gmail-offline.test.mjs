import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { extractPlainText, htmlToText } from '../lib/gmail-text.js';
import { encryptSecret, decryptSecret, loadKey, signState, verifyState } from '../lib/server/token-vault.js';
import { buildNotice, noticeHeadline } from '../lib/reply-notices.js';
import { ownWords, quickIntent } from '../lib/reply-intents.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const KEY = crypto.randomBytes(32);

t('plain text is read from nested multipart messages, preferring text/plain', () => {
  const payload = { mimeType: 'multipart/alternative', parts: [
    { mimeType: 'text/plain', body: { data: b64('Sounds great, call me Tuesday.\n\nOn Mon, Sam wrote:\n> hi') } },
    { mimeType: 'text/html', body: { data: b64('<p>HTML version</p>') } },
  ] };
  assert.ok(extractPlainText(payload).startsWith('Sounds great, call me Tuesday.'));
  const nested = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64('deep body here') } }] }, { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'x' } }] };
  assert.equal(extractPlainText(nested), 'deep body here');
});

t('html-only mail is turned into text; scripts/styles/tags/entities are removed; attachments are never read', () => {
  const html = '<html><head><style>p{color:red}</style></head><body><p>Hi&nbsp;there &amp; thanks</p><script>evil()</script><div>Second line</div></body></html>';
  assert.equal(htmlToText(html), 'Hi there & thanks\nSecond line');
  assert.equal(extractPlainText({ mimeType: 'text/html', body: { data: b64(html) } }), 'Hi there & thanks\nSecond line');
  assert.equal(extractPlainText({ mimeType: 'text/plain', filename: 'notes.txt', body: { data: b64('attached file text') } }), '');
  assert.equal(extractPlainText(null), ''); assert.equal(extractPlainText({}), '');
});

t('text is capped; garbage data does not throw', () => {
  assert.equal(extractPlainText({ mimeType: 'text/plain', body: { data: b64('x'.repeat(50000)) } }).length, 20000);
  assert.doesNotThrow(() => extractPlainText({ mimeType: 'text/plain', body: { data: '%%%not-base64%%%' } }));
});

t('full reply text feeds the same safe reading: our own footer in the quoted original never counts, their own words do', () => {
  const body = 'Yes please, send details.\n\nOn Tue, 13 Oct 2026 at 9:00, Sam <sam@biz.com> wrote:\n> Hi, we help...\n> To stop receiving these, unsubscribe here';
  assert.equal(quickIntent(ownWords(extractPlainText({ mimeType: 'text/plain', body: { data: b64(body) } }))), null);
  assert.equal(quickIntent(ownWords(extractPlainText({ mimeType: 'text/plain', body: { data: b64('Please stop emailing me.\n\nOn Tue, Sam wrote:\n> hi') } }))), 'unsubscribe');
});

t('refresh tokens are encrypted (not readable at rest), round-trip, and any tampering or wrong key fails loudly', () => {
  const secret = '1//0gAbCdEfG-refresh-token';
  const box = encryptSecret(secret, KEY);
  assert.ok(!JSON.stringify(box).includes('refresh'));
  assert.equal(decryptSecret(box, KEY), secret);
  assert.notEqual(encryptSecret(secret, KEY).ct, box.ct); // fresh IV each time
  assert.throws(() => decryptSecret({ ...box, ct: Buffer.from('tampered-bytes-here').toString('base64') }, KEY));
  assert.throws(() => decryptSecret({ ...box, tag: crypto.randomBytes(16).toString('base64') }, KEY));
  assert.throws(() => decryptSecret(box, crypto.randomBytes(32)));
  assert.throws(() => decryptSecret({ v: 9 }, KEY));
  assert.throws(() => encryptSecret('x', null));
});

t('the encryption key must be exactly 64 hex characters', () => {
  assert.equal(loadKey('abc'), null); assert.equal(loadKey(''), null); assert.equal(loadKey('g'.repeat(64)), null);
  assert.equal(loadKey('a1'.repeat(32)).length, 32);
});

t('OAuth state binds the redirect to the owner who started it: forged, altered, expired and foreign-key states are refused', () => {
  const now = Date.now();
  const s = signState('user-1', { key: KEY, now });
  assert.equal(verifyState(s, { key: KEY, now: now + 1000 }), 'user-1');
  assert.equal(verifyState(s, { key: KEY, now: now + 11 * 60000 }), null); // 10 minute life
  const [p, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'victim', e: now + 99999999, n: 'x' })).toString('base64url');
  assert.equal(verifyState(`${forged}.${sig}`, { key: KEY, now }), null);
  assert.equal(verifyState(`${p}.${sig}x`, { key: KEY, now }), null);
  assert.equal(verifyState(s, { key: crypto.randomBytes(32), now }), null);
  for (const bad of ['', 'abc', '.', null, undefined, 'a.b.c']) assert.equal(verifyState(bad, { key: KEY, now }), null);
});

t('notices: nothing noteworthy -> nothing written; replies, moves, opt-outs and bounces become short lines', () => {
  assert.equal(buildNotice({}), null);
  assert.equal(buildNotice({ replyCount: 0, triage: [], autoReplies: 3 }), null); // out-of-office alone is not worth a banner
  const n1 = buildNotice({ replyCount: 2, autoReplies: 1, bounced: [1], triage: [{ email: 'a@x.com', label: 'Interested', action: 'deal moved to qualified', summary: 'wants a call' }, { email: 'b@x.com', label: 'Not interested', action: '' }] });
  assert.equal(n1.replies, 2);
  assert.ok(n1.lines[0].includes('a@x.com') && n1.lines[0].includes('deal moved to qualified') && n1.lines[0].includes('wants a call'));
  assert.ok(n1.lines.some((l) => l.includes('bounced')));
  assert.equal(noticeHeadline({ replies: 1 }), 'While you were away: 1 new reply.');
  assert.equal(noticeHeadline({ replies: 3 }), 'While you were away: 3 new replies.');
  assert.ok(noticeHeadline({ type: 'gmail_expired' }).includes('Reconnect'));
});

console.log(`${n} gmail-offline tests passed`);

// ---- content planner: tagged enquiry link on posts ----
import { withEnquiryLink, LINK_PLATFORMS } from '../lib/content.js';
const L = 'https://app.example.com/enquire?k=u1.abc&src=linkedin';
t('posts carry the tagged link only where links are clickable; X counts links as 23 chars; never duplicated', () => {
  assert.deepEqual(LINK_PLATFORMS, ['linkedin', 'facebook', 'x']);
  const li = withEnquiryLink('Great week for our clients.', L, 'linkedin');
  assert.equal(li.mode, 'inline'); assert.ok(li.text.endsWith(L) && li.text.includes('Enquire here: '));
  assert.equal(withEnquiryLink(li.text, L, 'linkedin').mode, 'present');
  assert.equal(withEnquiryLink('Nice photo', L, 'instagram').mode, 'bio'); // link goes in the bio
  assert.equal(withEnquiryLink('Nice photo', L, 'tiktok').text, 'Nice photo');
  assert.equal(withEnquiryLink('Hello', '', 'linkedin').mode, 'bio'); // no enquiry key yet
  assert.equal(withEnquiryLink('x'.repeat(240), 'https://app.example.com/enquire?k=u1.abc&src=x', 'x').mode, 'inline'); // 240 + 1 + 23 = 264
  assert.equal(withEnquiryLink('x'.repeat(260), 'https://a.co/e', 'x').mode, 'too_long'); // 260 + 24 > 280: left as is
  assert.equal(withEnquiryLink('x'.repeat(260), 'https://a.co/e', 'x').text, 'x'.repeat(260));
});
console.log(`${n} gmail-offline / content tests passed`);
