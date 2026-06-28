import { createClient } from 'redis';

let redisClient = null;

export const initializeRedis = () => {
  if (!redisClient) {
    if (!process.env.REDIS_URL) {
      console.warn('REDIS_URL not set, Redis caching disabled');
      return null;
    }
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    // Connect the client
    redisClient.connect().catch(console.error);
  }
  return redisClient;
};

// Initialize and export the client instance
initializeRedis();