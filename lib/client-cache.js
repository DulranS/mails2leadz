// lib/client-cache.js - read-only data requests shared between screens: one request per address at a time, reused for a few seconds. Pure logic; the fetch is passed in.
const store = new Map();
export const DEFAULT_TTL_MS = 5000;

/** Returns the parsed JSON for a GET address. A fresh request bypasses the stored value and any request still in flight. */
export function cachedJson(url, { fresh = false, ttlMs = DEFAULT_TTL_MS, fetchImpl = globalThis.fetch } = {}) {
  const hit = store.get(url);
  if (!fresh && hit) {
    if (hit.promise) return hit.promise;
    if (Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
  }
  const promise = Promise.resolve(fetchImpl(url))
    .then((r) => { if (!r || !r.ok) throw new Error('request failed'); return r.json(); })
    .then((value) => { store.set(url, { at: Date.now(), value }); return value; })
    .catch((e) => { store.delete(url); throw e; });
  store.set(url, { promise });
  return promise;
}

/** Forgets everything cached (used by tests; screens refresh with fresh requests instead). */
export function clearCache() { store.clear(); }
