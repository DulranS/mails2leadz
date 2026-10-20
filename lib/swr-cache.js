// lib/swr-cache.js - the one in-memory cache the screens share (browser only; nothing here touches the network itself).
//
// Why it exists: every page used to download its own copy of the same Firestore collections (up to ~11,000 documents for the
// Business page alone) every time you opened it, and showed a spinner while it waited. Going back and forth between pages
// therefore re-downloaded everything, re-rendered from empty, and spent the free plan's daily read allowance.
//
// How it works (stale-while-revalidate):
//   load(key, fetcher, { ttlMs })  fresh copy -> returned at once, no network.
//                                  otherwise the fetcher runs ONCE even if three pages ask at the same moment (in-flight de-dupe).
//   peek(key) / stale(key)         what is stored right now (stale = even if expired), so a page can paint instantly and
//                                  refresh quietly behind it.
//   invalidate(match)              a write (or a server call that writes) drops what it may have changed.
// A failed fetch is never stored. Keys are namespaced by the signed-in user's id, and everything is cleared when the user changes.

const store = new Map(); // key -> { data, at }
const inflight = new Map(); // key -> Promise
const listeners = new Set();
let generation = 0; // bumped by every invalidation: a fetch that started before one must not store its (possibly stale) result

const now = () => Date.now();

export function peek(key, maxAgeMs = Infinity) {
  const e = store.get(key);
  if (!e) return undefined;
  return now() - e.at <= maxAgeMs ? e.data : undefined;
}

/** Whatever is stored, however old: for painting something immediately while fresh data loads. */
export function stale(key) {
  return store.get(key)?.data;
}

export function put(key, data) {
  store.set(key, { data, at: now() });
}

export function isFresh(key, ttlMs) {
  const e = store.get(key);
  return !!e && now() - e.at <= ttlMs;
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ ttlMs?: number, force?: boolean }} [opts]
 */
export function load(key, fetcher, { ttlMs = 60000, force = false } = {}) {
  if (!force && isFresh(key, ttlMs)) return Promise.resolve(store.get(key).data);
  const running = inflight.get(key);
  if (running && !force) return running;
  const startedAt = generation;
  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (startedAt === generation) put(key, data); // an invalidation happened mid-flight: hand the data over but do not keep it
      return data;
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** match: a string prefix, a RegExp, or a predicate. Returns how many entries were dropped. */
export function invalidate(match) {
  generation++;
  const test = typeof match === 'function' ? match : match instanceof RegExp ? (k) => match.test(k) : (k) => k.startsWith(String(match));
  let n = 0;
  for (const k of [...store.keys()]) if (test(k)) { store.delete(k); n++; }
  for (const k of [...inflight.keys()]) if (test(k)) inflight.delete(k);
  listeners.forEach((fn) => { try { fn(n); } catch { /* a listener must never break a write */ } });
  return n;
}

export function clearAll() {
  generation++;
  const n = store.size;
  store.clear();
  inflight.clear();
  listeners.forEach((fn) => { try { fn(n); } catch { /* ignore */ } });
  return n;
}

/** Called after every invalidation (screens use it to refresh quietly). Returns the unsubscribe function. */
export function onInvalidate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function stats() {
  return { entries: store.size, inflight: inflight.size, generation };
}
