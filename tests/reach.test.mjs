import assert from 'node:assert/strict';
import { territoryOf } from '../lib/assignment.js';
import { trackedHtml, openPixelUrl, campaignHtml, clickUrl, verifyClick } from '../lib/server/open-track.js';
import { buildRawEmail } from '../lib/raw-email.js';
import { signBookingToken, verifyBookingToken } from '../lib/server/booking-manage.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a country recorded on the enquiry decides the territory; otherwise the email domain does', () => {
  assert.equal(territoryOf('buyer@firm.com', 'LK'), 'lk');
  assert.equal(territoryOf('buyer@firm.com.lk', ''), 'lk');
  assert.equal(territoryOf('buyer@firm.com', 'USA'), 'com', 'a three-letter value is not a country code');
});

t('the tracked email escapes its text, and carries the image only when there is an address', () => {
  const html = trackedHtml('Hello <script>x</script>\n\nSecond', 'https://a.example/api/track/open?t=abc');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<img src="https:\/\/a\.example\/api\/track\/open\?t=abc"/);
  assert.doesNotMatch(trackedHtml('Hi', ''), /<img/);
});

t('the open image needs the open-tracking kind; a link for any other purpose opens nothing', () => {
  const tok = signBookingToken('open', 'ownerUid0001', 'q1', 'k-test');
  assert.deepEqual(verifyBookingToken('open', tok, 'k-test'), { uid: 'ownerUid0001', id: 'q1' });
  assert.equal(verifyBookingToken('manage', tok, 'k-test'), null);
  assert.equal(openPixelUrl('u', 'q', 'http://insecure.example'), '', 'no pixel without a public https address');
});

t('an HTML email is sent as HTML; a plain one stays plain', () => {
  const html = Buffer.from(buildRawEmail({ to: 'a@x.com', subject: 'S', body: 'hi', html: '<p>hi</p>' }).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  assert.match(html, /Content-Type: text\/html/);
  const plain = Buffer.from(buildRawEmail({ to: 'a@x.com', subject: 'S', body: 'hi' }).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  assert.match(plain, /Content-Type: text\/plain/);
});

t('an invoice tracking image cannot be used to mark a quote as opened, and the reverse', () => {
  const inv = signBookingToken('open-invoice', 'ownerUid0001', 'inv1', 'k-test');
  assert.deepEqual(verifyBookingToken('open-invoice', inv, 'k-test'), { uid: 'ownerUid0001', id: 'inv1' });
  assert.equal(verifyBookingToken('open', inv, 'k-test'), null);
  const quote = signBookingToken('open', 'ownerUid0001', 'q1', 'k-test');
  assert.equal(verifyBookingToken('open-invoice', quote, 'k-test'), null);
});

t('a campaign email: its links are tracked but still read as the same address; the unsubscribe link is left alone; text is escaped', () => {
  process.env.PAY_SECRET = 'reach-test-key';
  const html = campaignHtml('See https://shop.example/x?a=1 now.\nUnsubscribe: https://app.example/api/unsubscribe?x=1 <b>', { base: 'https://app.example', uid: 'u1', recordId: 'r9', pixel: 'https://app.example/api/track/open?t=p' });
  assert.match(html, /href="https:\/\/app\.example\/api\/track\/click\?t=[^"]+"[^>]*>https:\/\/shop\.example\/x\?a=1<\/a>/);
  assert.match(html, /https:\/\/app\.example\/api\/unsubscribe\?x=1/);
  assert.doesNotMatch(html, /<a href="https:\/\/app\.example\/api\/track\/click[^"]*"[^>]*>https:\/\/app\.example\/api\/unsubscribe/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<img src="https:\/\/app\.example\/api\/track\/open\?t=p"/);
});

t('a click goes only to the address signed into its link; a changed address, or a non-web address, is refused', () => {
  process.env.PAY_SECRET = 'reach-test-key';
  const link = clickUrl('u1', 'r9', 'https://shop.example/x', 'https://app.example');
  const token = decodeURIComponent(link.split('t=')[1]);
  assert.deepEqual(verifyClick(token), { uid: 'u1', id: 'r9', url: 'https://shop.example/x' });
  const [payload, sig] = token.split('.');
  const altered = Buffer.from(JSON.stringify({ k: 'click', u: 'u1', i: 'r9', x: 'https://evil.example/' })).toString('base64url');
  assert.equal(verifyClick(`${altered}.${sig}`), null);
  assert.equal(clickUrl('u1', 'r9', 'javascript:alert(1)', 'https://app.example'), '');
  assert.equal(verifyClick(`${payload}.${sig}x`), null);
});

console.log(`reach: ${n} passed`);
