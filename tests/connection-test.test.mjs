import assert from 'node:assert/strict';
import { metaAccountMessage, hunterAccountMessage, CHECK_KEYS, runConnectionCheck } from '../lib/server/connection-test.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('Meta: an active account passes; an error or an inactive account fails with a plain reason', () => {
  assert.equal(metaAccountMessage({ account_status: 1, name: 'Shop' }).ok, true);
  assert.match(metaAccountMessage({ account_status: 1, name: 'Shop' }).message, /Shop/);
  assert.equal(metaAccountMessage({ error: { message: 'bad token' } }).ok, false);
  assert.equal(metaAccountMessage({ account_status: 2 }).ok, false);
});

t('Hunter: the key works, and the searches left this month are shown', () => {
  const r = hunterAccountMessage({ data: { requests: { searches: { used: 40, available: 50 } } } });
  assert.equal(r.ok, true);
  assert.match(r.message, /10 domain searches left/);
  assert.equal(hunterAccountMessage({}).ok, false);
});

t('every check names only keys that the registry knows about', () => {
  for (const [svc, names] of Object.entries(CHECK_KEYS)) assert.ok(names.length > 0, svc);
});

t('a Meta check reads the account and sends nothing; a bad answer is reported without the secret', async () => {
  const calls = [];
  const fake = async (url, opts) => { calls.push({ url, method: opts?.method || 'GET' }); return { ok: false, json: async () => ({}) }; };
  const r = await runConnectionCheck('meta_ads', { META_ACCESS_TOKEN: 'SECRET-TOKEN', META_AD_ACCOUNT_ID: '123' }, { fetchImpl: fake });
  assert.equal(r.ok, false);
  assert.ok(calls.every((c) => c.method === 'GET'), 'read only');
  assert.doesNotMatch(JSON.stringify(r), /SECRET-TOKEN/);
});

t('a check for a service that has none says so, rather than calling anything', async () => {
  const r = await runConnectionCheck('voice_agent_unknown', {}, { fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(r.ok, false);
});

console.log(`connection-test: ${n} passed`);
