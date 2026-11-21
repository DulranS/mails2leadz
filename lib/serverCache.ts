// Tiny in-memory TTL cache for server-side (Node runtime) request handlers.
// Not shared across serverless instances -- it's a best-effort cache to avoid
// redundant Firestore reads within a single warm instance, not a source of
// truth. Never used for anything correctness-sensitive.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Sweep is opportunistic (called after writes) rather than on a timer, so we
// don't need to worry about cleaning up intervals in a serverless runtime.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

// Best-effort cleanup of expired entries so the map doesn't grow unbounded
// across a long-lived warm instance. Cheap to call often since it no-ops
// unless the sweep interval has elapsed.
export function maybeSweep(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}
