import test from 'node:test';
import assert from 'node:assert/strict';

// No REDIS_URL: the module must work on per-instance memory alone. Imported after clearing the variable, because lib/redis.js reads it on load.
delete process.env.REDIS_URL;
const { sharedGet, sharedSet, sharedDel, sharedBackend } = await import('../lib/server/shared-cache.js');

test('without REDIS_URL the cache runs on memory and round-trips a value', async () => {
  assert.equal(sharedBackend(), 'memory');
  await sharedSet('k1', { plan: 'growth', n: 2 }, 60000);
  assert.deepEqual(await sharedGet('k1'), { plan: 'growth', n: 2 });
});

test('an entry expires after its ttl', async () => {
  await sharedSet('k2', 'x', 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await sharedGet('k2'), null);
});

test('delete removes the entry, so the next read is a miss', async () => {
  await sharedSet('k3', 1, 60000);
  await sharedDel('k3');
  assert.equal(await sharedGet('k3'), null);
});

test('an unknown key is a miss, never an error', async () => {
  assert.equal(await sharedGet('never-set'), null);
});
