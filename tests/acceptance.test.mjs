// Acceptance (Pass 211): one-time links, a fingerprint of the exact text, no raw IP kept, and a name that looks like a real name.
import assert from 'node:assert/strict';
import { newAcceptToken, documentHash, ipHash, acceptanceState, validName, sha256 } from '../lib/acceptance.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a link token is random, and only its hash is stored', () => {
  const a = newAcceptToken(), b = newAcceptToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenHash, sha256(a.token));
  assert.notEqual(a.tokenHash, a.token);
});

t('the fingerprint changes if one character of the agreement changes', () => {
  assert.notEqual(documentHash('Pay 100 on delivery.'), documentHash('Pay 101 on delivery.'));
  assert.equal(documentHash('Same\r\ntext'), documentHash('Same\ntext'));
});

t('the IP is kept only as a hash', () => {
  assert.notEqual(ipHash('203.0.113.7'), '203.0.113.7');
  assert.match(ipHash('203.0.113.7'), /^[0-9a-f]{64}$/);
});

t('a link is open, then accepted, expired or not found; an accepted link stays accepted', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const open = { expiresAt: new Date(now + 86400000).toISOString(), acceptedAt: null };
  assert.equal(acceptanceState(open, now), 'open');
  assert.equal(acceptanceState({ ...open, acceptedAt: '2026-11-05T10:00:00Z' }, now), 'accepted');
  assert.equal(acceptanceState({ expiresAt: new Date(now - 1).toISOString(), acceptedAt: null }, now), 'expired');
  assert.equal(acceptanceState(undefined, now), 'not_found');
});

t('the typed name must be a real name: two or more words, letters only', () => {
  assert.equal(validName('  Ann   Perera '), 'Ann Perera');
  assert.equal(validName('Mary-Jane O\'Neil'), "Mary-Jane O'Neil");
  assert.equal(validName('Ann'), null);
  assert.equal(validName('x'), null);
  assert.equal(validName('<script>alert(1)</script>'), null);
});

console.log(`\n${n} passed`);
