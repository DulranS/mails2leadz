// Shopify and eBay Connect (Pass 193): the store name rides in the signed state; the approval page is the store\'s own; eBay uses its RuName.
import assert from 'node:assert/strict';
import { signState, readState, authUrlFor, CONNECT_PROVIDERS } from '../lib/connect.js';
import { SECRET_NAMES } from '../lib/server/integration-secrets.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const SECRET = 'state-secret-for-tests';
const NOW = Date.parse('2026-11-06T10:00:00Z');

t('the store name rides in the signed state and comes back with it', () => {
  const st = signState({ uid: 'o1', provider: 'shopify', extra: { shop: 'my-shop.myshopify.com' }, now: NOW }, SECRET);
  assert.deepEqual(readState(st, SECRET, { provider: 'shopify', now: NOW }).extra, { shop: 'my-shop.myshopify.com' });
});

t('Shopify\'s approval page is on the owner\'s own store, and no store means no page', () => {
  const u = new URL(authUrlFor('shopify', { clientId: 'cid', redirectUri: 'https://app.example/api/connect/callback', state: 'S', shop: 'my-shop.myshopify.com' }));
  assert.equal(u.origin, 'https://my-shop.myshopify.com');
  assert.equal(u.pathname, '/admin/oauth/authorize');
  assert.equal(authUrlFor('shopify', { clientId: 'cid', redirectUri: 'x', state: 'S', shop: '' }), null);
});

t('eBay\'s approval page takes the RuName the owner registered, and asks for the selling scopes', () => {
  const u = new URL(authUrlFor('ebay', { clientId: 'cid', redirectUri: 'My_RuName-123', state: 'S' }));
  assert.equal(u.hostname, 'auth.ebay.com');
  assert.equal(u.searchParams.get('redirect_uri'), 'My_RuName-123');
  assert.match(u.searchParams.get('scope'), /sell\.inventory/);
});

t('every value the two new connections store is a key the store knows', () => {
  for (const id of ['shopify', 'ebay']) for (const name of CONNECT_PROVIDERS[id].stores) assert.ok(SECRET_NAMES.includes(name), `${id}: ${name}`);
});

console.log(`\n${n} passed`);
