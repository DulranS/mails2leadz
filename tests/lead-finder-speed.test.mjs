// Lead finder map requests (Pass 168): the first good answer wins, and a repeated query is answered from memory.
import assert from 'node:assert/strict';
import { firstOk, overpassCacheApi } from '../lib/server/lead-finder-io.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('when two servers answer, the first good answer is used at once, even if the other is slow or failed', async () => {
  const slow = new Promise((r) => setTimeout(() => r({ ok: true, data: { slow: true } }), 200));
  const fast = Promise.resolve({ ok: true, data: { fast: true } });
  const r = await firstOk([slow, fast]);
  assert.deepEqual(r.data, { fast: true });
  const failed = Promise.resolve({ ok: false, why: 'HTTP 503' });
  const good = new Promise((res) => setTimeout(() => res({ ok: true, data: { good: 1 } }), 20));
  assert.deepEqual((await firstOk([failed, good])).data, { good: 1 });
});

t('when every server fails, the last failure is returned, and a fatal one is passed through', async () => {
  assert.equal((await firstOk([Promise.resolve({ ok: false, why: 'timed out' }), Promise.resolve({ ok: false, why: 'HTTP 504' })])).ok, false);
  const fatal = { ok: false, fatal: new Error('bad query') };
  assert.equal((await firstOk([Promise.resolve(fatal), Promise.resolve({ ok: false, why: 'x' })])).fatal.message, 'bad query');
});

t('a repeated query is answered from memory; an empty cache answers nothing', () => {
  overpassCacheApi.clear();
  assert.equal(overpassCacheApi.get('[out:json];node(1,2,3,4);out;'), null);
  overpassCacheApi.put('[out:json];node(1,2,3,4);out;', { elements: [{ id: 1 }] });
  assert.deepEqual(overpassCacheApi.get('[out:json];node(1,2,3,4);out;'), { elements: [{ id: 1 }] });
  overpassCacheApi.clear();
});

console.log(`\n${n} passed`);
