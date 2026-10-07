import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'k'; process.env.ADMIN_EMAILS = 'boss@x.com'; process.env.WEBHOOK_SECRET = 'sek';
const tokens = { alice: 'a'.repeat(120), boss: 'b'.repeat(120) };
globalThis.fetch = async (_url, init) => {
  const t = JSON.parse(init.body).idToken;
  if (t === tokens.alice) return { ok: true, json: async () => ({ users: [{ localId: 'alice', email: 'alice@x.com' }] }) };
  if (t === tokens.boss) return { ok: true, json: async () => ({ users: [{ localId: 'boss', email: 'boss@x.com' }] }) };
  return { ok: false, json: async () => ({}) };
};
const { proxy } = await import('../proxy.js');
const req = (path, { token, method = 'GET', body } = {}) => new NextRequest(`http://x${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const passes = (r) => r.headers.get('x-middleware-next') === '1';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('no token -> 401', async () => assert.equal((await proxy(req('/api/deals?userId=alice'))).status, 401));
await t('bad token -> 401', async () => assert.equal((await proxy(req('/api/deals', { token: 'z'.repeat(120) }))).status, 401));
await t('own userId in query passes and identity header is set', async () => {
  const r = await proxy(req('/api/deals?userId=alice', { token: tokens.alice })); assert.ok(passes(r));
  assert.equal(r.headers.get('x-middleware-request-x-user-id'), 'alice');
});
await t("someone else's userId in query -> 403", async () => assert.equal((await proxy(req('/api/deals?userId=bob', { token: tokens.alice }))).status, 403));
await t('own userId in JSON body passes', async () => assert.ok(passes(await proxy(req('/api/send-email', { token: tokens.alice, method: 'POST', body: { userId: 'alice', x: 1 } })))));
await t("someone else's userId in JSON body -> 403", async () => assert.equal((await proxy(req('/api/send-email', { token: tokens.alice, method: 'POST', body: { userId: 'bob' } }))).status, 403));
await t('admin-only route: customer 403, admin passes', async () => {
  assert.equal((await proxy(req('/api/email-debug', { token: tokens.alice }))).status, 403);
  assert.ok(passes(await proxy(req('/api/email-debug', { token: tokens.boss }))));
});
await t('webhook: needs the secret, no Firebase token required', async () => {
  assert.equal((await proxy(req('/api/handle-sms-reply', { method: 'POST' }))).status, 401);
  assert.ok(passes(await proxy(req('/api/handle-sms-reply?key=sek', { method: 'POST' }))));
});
await t('webhook route also works for the signed-in dashboard, still tenant-checked', async () => {
  assert.ok(passes(await proxy(req('/api/handle-sms-reply', { token: tokens.alice, method: 'POST', body: { userId: 'alice', phone: '1' } }))));
  assert.equal((await proxy(req('/api/handle-sms-reply', { token: tokens.alice, method: 'POST', body: { userId: 'bob' } }))).status, 403);
});
await t('a client cannot spoof the identity headers the server trusts', async () => {
  const r = new NextRequest('http://x/api/deals?userId=alice', { headers: { authorization: `Bearer ${tokens.alice}`, 'x-user-id': 'bob', 'x-user-email': 'boss@x.com' } });
  const out = await proxy(r);
  assert.equal(out.headers.get('x-middleware-request-x-user-id'), 'alice');
  assert.equal(out.headers.get('x-middleware-request-x-user-email'), 'alice@x.com');
});
await t('health is public', async () => assert.ok(passes(await proxy(req('/api/health')))));
console.log(`\n${n} passed`);
