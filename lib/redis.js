// lib/redis.js
// Redis client configuration with proper initialization
import { createClient } from 'redis';

let _redisClient = null;
let _initialized = false;

/**
 * Initialise the Redis client (singleton).
 * The first call returns the connected client; subsequent calls return the same instance.
 */
export const initializeRedis = () => {
  if (_initialized) {
    return _redisClient;
  }
  
  _initialized = true;
  
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set – Redis caching disabled');
    return null;
  }
  
  try {
    _redisClient = createClient({ url: process.env.REDIS_URL });
    _redisClient.on('error', err => {
      console.error('Redis client error:', err);
    });
    _redisClient.connect().catch(err => console.error('Redis connection failed:', err));
  } catch (err) {
    console.error('Redis initialization failed:', err);
    _redisClient = null;
  }
  
  return _redisClient;
};

/**
 * Get the redis client - call initializeRedis() first if using at runtime
 */
export const getRedisClient = () => {
  return _redisClient;
};

/**
 * Export a lazy-loaded proxy that initializes on first access
 */
export const redisClient = new Proxy({}, {
  get(target, prop) {
    if (!_initialized) {
      initializeRedis();
    }
    return _redisClient?.[prop];
  }
});