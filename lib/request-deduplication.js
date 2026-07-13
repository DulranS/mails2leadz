/**
 * Request Deduplication System
 * 
 * Prevents duplicate requests and ensures idempotency
 * Useful for preventing double-submissions and redundant API calls
 */

class RequestDeduplicator {
  constructor() {
    this.pendingRequests = new Map();
    this.completedRequests = new Map();
    this.requestTimeout = 30000; // 30 seconds
    this.completedExpiry = 60000; // 1 minute
    this.cleanupInterval = null;
  }

  /**
   * Generate a unique key for a request
   */
  generateKey(url, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    const params = options.params ? JSON.stringify(options.params) : '';
    return `${method}:${url}:${body}:${params}`;
  }

  /**
   * Check if a request is pending
   */
  isPending(key) {
    const request = this.pendingRequests.get(key);
    if (!request) return false;

    // Check if request has timed out
    if (Date.now() - request.timestamp > this.requestTimeout) {
      this.pendingRequests.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if a request was recently completed
   */
  isRecentlyCompleted(key) {
    const request = this.completedRequests.get(key);
    if (!request) return false;

    // Check if result has expired
    if (Date.now() - request.timestamp > this.completedExpiry) {
      this.completedRequests.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cached result from completed request
   */
  getCachedResult(key) {
    const request = this.completedRequests.get(key);
    if (!request) return null;

    // Check if result has expired
    if (Date.now() - request.timestamp > this.completedExpiry) {
      this.completedRequests.delete(key);
      return null;
    }

    return request.result;
  }

  /**
   * Execute request with deduplication
   */
  async execute(key, requestFn, options = {}) {
    const { force = false, cacheResult = true } = options;

    // Check if request is pending
    if (!force && this.isPending(key)) {
      console.log(`Request ${key} is already pending, waiting for result`);
      
      // Wait for pending request to complete
      const pendingRequest = this.pendingRequests.get(key);
      try {
        return await pendingRequest.promise;
      } catch (error) {
        // If pending request failed, allow retry
        this.pendingRequests.delete(key);
        throw error;
      }
    }

    // Check if request was recently completed and return cached result
    if (!force && cacheResult && this.isRecentlyCompleted(key)) {
      console.log(`Returning cached result for ${key}`);
      return this.getCachedResult(key);
    }

    // Execute new request
    const promise = requestFn();
    
    // Store pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    try {
      const result = await promise;
      
      // Remove from pending
      this.pendingRequests.delete(key);
      
      // Cache result if enabled
      if (cacheResult) {
        this.completedRequests.set(key, {
          result,
          timestamp: Date.now(),
        });
      }
      
      return result;
    } catch (error) {
      // Remove from pending on error
      this.pendingRequests.delete(key);
      throw error;
    }
  }

  /**
   * Execute fetch with deduplication
   */
  async fetch(url, options = {}, dedupOptions = {}) {
    const key = this.generateKey(url, options);
    
    return this.execute(key, async () => {
      return await fetch(url, options);
    }, dedupOptions);
  }

  /**
   * Clear pending requests
   */
  clearPending() {
    this.pendingRequests.clear();
  }

  /**
   * Clear completed requests cache
   */
  clearCompleted() {
    this.completedRequests.clear();
  }

  /**
   * Clear all
   */
  clearAll() {
    this.clearPending();
    this.clearCompleted();
  }

  /**
   * Start automatic cleanup
   */
  startCleanup() {
    if (this.cleanupInterval) {
      console.warn('Cleanup already started');
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup expired requests
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up pending requests
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.requestTimeout) {
        this.pendingRequests.delete(key);
      }
    }

    // Clean up completed requests
    for (const [key, request] of this.completedRequests.entries()) {
      if (now - request.timestamp > this.completedExpiry) {
        this.completedRequests.delete(key);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      pendingCount: this.pendingRequests.size,
      completedCount: this.completedRequests.size,
      pendingRequests: Array.from(this.pendingRequests.keys()),
      completedRequests: Array.from(this.completedRequests.keys()),
    };
  }
}

// Singleton instance
const requestDeduplicator = new RequestDeduplicator();

// Start automatic cleanup
if (typeof window !== 'undefined') {
  requestDeduplicator.startCleanup();
}

export default requestDeduplicator;
export { RequestDeduplicator };
