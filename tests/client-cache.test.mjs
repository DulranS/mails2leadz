// Client cache (Pass 223): screens that mount together share one request; a fresh request always goes to the server; a failed request is not kept.
import assert from 'node:assert/strict';
import { cachedJson, clearCache } from '../lib/client-cache.js';

let n = 0; const t = async (name, fn) => { clearCache(); await fn(); n++; console.log('  ok -', name); };
const counting = () => {
  const calls = { n: 0 };
  const fetchImpl = async (url) => { calls.n++; return { ok: true, json: async () => ({ url, call: calls.n }) }; };
  return { calls, fetchImpl };
};

await t('screens that mount at the same moment share one request', async () => {
  const { calls, fetchImpl } = counting();
  const [a, b, c] = await Promise.all([cachedJson('/api/kpis', { fetchImpl }), cachedJson('/api/kpis', { fetchImpl }), cachedJson('/api/kpis', { fetchImpl })]);
  assert.equal(calls.n, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

await t('a value is reused for a few seconds, then requested again', async () => {
  const { calls, fetchImpl } = counting();
  await cachedJson('/api/deals', { fetchImpl });
  await cachedJson('/api/deals', { fetchImpl });
  assert.equal(calls.n, 1);
  await cachedJson('/api/deals', { fetchImpl, ttlMs: 0 });
  assert.equal(calls.n, 2);
});

await t('a fresh request always goes to the server, after a save', async () => {
  const { calls, fetchImpl } = counting();
  await cachedJson('/api/support', { fetchImpl });
  const after = await cachedJson('/api/support', { fetchImpl, fresh: true });
  assert.equal(calls.n, 2);
  assert.equal(after.call, 2);
});

await t('a failed request is not kept, so the next call tries again', async () => {
  let fail = true;
  const fetchImpl = async () => { if (fail) return { ok: false }; return { ok: true, json: async () => ({ ok: 1 }) }; };
  await assert.rejects(cachedJson('/api/kpis', { fetchImpl }));
  fail = false;
  assert.deepEqual(await cachedJson('/api/kpis', { fetchImpl }), { ok: 1 });
});

console.log(`\n${n} passed`);
