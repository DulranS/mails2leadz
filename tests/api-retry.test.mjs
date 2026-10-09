// A failed "send" must never be repeated automatically (the lead could get the email twice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { retryFetch } from '../lib/api-retry.js';

const stubFetch = (status) => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { status, ok: status < 400 }; };
  return () => calls;
};

test('POST /api/send-* is tried exactly once even on a 500', async () => {
  const calls = stubFetch(500);
  await assert.rejects(() => retryFetch('http://x.test/api/send-followup', { method: 'POST' }, 2));
  assert.equal(calls(), 1);
});

test('POST /api/make-call is tried exactly once', async () => {
  const calls = stubFetch(503);
  await assert.rejects(() => retryFetch('http://x.test/api/make-call', { method: 'POST' }, 2));
  assert.equal(calls(), 1);
});

test('GET reads are still retried on a 5xx', async () => {
  const calls = stubFetch(500);
  await assert.rejects(() => retryFetch('http://x.test/api/list-sent-leads', { method: 'GET' }, 1));
  assert.equal(calls(), 2);
});

test('a 4xx answer is returned as is, without retry', async () => {
  const calls = stubFetch(409);
  const res = await retryFetch('http://x.test/api/send-followup', { method: 'POST' }, 2);
  assert.equal(res.status, 409);
  assert.equal(calls(), 1);
});
