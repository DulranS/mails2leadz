// lib/server/shared-cache.js - a small cache that every server instance shares when REDIS_URL is set.
// Serverless instances each keep their own memory, so without a shared store a suspension or plan change can take a minute
// to reach every running instance. With Redis it reaches all of them at once.
// Without REDIS_URL, or while Redis is unreachable, it falls back to per-instance memory (the previous behaviour).
// A cache failure is always a miss for the caller, never an error.
import { redisClient } from '../redis.js';

const local = new Map(); // key -> { value, exp }
const PREFIX = 'ac:';
const live = () => (redisClient && redisClient.isReady ? redisClient : null);

function pruneLocal() {
  const now = Date.now();
  for (const [k, v] of local) if (v.exp <= now) local.delete(k);
}

/** 'redis' when the shared store is connected right now, otherwise 'memory'. */
export function sharedBackend() {
  return live() ? 'redis' : 'memory';
}

/** @returns {Promise<any|null>} the cached value, or null on a miss or after expiry */
export async function sharedGet(key) {
  const r = live();
  if (r) {
    try {
      const raw = await r.get(PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      console.warn('[shared-cache] redis read failed, using memory:', e?.message);
    }
  }
  const hit = local.get(key);
  if (!hit) return null;
  if (hit.exp <= Date.now()) { local.delete(key); return null; }
  return hit.value;
}

/** Stores a JSON-serialisable value for ttlMs. Always kept in memory too, so a Redis outage still leaves a short cache. */
export async function sharedSet(key, value, ttlMs) {
  if (local.size > 1000) pruneLocal();
  local.set(key, { value, exp: Date.now() + ttlMs });
  const r = live();
  if (r) {
    try { await r.set(PREFIX + key, JSON.stringify(value), { PX: ttlMs }); }
    catch (e) { console.warn('[shared-cache] redis write failed:', e?.message); }
  }
}

/** Removes a key everywhere, so the next read goes to the database. */
export async function sharedDel(key) {
  local.delete(key);
  const r = live();
  if (r) {
    try { await r.del(PREFIX + key); }
    catch (e) { console.warn('[shared-cache] redis delete failed:', e?.message); }
  }
}
