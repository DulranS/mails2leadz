// lib/ai/PromptCache.js
/**
 * Prompt Caching System
 * Features:
 * - Response caching with TTL
 * - Semantic similarity matching
 * - Cache warming
 * - Cache statistics and analytics
 * - Multi-level caching (memory + persistent)
 */

export class PromptCache {
  constructor(config = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 3600000, // 1 hour
      enableSemanticCache: config.enableSemanticCache || true,
      semanticThreshold: config.semanticThreshold || 0.85,
      enablePersistence: config.enablePersistence || false,
      ...config
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      semanticHits: 0,
      totalRequests: 0
    };
  }

  /**
   * Generate cache key from prompt
   */
  generateKey(prompt, model, params = {}) {
    const normalized = this.normalizePrompt(prompt);
    const paramString = JSON.stringify(params);
    return `${model}:${this.hash(normalized + paramString)}`;
  }

  /**
   * Normalize prompt for consistent key generation
   */
  normalizePrompt(prompt) {
    return prompt
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  /**
   * Simple hash function
   */
  hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Calculate semantic similarity (simplified Jaccard similarity)
   */
  calculateSimilarity(str1, str2) {
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Get cached response
   */
  async get(prompt, model, params = {}) {
    this.stats.totalRequests++;

    // Exact match
    const exactKey = this.generateKey(prompt, model, params);
    const exactEntry = this.cache.get(exactKey);
    
    if (exactEntry && !this.isExpired(exactEntry)) {
      this.stats.hits++;
      exactEntry.lastAccessed = Date.now();
      exactEntry.accessCount++;
      return {
        hit: true,
        type: 'exact',
        response: exactEntry.response,
        metadata: exactEntry.metadata
      };
    }

    // Semantic match (if enabled)
    if (this.config.enableSemanticCache) {
      const semanticResult = await this.getSemanticMatch(prompt, model);
      if (semanticResult) {
        this.stats.semanticHits++;
        this.stats.hits++;
        return semanticResult;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Get semantically similar cached response
   */
  async getSemanticMatch(prompt, model) {
    const normalizedPrompt = this.normalizePrompt(prompt);
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const [key, entry] of this.cache) {
      if (entry.model !== model || this.isExpired(entry)) continue;
      
      const similarity = this.calculateSimilarity(normalizedPrompt, entry.normalizedPrompt);
      
      if (similarity > this.config.semanticThreshold && similarity > bestSimilarity) {
        bestMatch = entry;
        bestSimilarity = similarity;
      }
    }

    if (bestMatch) {
      bestMatch.lastAccessed = Date.now();
      bestMatch.accessCount++;
      return {
        hit: true,
        type: 'semantic',
        similarity: bestSimilarity,
        response: bestMatch.response,
        metadata: bestMatch.metadata
      };
    }

    return null;
  }

  /**
   * Cache a response
   */
  async set(prompt, model, response, metadata = {}, ttl = null) {
    const key = this.generateKey(prompt, model, metadata.params || {});
    const entry = {
      prompt,
      normalizedPrompt: this.normalizePrompt(prompt),
      model,
      response,
      metadata,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      ttl: ttl || this.config.defaultTTL,
      expiresAt: Date.now() + (ttl || this.config.defaultTTL)
    };

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    this.cache.set(key, entry);
    
    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist();
    }

    return entry;
  }

  /**
   * Check if cache entry is expired
   */
  isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Evict least recently used entry
   */
  evict() {
    let lruKey = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clear expired entries
   */
  clearExpired() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      semanticHits: 0,
      totalRequests: 0
    };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: `${hitRate}%`,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      semanticHits: this.stats.semanticHits,
      totalRequests: this.stats.totalRequests,
      semanticHitRate: this.stats.hits > 0
        ? (this.stats.semanticHits / this.stats.hits * 100).toFixed(2)
        : 0
    };
  }

  /**
   * Get cache entries by model
   */
  getByModel(model) {
    const entries = [];
    for (const [key, entry] of this.cache) {
      if (entry.model === model) {
        entries.push({
          key,
          ...entry,
          isExpired: this.isExpired(entry)
        });
      }
    }
    return entries;
  }

  /**
   * Warm cache with common prompts
   */
  async warmCache(prompts, model, generateFn) {
    const warmed = [];
    
    for (const prompt of prompts) {
      const key = this.generateKey(prompt, model);
      if (!this.cache.has(key)) {
        try {
          const response = await generateFn(prompt);
          await this.set(prompt, model, response);
          warmed.push(prompt);
        } catch (error) {
          console.error(`Failed to warm cache for prompt: ${prompt.substring(0, 50)}...`);
        }
      }
    }

    return warmed;
  }

  /**
   * Persist cache to storage (placeholder)
   */
  async persist() {
    // In production, implement persistence to Redis, database, etc.
    console.log('[PromptCache] Persistence not implemented');
  }

  /**
   * Load cache from storage (placeholder)
   */
  async load() {
    // In production, implement loading from Redis, database, etc.
    console.log('[PromptCache] Loading not implemented');
  }

  /**
   * Export cache for debugging
   */
  export() {
    const entries = [];
    for (const [key, entry] of this.cache) {
      entries.push({
        key,
        prompt: entry.prompt.substring(0, 100) + '...',
        model: entry.model,
        createdAt: new Date(entry.createdAt).toISOString(),
        lastAccessed: new Date(entry.lastAccessed).toISOString(),
        accessCount: entry.accessCount,
        isExpired: this.isExpired(entry)
      });
    }

    return {
      config: this.config,
      stats: this.getStats(),
      entries
    };
  }
}

export default PromptCache;
