import assert from 'node:assert/strict';
import { signUnsubToken, verifyUnsubToken, buildOptOut, withTextFooter } from '../lib/server/unsubscribe.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const K = 'test-secret-key';

t('token round-trips and normalises the email', () => {
  const tok = signUnsubToken('alice', ' Bob@Example.COM ', K);
  assert.deepEqual(verifyUnsubToken(tok, K), { uid: 'alice', email: 'bob@example.com' });
});
t('tampered payload, wrong key, garbage and missing secret are all rejected', () => {
  const tok = signUnsubToken('alice', 'bob@x.com', K);
  const [p, s] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'mallory', e: 'bob@x.com' })).toString('base64url');
  assert.equal(verifyUnsubToken(`${forged}.${s}`, K), null);
  assert.equal(verifyUnsubToken(tok, 'other-key'), null);
  assert.equal(verifyUnsubToken(`${p}.`, K), null);
  assert.equal(verifyUnsubToken('nope', K), null);
  assert.equal(verifyUnsubToken(`${p}.${s}.x`, K), null);
  assert.equal(verifyUnsubToken(tok, ''), null);
  assert.equal(signUnsubToken('alice', 'bob@x.com', ''), null);
});
t('opt-out is off (null) without a base URL, and http is refused in production', () => {
  assert.equal(buildOptOut('a', 'b@x.com', { key: K, base: '', production: false }), null);
  assert.equal(buildOptOut('a', 'b@x.com', { key: '', base: 'https://x.com', production: false }), null);
  assert.equal(buildOptOut('a', 'b@x.com', { key: K, base: 'http://x.com', production: true }), null);
  assert.ok(buildOptOut('a', 'b@x.com', { key: K, base: 'http://localhost:3000', production: false }));
});
t('links, headers and footer carry the same verifiable token', () => {
  const o = buildOptOut('alice', 'bob@x.com', { key: K, base: 'https://app.example.com/', production: true });
  assert.ok(o.pageUrl.startsWith('https://app.example.com/unsubscribe?t='));
  assert.ok(o.oneClickUrl.startsWith('https://app.example.com/api/unsubscribe?t='));
  assert.match(o.headers, /^List-Unsubscribe: <https:\/\/app\.example\.com\/api\/unsubscribe\?t=[^>\r\n]+>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n$/);
  assert.deepEqual(verifyUnsubToken(new URL(o.pageUrl).searchParams.get('t'), K), { uid: 'alice', email: 'bob@x.com' });
  assert.ok(o.htmlFooter.includes(`href="${o.pageUrl}"`));
});
t('footer is added once and the body is untouched when opt-out is off', () => {
  const o = buildOptOut('a', 'b@x.com', { key: K, base: 'https://x.com', production: true });
  const once = withTextFooter('Hi there\n\n', o);
  assert.ok(once.startsWith('Hi there\n\n--\n') && once.endsWith(o.pageUrl));
  assert.equal(withTextFooter(once, o), once);
  assert.equal(withTextFooter('Hi', null), 'Hi');
});
console.log(`\n${n} passed`);
