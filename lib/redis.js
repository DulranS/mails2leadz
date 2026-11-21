// lib/redis.js
// Redis client configuration with proper initialization
import { createClient } from 'redis';

let _redisClient = null;

/**
 * Initialise the Redis client (singleton).
 * The first call returns the connected client; subsequent calls return the same instance.
 */
// REDIS_URL is read from the environment and may be pasted in a form the client cannot use: with the "redis-cli -u" prefix, quotes or
// spaces. Those are cleaned up here. A value that still is not a redis:// address, or that the client refuses, disables Redis (the app falls back
// to memory) instead of throwing at import time, which failed the whole build. The URL is never logged: it carries the password.
export const normaliseRedisUrl = (raw) => {
  let v = String(raw || "").trim();
  v = v.replace(/^redis-cli\s+(-u\s+)?/i, "").trim();
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("\x27") && v.endsWith("\x27"))) v = v.slice(1, -1).trim();
  return /^rediss?:\/\/\S+$/i.test(v) ? v : null;
};

export const initializeRedis = () => {
  if (!_redisClient) {
    if (!process.env.REDIS_URL) {
      console.warn("REDIS_URL not set – Redis caching disabled");
      return null;
    }
    const url = normaliseRedisUrl(process.env.REDIS_URL);
    if (!url) {
      console.error("REDIS_URL is not a redis:// or rediss:// address – Redis caching disabled. Set it to the bare URL, without the \"redis-cli -u\" prefix.");
      return null;
    }
    try {
      // disableOfflineQueue: while disconnected, commands fail at once (the caller falls back to memory) instead of queueing and
      // holding the request open. connectTimeout keeps a dead Redis from blocking the first call for long.
      const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 3000 } });
      client.on("error", (err) => {
        console.error("Redis client error:", err?.message || err);
      });
      client.connect().catch((err) => console.error("Redis connection failed:", err?.message || err));
      _redisClient = client;
    } catch (err) {
      console.error("Redis client could not start – Redis caching disabled:", err?.message || err);
      return null;
    }
  }
  return _redisClient;
};

/**
 * Export the initialized client – every import gets the same singleton.
 */
export const redisClient = initializeRedis();