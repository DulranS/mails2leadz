// The gate with team logins: who a person is working as, and what their role may do. Run with ./tests/_register.mjs (like proxy.test.mjs).
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'k'; process.env.ADMIN_EMAILS = 'boss@x.com'; process.env.ALLOWED_EMAILS = 'owner@x.com';
const tokens = { owner: 'o'.repeat(120), mgr: 'm'.repeat(120), view: 'v'.repeat(120), loner: 'l'.repeat(120), stranger: 's'.repeat(120) };
const who = { [tokens.owner]: ['owner', 'owner@x.com'], [tokens.mgr]: ['mgr', 'mgr@x.com'], [tokens.view]: ['view', 'view@x.com'], [tokens.loner]: ['loner', 'owner@x.com'], [tokens.stranger]: ['stranger', 'nobody@x.com'] };
globalThis.fetch = async (_url, init) => {
  const t = JSON.parse(init.body).idToken;
  const w = who[t];
  return w ? { ok: true, json: async () => ({ users: [{ localId: w[0], email: w[1] }] }) } : { ok: false, json: async () => ({}) };
};
const { proxy } = await import('../proxy.js');
const { setWorkspaceResolver } = await import('../lib/server/workspace.js');
// The server's records, faked: mgr and view work in owner's workspace; stranger has no workspace.
const seats = { mgr: { ownerUid: 'owner', role: 'manager' }, view: { ownerUid: 'owner', role: 'viewer' } };
setWorkspaceResolver(async (uid) => seats[uid] || null);
const req = (path, { token, method = 'GET', body } = {}) => new NextRequest(`http://x${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const passes = (r) => r.headers.get('x-middleware-next') === '1';
const h = (r, k) => r.headers.get(`x-middleware-request-${k}`);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('a manager works as the owner: tenant is the owner, actor is the manager, and an invite-list check does not block them', async () => {
  const r = await proxy(req('/api/deals?userId=owner', { token: tokens.mgr }));
  assert.ok(passes(r));
  assert.equal(h(r, 'x-user-id'), 'owner');
  assert.equal(h(r, 'x-actor-uid'), 'mgr');
  assert.equal(h(r, 'x-actor-role'), 'manager');
});
await t('a member cannot name their own uid as the data to read: the workspace is the owner', async () => {
  assert.equal((await proxy(req('/api/deals?userId=mgr', { token: tokens.mgr }))).status, 403);
});
await t('a manager can do daily work but not money, keys, the account or the connected mailbox', async () => {
  assert.ok(passes(await proxy(req('/api/send-email', { token: tokens.mgr, method: 'POST', body: { userId: 'owner' } }))));
  for (const p of ['/api/saas/checkout', '/api/stripe/portal', '/api/tenant', '/api/inbound-key', '/api/lead-inbox/key', '/api/gmail-offline']) {
    const r = await proxy(req(p, { token: tokens.mgr, method: 'POST', body: { userId: 'owner' } }));
    assert.equal(r.status, 403, p);
  }
});
await t('a viewer can read but every change is refused', async () => {
  assert.ok(passes(await proxy(req('/api/deals?userId=owner', { token: tokens.view }))));
  const r = await proxy(req('/api/send-email', { token: tokens.view, method: 'POST', body: { userId: 'owner' } }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'VIEW_ONLY');
});
await t('the owner and people with no workspace are unchanged: they work as themselves', async () => {
  const r = await proxy(req('/api/deals?userId=owner', { token: tokens.owner }));
  assert.ok(passes(r));
  assert.equal(h(r, 'x-user-id'), 'owner');
  assert.equal(h(r, 'x-actor-role'), 'owner');
  assert.ok(passes(await proxy(req('/api/saas/checkout', { token: tokens.owner, method: 'POST', body: { userId: 'owner' } }))));
});
await t('invite-only deployments: an outsider is blocked everywhere except /api/team (to open an invite)', async () => {
  assert.equal((await proxy(req('/api/deals', { token: tokens.stranger }))).status, 403);
  assert.ok(passes(await proxy(req('/api/team', { token: tokens.stranger, method: 'POST', body: { action: 'accept', token: 'x' } }))));
});
await t('spoofed actor headers from a browser are replaced', async () => {
  const r = new NextRequest('http://x/api/deals?userId=owner', { headers: { authorization: `Bearer ${tokens.owner}`, 'x-actor-uid': 'someone', 'x-actor-role': 'viewer' } });
  const out = await proxy(r);
  assert.equal(h(out, 'x-actor-uid'), 'owner');
  assert.equal(h(out, 'x-actor-role'), 'owner');
});
await t('a failing lookup falls back to the person\'s own workspace (never to more access)', async () => {
  setWorkspaceResolver(async () => { throw new Error('db down'); });
  const r = await proxy(req('/api/deals?userId=mgr', { token: tokens.mgr }));
  assert.equal(h(r, 'x-user-id'), null); // blocked by invite list: mgr@x.com is not on it, and no workspace was granted
  assert.equal(r.status, 403);
});
console.log(`${n} passed`);
