// Connect buttons (Pass 180): a state is only valid for the owner and platform it was made for, and only for a short time.
import assert from 'node:assert/strict';
import { signState, readState, authUrlFor, CONNECT_PROVIDERS } from '../lib/connect.js';
import { SECRET_NAMES } from '../lib/server/integration-secrets.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const SECRET = 'state-secret-for-tests';
const NOW = Date.parse('2026-11-05T10:00:00Z');

t('a state round-trips for the owner and platform it was made for', () => {
  const st = signState({ uid: 'owner1', provider: 'google_ads', now: NOW }, SECRET);
  assert.deepEqual(readState(st, SECRET, { provider: 'google_ads', now: NOW + 60000 }), { uid: 'owner1', provider: 'google_ads' });
});

t('a forged, tampered, expired or other-platform state is refused', () => {
  const st = signState({ uid: 'owner1', provider: 'google_ads', now: NOW }, SECRET);
  assert.equal(readState(st, 'wrong-secret', { provider: 'google_ads', now: NOW }), null);
  const [p, s] = st.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'someone-else', provider: 'google_ads', exp: NOW + 1e9, n: 'x' })).toString('base64url');
  assert.equal(readState(`${forged}.${s}`, SECRET, { provider: 'google_ads', now: NOW }), null);
  assert.equal(readState(st, SECRET, { provider: 'google_ads', now: NOW + 11 * 60 * 1000 }), null, 'expired after ten minutes');
  assert.equal(readState(st, SECRET, { provider: 'meta_leads', now: NOW }), null, 'another platform');
});

t('the approval page asks for the platform\'s scope, the app\'s return address and the state', () => {
  const u = new URL(authUrlFor('google_ads', { clientId: 'cid', redirectUri: 'https://app.example/api/connect/callback', state: 'S' }));
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('state'), 'S');
  assert.match(u.searchParams.get('scope'), /adwords/);
  assert.equal(u.searchParams.get('access_type'), 'offline');
});

t('every value a Connect stores is a key the store knows', () => {
  for (const [id, p] of Object.entries(CONNECT_PROVIDERS)) for (const name of p.stores) assert.ok(SECRET_NAMES.includes(name), `${id}: ${name}`);
});

t('TikTok takes its own parameter names: the app id, no scope', () => {
  const u = new URL(authUrlFor('tiktok_events', { clientId: 'app1', redirectUri: 'https://app.example/api/connect/callback', state: 'S' }));
  assert.equal(u.searchParams.get('app_id'), 'app1');
  assert.equal(u.searchParams.get('scope'), null);
  assert.equal(u.searchParams.get('state'), 'S');
});

console.log(`\n${n} passed`);
