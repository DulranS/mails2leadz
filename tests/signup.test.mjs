// Mailing list: consent, double opt-in tokens, sign-up keys, exports (suppressed people left out), and hashed audience files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  sanitizeSignup, contactId, audienceHash, newContact, confirmPatch, signConfirmToken, verifyConfirmToken,
  newSignupKey, parseSignupKey, signupKeyMatches, countsByStatus, exportRows, contactsCsv, audienceCsv, CONSENT_TEXT,
} from '../lib/signup.js';

// Sign-up checks: a bot is caught by the hidden field, and nothing is kept without a ticked box.
assert.equal(sanitizeSignup({ email: 'a@b.co', consent: true, website: 'http://spam' }).honeypot, true, 'bots caught by the hidden field');
assert.match(sanitizeSignup({ email: 'a@b.co' }).error, /Tick the box/, 'no consent, no sign-up');
assert.match(sanitizeSignup({ email: 'nope', consent: true }).error, /valid email/);
const ok = sanitizeSignup({ email: '  Buyer@Example.COM ', consent: 'yes', name: '  Ana\u0007  Silva ' });
assert.equal(ok.ok, true);
assert.equal(ok.value.email, 'buyer@example.com');
assert.equal(ok.value.name, 'Ana Silva', 'control characters removed, spaces tidied');
assert.equal(ok.value.source, 'website', 'default source');

// Contact ids: stable per account and address, different per account, and no address in plain text.
const id = contactId('uid1', 'buyer@example.com');
assert.equal(id, contactId('uid1', 'BUYER@example.com'));
assert.notEqual(id, contactId('uid2', 'buyer@example.com'));
assert.equal(id.length, 64);
assert.ok(!id.includes('@'));

// A new contact waits for confirmation and keeps the consent wording and time.
const c = newContact({ uid: 'uid1', email: 'buyer@example.com', name: 'Ana', source: 'fair', now: new Date('2026-06-01T10:00:00Z') });
assert.equal(c.status, 'pending');
assert.equal(c.consentText, CONSENT_TEXT);
assert.equal(c.consentAt, '2026-06-01T10:00:00.000Z');
assert.equal(confirmPatch(new Date('2026-06-02T00:00:00Z')).status, 'confirmed');

// Confirmation links: valid for 7 days, refused when changed, expired, or signed with another key.
const k = 'signup-test-key-abcdefghijklmnop';
const t0 = Date.parse('2026-06-01T00:00:00Z');
const tok = signConfirmToken('uid1', id, { now: t0, k });
assert.deepEqual(verifyConfirmToken(tok, { now: t0 + 86400000, k }), { uid: 'uid1', cid: id });
assert.equal(verifyConfirmToken(tok, { now: t0 + 8 * 86400000, k }), null, 'expired after 7 days');
assert.equal(verifyConfirmToken(tok, { now: t0, k: 'another-key-altogether-0000000' }), null, 'wrong key refused');
const [, sig] = tok.split('.');
const forged = Buffer.from(JSON.stringify({ u: 'uid2', c: id, x: t0 + 1e10 })).toString('base64url');
assert.equal(verifyConfirmToken(`${forged}.${sig}`, { now: t0, k }), null, 'a changed account is refused');
assert.equal(verifyConfirmToken('x.y', { now: t0, k }), null);

// Owner sign-up keys: "<uid>.<secret>"; only a hash of the secret is stored, and a wrong secret never matches.
const key = newSignupKey('uid1');
const parsed = parseSignupKey(key.raw);
assert.equal(parsed.uid, 'uid1');
assert.ok(signupKeyMatches(key.hash, parsed.secret), 'the right secret matches its stored hash');
assert.equal(signupKeyMatches(key.hash, 'not-the-secret-value-at-all'), false);
assert.ok(!key.hash.includes(parsed.secret), 'the stored value is not the secret');
assert.equal(parseSignupKey('garbage'), null);

// Counts and exports: unsubscribed people never appear, suppressed addresses are left out, and the row cap holds.
const list = [
  { email: 'a@x.com', name: 'A', status: 'confirmed', consentAt: 'x', confirmedAt: 'y', source: 'web' },
  { email: 'b@x.com', name: 'B', status: 'pending', consentAt: 'x', source: 'web' },
  { email: 'c@x.com', name: 'C', status: 'unsubscribed', consentAt: 'x', source: 'web' },
  { email: 'd@x.com', name: 'D', status: 'confirmed', consentAt: 'x', confirmedAt: 'y', source: 'web' },
  { email: 'e@x.com', name: 'E', status: 'confirmed', consentAt: 'x', confirmedAt: 'y', source: 'web' },
];
assert.deepEqual(countsByStatus(list), { pending: 1, confirmed: 3, unsubscribed: 1, total: 5 });
assert.deepEqual(exportRows(list).map((r) => r.email), ['a@x.com', 'd@x.com', 'e@x.com'], 'confirmed only by default');
assert.deepEqual(exportRows(list, { suppressed: new Set(['d@x.com']) }).map((r) => r.email), ['a@x.com', 'e@x.com'], 'a suppressed address is left out');
assert.deepEqual(exportRows(list, { status: 'pending' }).map((r) => r.email), ['b@x.com']);
assert.equal(exportRows(list, { status: 'all' }).some((r) => r.status === 'unsubscribed'), false, 'unsubscribed never exported, even with all');
assert.equal(exportRows(list, { max: 2 }).length, 2, 'row cap holds');

// Contacts file: the owner's own tools get names and addresses. Audience file: hashes only, no addresses.
const csv = contactsCsv(exportRows(list));
assert.ok(csv.startsWith('Name,Email,Source,Status,Agreed at,Confirmed at\r\n'));
assert.ok(csv.includes('A,a@x.com,web,confirmed,x,y'));
const aud = audienceCsv(exportRows(list));
assert.equal(aud.split('\r\n')[0], 'email');
assert.ok(!aud.includes('@'), 'the audience file holds no plain addresses');
const expected = createHash('sha256').update('a@x.com').digest('hex');
assert.ok(aud.includes(expected), 'the hash is SHA-256 of the lower-cased address');
assert.equal(audienceHash('  A@X.com '), expected, 'hashing normalises case and spaces');

console.log('signup tests: all passed');
