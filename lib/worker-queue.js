// lib/worker-queue.js
// "Run it on my computer": a request typed in the web app that the Python worker (on the owner's own machine) picks up,
// runs with its slow, thorough search, and delivers to the Lead Inbox. The app never reaches into the owner's computer:
// the worker asks the app what is waiting. Pure functions over one small state object; the server stores it.
//
// Status: queued -> running (claimed by the worker) -> done | failed.  A queued request can be cancelled.
// A request the worker claimed but never finished (laptop closed) becomes claimable again after LEASE_MS.

export const MAX_QUEUED = 5;      // waiting requests at once, so a runaway page cannot pile up work
export const MAX_KEEP = 15;       // history kept for the screen
export const LEASE_MS = 6 * 60 * 60 * 1000;
export const MAX_CLAIM = 3;       // handed to the worker per visit

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function emptyState() { return { requests: [] }; }

export function normalizeState(raw) {
  const list = Array.isArray(raw?.requests) ? raw.requests : [];
  return {
    requests: list
      .filter((r) => r && typeof r.id === 'string' && ['queued', 'running', 'done', 'failed', 'cancelled'].includes(r.status))
      .slice(0, 60),
  };
}

/** What the owner typed -> a request the worker can run, or a plain-language reason it cannot. */
export function cleanRequest(input = {}) {
  const query = clean(input.query, 120);
  const location = clean(input.location, 120);
  if (query.length < 2) return { error: 'Type what kind of business to find, for example "plumbers".' };
  if (!location && !/\sin\s+\S/i.test(query)) return { error: 'Add where to look, for example "Colombo, Sri Lanka".' };
  return { value: { query, location, requireWebsite: input.requireWebsite !== false } };
}

export function addRequest(state, input, now = Date.now(), id = `w${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`) {
  const s = normalizeState(state);
  const c = cleanRequest(input);
  if (c.error) return { error: c.error, code: 'BAD_REQUEST' };
  if (s.requests.filter((r) => r.status === 'queued').length >= MAX_QUEUED) {
    return { error: `${MAX_QUEUED} requests are already waiting. Run the worker on your computer first, or cancel one.`, code: 'QUEUE_FULL' };
  }
  const dup = s.requests.find((r) => r.status === 'queued' && r.query.toLowerCase() === c.value.query.toLowerCase() && r.location.toLowerCase() === c.value.location.toLowerCase());
  if (dup) return { error: 'That search is already waiting for your computer.', code: 'DUPLICATE' };
  const req = { id, ...c.value, status: 'queued', createdAt: now };
  return { state: { requests: [req, ...s.requests].slice(0, MAX_KEEP + MAX_QUEUED) }, request: req };
}

export function cancelRequest(state, id) {
  const s = normalizeState(state);
  const r = s.requests.find((x) => x.id === id);
  if (!r) return { error: 'That request was not found.', code: 'NOT_FOUND' };
  if (r.status !== 'queued') return { error: 'Only a request that has not started can be cancelled.', code: 'NOT_QUEUED' };
  return { state: { requests: s.requests.map((x) => (x.id === id ? { ...x, status: 'cancelled', finishedAt: Date.now() } : x)) } };
}

/** The worker asks "what is waiting?". Oldest first; anything it already holds but let expire comes back too. */
export function claimRequests(state, now = Date.now()) {
  const s = normalizeState(state);
  const open = s.requests
    .filter((r) => r.status === 'queued' || (r.status === 'running' && now - (r.claimedAt || 0) > LEASE_MS))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, MAX_CLAIM);
  const ids = new Set(open.map((r) => r.id));
  const requests = s.requests.map((r) => (ids.has(r.id) ? { ...r, status: 'running', claimedAt: now } : r));
  return { state: { requests }, claimed: open.map((r) => ({ id: r.id, query: r.query, location: r.location, requireWebsite: r.requireWebsite !== false })) };
}

export function completeRequest(state, id, result = {}, now = Date.now()) {
  const s = normalizeState(state);
  const r = s.requests.find((x) => x.id === id);
  if (!r) return { error: 'That request was not found.', code: 'NOT_FOUND' };
  if (r.status !== 'running') return { error: 'That request is not running.', code: 'NOT_RUNNING' };
  const n = (v) => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
  const status = result.status === 'failed' ? 'failed' : 'done';
  const done = { ...r, status, finishedAt: now, added: n(result.added), skipped: n(result.skipped), ready: n(result.ready), note: clean(result.note, 200) };
  const requests = s.requests.map((x) => (x.id === id ? done : x));
  // Keep every unfinished request, and only the newest finished ones.
  const unfinished = requests.filter((x) => x.status === 'queued' || x.status === 'running');
  const finished = requests.filter((x) => x.status !== 'queued' && x.status !== 'running').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, MAX_KEEP);
  return { state: { requests: [...unfinished, ...finished].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) } };
}

/** What the screen shows. Nothing secret lives in a request, but only the useful fields leave the server. */
export function viewState(state, now = Date.now()) {
  return normalizeState(state).requests.map((r) => ({
    id: r.id, query: r.query, location: r.location, status: r.status, createdAt: r.createdAt || 0, finishedAt: r.finishedAt || 0,
    added: r.added || 0, skipped: r.skipped || 0, ready: r.ready || 0, note: r.note || '',
    stale: r.status === 'running' && now - (r.claimedAt || 0) > LEASE_MS,
  }));
}
