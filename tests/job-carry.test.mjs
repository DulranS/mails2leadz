import test from 'node:test';
import assert from 'node:assert/strict';
import { carryJobForward } from '../lib/server/lead-finder-job.js';

test('a running job is stepped until it finishes, and the nightly run reports what it added', async () => {
  let calls = 0;
  const step = async () => { calls++; return calls < 3 ? { added: 4, finished: false, waiting: '' } : { added: 2, finished: true, waiting: '' }; };
  const r = await carryJobForward(null, 'u1', { ctx: null, until: Date.now() + 60000, deps: {}, step });
  assert.equal(calls, 3);
  assert.equal(r.added, 10);
});

test('it stops at the time box, and when the daily limit gives it nothing to add', async () => {
  let calls = 0;
  const waiting = async () => { calls++; return { added: 0, finished: false, waiting: 'daily limit' }; };
  await carryJobForward(null, 'u1', { ctx: null, until: Date.now() + 60000, deps: {}, step: waiting });
  assert.equal(calls, 1);
  let spun = 0;
  const expired = async () => { spun++; return { added: 1, finished: false, waiting: '' }; };
  await carryJobForward(null, 'u1', { ctx: null, until: Date.now() - 1000, deps: {}, step: expired });
  assert.equal(spun, 0);
});
