import test from 'node:test';
import assert from 'node:assert/strict';
import { addRequest, cancelRequest, claimRequests, completeRequest, cleanRequest, viewState, emptyState, MAX_QUEUED, LEASE_MS } from '../lib/worker-queue.js';

const T = 1_700_000_000_000;
const add = (s, q = 'plumbers', l = 'Colombo, Sri Lanka', t = T) => addRequest(s, { query: q, location: l }, t, `id${q}${l}${t}`);

test('a request needs a business type and a place', () => {
  assert.match(cleanRequest({ query: '' }).error, /kind of business/);
  assert.match(cleanRequest({ query: 'plumbers' }).error, /where/i);
  assert.equal(cleanRequest({ query: 'plumbers in Leeds, UK' }).value.location, '');
  const ok = cleanRequest({ query: '  plumbers\n', location: ' Colombo ' });
  assert.deepEqual(ok.value, { query: 'plumbers', location: 'Colombo', requireWebsite: true });
  assert.equal(cleanRequest({ query: 'a'.repeat(500), location: 'x' }).value.query.length, 120);
});

test('queue, duplicate and limit', () => {
  let s = emptyState();
  const first = add(s);
  assert.equal(first.request.status, 'queued');
  s = first.state;
  assert.equal(add(s).code, 'DUPLICATE');
  for (let i = 1; i < MAX_QUEUED; i++) s = add(s, `shop${i}`).state;
  assert.equal(add(s, 'one more').code, 'QUEUE_FULL');
});

test('worker claims oldest first, once; a claimed request is not handed out twice', () => {
  let s = add(add(emptyState(), 'aa', 'x', T).state, 'bb', 'x', T + 5).state;
  const first = claimRequests(s, T + 10);
  assert.deepEqual(first.claimed.map((r) => r.query), ['aa', 'bb']);
  assert.ok(first.state.requests.every((r) => r.status === 'running'));
  assert.equal(claimRequests(first.state, T + 20).claimed.length, 0);
});

test('a request the computer never finished is offered again after the lease', () => {
  const s = claimRequests(add(emptyState()).state, T).state;
  assert.equal(claimRequests(s, T + LEASE_MS - 1).claimed.length, 0);
  assert.equal(claimRequests(s, T + LEASE_MS + 1).claimed.length, 1);
  assert.equal(viewState(s, T + LEASE_MS + 1)[0].stale, true);
});

test('complete records the result; only a running request can complete', () => {
  const queued = add(emptyState()).state;
  const id = queued.requests[0].id;
  assert.equal(completeRequest(queued, id, { status: 'done' }).code, 'NOT_RUNNING');
  const running = claimRequests(queued, T).state;
  const done = completeRequest(running, id, { status: 'done', added: 12, skipped: 3, ready: 15, note: 'ok' }, T + 100);
  const v = viewState(done.state)[0];
  assert.deepEqual([v.status, v.added, v.skipped, v.ready], ['done', 12, 3, 15]);
  assert.equal(completeRequest(done.state, id, { status: 'done' }).code, 'NOT_RUNNING');
  assert.equal(completeRequest(running, 'nope', {}).code, 'NOT_FOUND');
  const failed = completeRequest(running, id, { status: 'failed', note: 'x'.repeat(999) });
  assert.equal(viewState(failed.state)[0].status, 'failed');
  assert.equal(viewState(failed.state)[0].note.length, 200);
});

test('cancel works only before the worker starts it', () => {
  const q = add(emptyState()).state;
  const id = q.requests[0].id;
  assert.equal(viewState(cancelRequest(q, id).state)[0].status, 'cancelled');
  assert.equal(claimRequests(cancelRequest(q, id).state, T).claimed.length, 0);
  assert.equal(cancelRequest(claimRequests(q, T).state, id).code, 'NOT_QUEUED');
  assert.equal(cancelRequest(q, 'zzz').code, 'NOT_FOUND');
});

test('garbage state is repaired, not trusted', () => {
  assert.deepEqual(viewState({ requests: [null, { id: 5 }, { id: 'a', status: 'weird' }] }), []);
  assert.deepEqual(viewState(undefined), []);
});
