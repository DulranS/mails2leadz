// The server runs "Run it on my computer" requests itself (v391): one request at a time, waits for the owner's own search, and reports back.
// Uses fake storage and fake searches, so it needs no network or database. Run: node tests/worker-queue-runner.test.mjs
import assert from 'node:assert/strict';
import { runQueueStep, RUNNER_TIME_BOX_MS } from '../lib/server/worker-queue-runner.js';
import { FinderError } from '../lib/server/lead-finder-io.js';
import { LEASE_MS } from '../lib/worker-queue.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-24T06:00:00Z');
const req = (id, extra = {}) => ({ id, query: 'plumbers', location: 'Colombo', requireWebsite: true, status: 'queued', createdAt: NOW - 1000, ...extra });

function fakeDeps({ requests = [], job = null, startError = null, steps = [{ finished: true }], finalJob } = {}) {
  const log = { starts: [], steps: [], saved: [] };
  let queue = { requests };
  let currentJob = job;
  let stepIndex = 0;
  const deps = {
    now: () => NOW,
    loadQueue: async () => JSON.parse(JSON.stringify(queue)),
    saveQueue: async (_uid, state) => { queue = JSON.parse(JSON.stringify(state)); log.saved.push(queue); },
    loadJob: async () => currentJob,
    startSearch: async (_uid, search, opts) => {
      log.starts.push({ search, opts });
      if (startError) throw startError;
      currentJob = { status: 'running', source: opts.source, stats: {} };
      return currentJob;
    },
    runStep: async (_uid, opts) => {
      log.steps.push(opts);
      const step = steps[Math.min(stepIndex++, steps.length - 1)];
      if (step.finished) currentJob = finalJob ?? { ...currentJob, status: 'done', stats: { delivered: 3, alreadySeen: 2, queued: 5 }, note: '' };
      return { job: currentJob, added: 0, finished: step.finished, waiting: '' };
    },
  };
  return { deps, log, queueNow: () => queue };
}

await t('nothing queued means idle, and nothing starts', async () => {
  const { deps, log } = fakeDeps({ requests: [] });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'idle');
  assert.equal(log.starts.length, 0);
});

await t('the oldest queued request starts, marked running, with the search tagged to its id', async () => {
  const { deps, log, queueNow } = fakeDeps({ requests: [req('b', { createdAt: NOW - 500 }), req('a', { createdAt: NOW - 900 })], steps: [{ finished: false }] });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'running');
  assert.equal(r.handled, 'a');
  assert.equal(log.starts[0].opts.source, 'queue:a');
  assert.deepEqual(log.starts[0].search, { query: 'plumbers', location: 'Colombo', minScore: 40 });
  assert.equal(queueNow().requests.find((x) => x.id === 'a').status, 'running');
  assert.equal(queueNow().requests.find((x) => x.id === 'b').status, 'queued');
  assert.equal(log.steps[0].onlyIfSource, 'queue:a');
  assert.equal(log.steps[0].deadline, NOW + RUNNER_TIME_BOX_MS);
  assert.equal(log.starts[0].opts.requireWebsite, true, 'the request asks for a website by default, as the worker did');
});

await t('a finished search reports done, with what was delivered and what was already known', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:a', stats: {} } });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'done');
  const done = queueNow().requests[0];
  assert.equal(done.status, 'done');
  assert.equal(done.added, 3);
  assert.equal(done.skipped, 2);
  assert.equal(done.ready, 3);
});

await t('a search that found nothing new is still done, with a plain note', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:a' }, finalJob: { status: 'done', stats: { delivered: 0, alreadySeen: 4 }, note: '' } });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'done');
  assert.equal(queueNow().requests[0].added, 0);
  assert.match(queueNow().requests[0].note, /Nothing new/);
});

await t('a search still in progress stays running and is not reported yet', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:a' }, steps: [{ finished: false }] });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'running');
  assert.equal(queueNow().requests[0].status, 'running');
});

await t('the queue waits while the owner runs a search in the app, and does not replace it', async () => {
  const { deps, log, queueNow } = fakeDeps({ requests: [req('a')], job: { status: 'running', source: 'manual', stats: {} } });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'waiting-app-search');
  assert.equal(log.starts.length, 0);
  assert.equal(queueNow().requests[0].status, 'queued');
});

await t('a request that hits today\'s search allowance goes back to waiting, not failed', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a')], startError: new FinderError('limit', 'DAILY_LIMIT') });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'waiting-limit');
  assert.equal(queueNow().requests[0].status, 'queued');
});

await t('a search the map refuses is reported as failed, with the reason', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a')], startError: new FinderError('Type where to look, for example "Colombo".', 'BAD_SEARCH') });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'failed');
  assert.equal(queueNow().requests[0].status, 'failed');
  assert.match(queueNow().requests[0].note, /Type where to look/);
});

await t('a running request whose search has vanished is reported as failed, so the queue is not stuck', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: null });
  const r = await runQueueStep(null, 'u1', deps);
  assert.equal(r.state, 'failed');
  assert.equal(queueNow().requests[0].status, 'failed');
});

await t('a request claimed long ago and never finished is released to wait its turn again', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - LEASE_MS - 1000 })], steps: [{ finished: false }] });
  await runQueueStep(null, 'u1', deps);
  const a = queueNow().requests[0];
  assert.equal(a.status, 'running');
  assert.ok(a.claimedAt === NOW, 'claimed again now, not left stuck');
});

await t('the owner gets a message when a queued search adds leads, and when it does not finish, but not for an empty result', async () => {
  const sent = [];
  const base = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:a' } });
  const withSend = { ...base.deps, notifyUrl: async () => 'https://ntfy.sh/topic', send: async (url, notice) => { sent.push({ url, notice }); return { sent: true }; } };
  await runQueueStep(null, 'u1', withSend);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://ntfy.sh/topic');
  assert.match(sent[0].notice.text, /3 added/);

  const empty = fakeDeps({ requests: [req('b', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:b' }, finalJob: { status: 'done', stats: { delivered: 0, alreadySeen: 1 }, note: '' } });
  const sent2 = [];
  await runQueueStep(null, 'u1', { ...empty.deps, notifyUrl: async () => 'https://ntfy.sh/topic', send: async (u, notice) => { sent2.push(notice); return { sent: true }; } });
  assert.equal(sent2.length, 0, 'an empty result sends nothing');

  const broken = fakeDeps({ requests: [req('c')], startError: new FinderError('bad', 'BAD_SEARCH') });
  const sent3 = [];
  await runQueueStep(null, 'u1', { ...broken.deps, notifyUrl: async () => 'https://ntfy.sh/topic', send: async (u, notice) => { sent3.push(notice); return { sent: true }; } });
  assert.equal(sent3.length, 1);
  assert.match(sent3[0].title, /did not finish/);
});

await t('a failed message does not change the result', async () => {
  const { deps, queueNow } = fakeDeps({ requests: [req('a', { status: 'running', claimedAt: NOW - 1000 })], job: { status: 'running', source: 'queue:a' } });
  const r = await runQueueStep(null, 'u1', { ...deps, notifyUrl: async () => 'https://ntfy.sh/topic', send: async () => { throw new Error('network down'); } });
  assert.equal(r.state, 'done');
  assert.equal(queueNow().requests[0].status, 'done');
});

console.log(`\nworker-queue-runner: ${n} passed`);
