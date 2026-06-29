// lib/firebase-cache.js
/**
 * Firebase Query Caching Utility
 * 
 * Provides in-memory caching for Firebase queries to reduce:
 * - Firestore read costs
 * - API latency
 * - Unnecessary database hits
 * 
 * Cache TTL (Time To Live): 5 minutes by default
 */

class FirebaseCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
    this.collectionTTLs = {
      'settings': 60 * 60 * 1000, // 60 minutes for settings (rarely changes)
      'templates': 60 * 60 * 1000, // 60 minutes for templates (rarely changes)
      'sent_emails': 1 * 60 * 1000, // 1 minute for sent emails (changes frequently)
      'deals': 3 * 60 * 1000, // 3 minutes for deals (moderate change rate)
      'company_tracking': 15 * 60 * 1000, // 15 minutes for company tracking
      'follow_up_tasks': 2 * 60 * 1000, // 2 minutes for follow-up tasks
      'replied_followup': 1 * 60 * 1000, // 1 minute for replied/follow-up data
      'manual_contact_status': 10 * 60 * 1000, // 10 minutes for manual status
      'user_settings': 30 * 60 * 1000 // 30 minutes for user settings
    };
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Generate a cache key from query parameters
   */
  generateKey(collectionName, filters = {}, options = {}) {
    const keyParts = [
      collectionName,
      JSON.stringify(filters),
      JSON.stringify(options)
    ];
    return keyParts.join('|');
  }

  /**
   * Get cached data if available and not expired
   */
  get(collectionName, filters = {}, options = {}) {
    const key = this.generateKey(collectionName, filters, options);
    const cached = this.cache.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if cache is expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached.data;
  }

  /**
   * Set data in cache with expiration
   */
  set(collectionName, data, filters = {}, options = {}, ttl) {
    const key = this.generateKey(collectionName, filters, options);

    // Use collection-specific TTL if provided, otherwise use default
    const effectiveTTL = ttl || this.collectionTTLs[collectionName] || this.defaultTTL;

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + effectiveTTL,
      createdAt: Date.now()
    });

    // Clean up old entries periodically
    if (this.cache.size > 100) {
      this.cleanup();
    }
  }

  /**
   * Remove expired entries from cache
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific collection
   */
  clearCollection(collectionName) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(collectionName + '|')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;

    for (const value of this.cache.values()) {
      if (now > value.expiresAt) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests * 100).toFixed(2) : 0;

    return {
      totalEntries: this.cache.size,
      activeEntries: activeCount,
      expiredEntries: expiredCount,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`
    };
  }
}

// Singleton instance
const firebaseCache = new FirebaseCache();

/**
 * Cached query wrapper for Firestore
 * 
 * @param {Function} queryFn - The Firestore query function to execute
 * @param {string} collectionName - Name of the collection being queried
 * @param {object} filters - Query filters for cache key generation
 * @param {object} options - Query options for cache key generation
 * @param {number} ttl - Custom TTL in milliseconds (optional)
 */
export async function cachedQuery(queryFn, collectionName, filters = {}, options = {}, ttl) {
  // Try to get from cache first
  const cached = firebaseCache.get(collectionName, filters, options);
  if (cached) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Cache HIT] ${collectionName}`);
    }
    return cached;
  }
  
  // Execute query if not in cache
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Cache MISS] ${collectionName}`);
  }
  const data = await queryFn();
  
  // Store in cache
  firebaseCache.set(collectionName, data, filters, options, ttl);
  
  return data;
}

/**
 * Invalidate cache for a specific collection
 */
export function invalidateCache(collectionName) {
  firebaseCache.clearCollection(collectionName);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Cache INVALIDATED] ${collectionName}`);
  }
}

/**
 * Clear all cache
 */
export function clearAllCache() {
  firebaseCache.clear();
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache CLEARED] All entries');
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return firebaseCache.getStats();
}

export default firebaseCache;
export { firebaseCache };
