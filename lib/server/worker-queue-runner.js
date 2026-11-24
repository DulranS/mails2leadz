// lib/server/worker-queue-runner.js - the server runs "Run it on my computer" requests itself, so the Python worker is no longer needed.
//
// What the Python worker did for one queued request: one OpenStreetMap search of the place, read each business's website, score it,
// keep the ones worth contacting, and deliver them to the Lead Inbox. The in-app finder already does exactly that as a resumable job
// (lead-finder-job.js). This runner feeds it one queued request at a time and reports the result back to the queue.
//
// Rules: one request runs at a time per owner. A search the owner started in the app goes first, and the queue waits for it.
// A request that hits today's search allowance goes back to waiting instead of failing. Each call does a little work and returns,
// so the page (and the daily sweep) call it again until the queue is empty.
import { loadWorkerQueue, saveWorkerQueue } from './worker-queue-store.js';
import { completeRequest, LEASE_MS } from '../worker-queue.js';
import { startSearch, runStep, loadJob } from './lead-finder-job.js';
import { FinderError } from './lead-finder-io.js';
import { WARM_SCORE } from '../lead-finder.js';
import { queueNoticeText, sendNotice } from './notify-owner.js';
import { getDoc, doc } from '../server-firestore.js';

export const RUNNER_TIME_BOX_MS = 25000;
const sourceFor = (id) => `queue:${id}`;

/** The real storage and search functions. Tests pass fakes with the same shape. */
export function defaultRunnerDeps(db) {
  return {
    now: () => Date.now(),
    loadQueue: (uid) => loadWorkerQueue(db, uid),
    saveQueue: (uid, state) => saveWorkerQueue(db, uid, state),
    loadJob: (uid) => loadJob(db, uid),
    startSearch: (uid, search, opts) => startSearch(db, uid, search, opts),
    runStep: (uid, opts) => runStep(db, uid, opts),
    notifyUrl: async (uid) => { try { const d = await getDoc(doc(db, 'users', uid, 'settings', 'lead_finder')); return d.exists() ? (d.data().notifyUrl || '') : ''; } catch { return ''; } },
    send: (url, notice) => sendNotice(url, notice),
  };
}

async function release(uid, id, deps) {
  const q = await deps.loadQueue(uid);
  await deps.saveQueue(uid, { requests: q.requests.map((r) => (r.id === id && r.status === 'running' ? { ...r, status: 'queued', claimedAt: 0 } : r)) });
}

async function finish(uid, id, result, deps) {
  const q = await deps.loadQueue(uid);
  const out = completeRequest(q, id, result, deps.now());
  if (out.error) return { handled: id, state: 'error', error: out.error };
  await deps.saveQueue(uid, out.state);
  // The owner's message: when leads were added, or when the search did not finish (the worker's "leads and errors" setting).
  const request = q.requests.find((r) => r.id === id) || {};
  if ((result.status === 'done' && result.added > 0) || result.status === 'failed') {
    try {
      const url = deps.notifyUrl ? await deps.notifyUrl(uid) : '';
      if (url && deps.send) await deps.send(url, queueNoticeText(request, result));
    } catch { /* a failed message never changes the result */ }
  }
  return { handled: id, state: result.status };
}

/** Work on the one request that is running: read a little more of its search, then report when it is finished. */
async function continueRunning(uid, running, deps) {
  const job = await deps.loadJob(uid);
  if (!job || job.source !== sourceFor(running.id)) {
    return finish(uid, running.id, { status: 'failed', note: 'The search stopped before it finished. Queue it again.' }, deps);
  }
  const step = await deps.runStep(uid, { deadline: deps.now() + RUNNER_TIME_BOX_MS, onlyIfSource: sourceFor(running.id) });
  if (!step.finished) return { handled: running.id, state: 'running' };
  const finished = step.job || job;
  const s = finished.stats || {};
  const added = Number(s.delivered) || 0;
  const note = added ? '' : (finished.note || 'Nothing new was found for this search.');
  return finish(uid, running.id, { status: 'done', added, skipped: Number(s.alreadySeen) || 0, ready: added, note }, deps);
}

/**
 * One time-boxed step of the owner's queue. Returns { handled, state } where state is one of:
 * idle (nothing queued), waiting-app-search, waiting-limit, running, done, failed, error.
 */
export async function runQueueStep(db, uid, deps = defaultRunnerDeps(db)) {
  const now = deps.now();
  let queue = await deps.loadQueue(uid);
  const running = queue.requests.find((r) => r.status === 'running');
  if (running && now - (running.claimedAt || 0) <= LEASE_MS) return continueRunning(uid, running, deps);
  if (running) { // claimed long ago and never finished: wait its turn again, and read the queue afresh
    await release(uid, running.id, deps);
    queue = await deps.loadQueue(uid);
  }

  const next = queue.requests
    .filter((r) => r.status === 'queued')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
  if (!next) return { handled: '', state: 'idle' };

  const job = await deps.loadJob(uid);
  if (job && job.status === 'running' && !String(job.source || '').startsWith('queue:')) return { handled: '', state: 'waiting-app-search' };

  const fresh = await deps.loadQueue(uid);
  await deps.saveQueue(uid, { requests: fresh.requests.map((r) => (r.id === next.id ? { ...r, status: 'running', claimedAt: now } : r)) });
  try {
    await deps.startSearch(uid, { query: next.query, location: next.location, minScore: WARM_SCORE }, { source: sourceFor(next.id), deadline: now + RUNNER_TIME_BOX_MS, requireWebsite: next.requireWebsite !== false });
  } catch (e) {
    if (e instanceof FinderError && e.code === 'DAILY_LIMIT') {
      await release(uid, next.id, deps);
      return { handled: next.id, state: 'waiting-limit' };
    }
    return finish(uid, next.id, { status: 'failed', note: String(e?.message || 'The search could not start.').slice(0, 200) }, deps);
  }
  return continueRunning(uid, { ...next, status: 'running', claimedAt: now }, deps);
}
