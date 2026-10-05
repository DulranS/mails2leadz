// lib/redis.js
// Redis client configuration with proper initialization
import { createClient } from 'redis';

let _redisClient = null;

/**
 * Initialise the Redis client (singleton).
 * The first call returns the connected client; subsequent calls return the same instance.
 */
export const initializeRedis = () => {
  if (!_redisClient) {
    if (!process.env.REDIS_URL) {
      console.warn('REDIS_URL not set – Redis caching disabled');
      return null;
    }
    _redisClient = createClient({ url: process.env.REDIS_URL });
    _redisClient.on('error', err => {
      console.error('Redis client error:', err);
    });
    _redisClient.connect().catch(err => console.error('Redis connection failed:', err));
  }
  return _redisClient;
};

/**
 * Export the initialized client – every import gets the same singleton.
 */
export const redisClient = initializeRedis();