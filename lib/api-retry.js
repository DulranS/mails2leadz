/**
 * API Retry Utility
 * 
 * Provides exponential backoff retry mechanism for API calls
 * Helps recover from transient failures without manual intervention
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Request deduplication
 * - Detailed error logging
 */

class RetryManager {
  constructor() {
    this.circuitBreakers = new Map();
    this.requestCache = new Map();
    this.failureThreshold = 5;
    this.resetTimeout = 60000; // 1 minute
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  /**
   * Exponential backoff with jitter
   */
  getBackoffDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 0-10% jitter
    return exponentialDelay + jitter;
  }

  /**
   * Check if circuit breaker is open for endpoint
   */
  isCircuitOpen(endpoint) {
    const breaker = this.circuitBreakers.get(endpoint);
    if (!breaker) return false;

    const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
    if (timeSinceLastFailure > this.resetTimeout) {
      // Reset circuit if enough time has passed
      this.circuitBreakers.delete(endpoint);
      return false;
    }

    return breaker.failureCount >= this.failureThreshold;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure(endpoint) {
    const breaker = this.circuitBreakers.get(endpoint) || {
      failureCount: 0,
      lastFailureTime: Date.now(),
    };
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();
    this.circuitBreakers.set(endpoint, breaker);

    console.warn(
      `[Circuit Breaker] ${endpoint}: ${breaker.failureCount}/${this.failureThreshold} failures`,
    );
  }

  /**
   * Record a success for circuit breaker
   */
  recordSuccess(endpoint) {
    this.circuitBreakers.delete(endpoint);
  }

  /**
   * Get request cache key
   */
  getCacheKey(url, options) {
    return `${options?.method || 'GET'}:${url}`;
  }

  /**
   * Retry API call with exponential backoff
   */
  async retryFetch(url, options = {}, maxRetries = this.maxRetries) {
    // Handle relative URLs by constructing full URL
    let fullUrl = url;
    try {
      if (typeof window !== 'undefined' && !url.startsWith('http')) {
        fullUrl = new URL(url, window.location.origin).href;
      } else {
        fullUrl = new URL(url).href;
      }
    } catch (e) {
      // If URL construction fails, use original url
      fullUrl = url;
    }

    const endpoint = new URL(fullUrl).pathname;

    // Check circuit breaker
    if (this.isCircuitOpen(endpoint)) {
      throw new Error(
        `Circuit breaker open for ${endpoint}. Service temporarily unavailable.`,
      );
    }

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timeoutId;
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        // Combine with existing signal if provided
        let signal = controller.signal;
        if (options.signal) {
          // If AbortSignal.any is available, use it
          if (typeof AbortSignal.any === 'function') {
            signal = AbortSignal.any([options.signal, controller.signal]);
          } else {
            // Fallback: if user signal aborts, also abort our controller
            options.signal.addEventListener('abort', () => {
              controller.abort();
            });
            signal = options.signal;
          }
        }

        const response = await fetch(fullUrl, {
          ...options,
          signal,
        });

        // Clear timeout on success
        clearTimeout(timeoutId);

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          this.recordSuccess(endpoint);
          return response;
        }

        // Retry on server errors (5xx) and timeouts
        if (response.status >= 500 || response.status === 0) {
          throw new Error(`HTTP ${response.status}`);
        }

        this.recordSuccess(endpoint);
        return response;
      } catch (error) {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        lastError = error;

        // Don't retry on abort errors (user cancelled or timeout)
        if (error.name === 'AbortError') {
          this.recordFailure(endpoint);
          // Check if it was a timeout vs user cancellation
          if (error.message.includes('timeout') || error.message.includes('TimeoutError')) {
            throw new Error('Request timeout');
          }
          // Re-throw original abort error to preserve context
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          this.recordFailure(endpoint);
          throw lastError;
        }

        // Wait before retrying
        const delay = this.getBackoffDelay(attempt);
        console.warn(
          `[Retry] Attempt ${attempt + 1}/${maxRetries + 1} for ${endpoint} after ${delay.toFixed(
            0,
          )}ms:`,
          error.message,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.recordFailure(endpoint);
    throw lastError;
  }

  /**
   * Get circuit breaker stats
   */
  getStats() {
    const stats = {};
    for (const [endpoint, breaker] of this.circuitBreakers.entries()) {
      stats[endpoint] = {
        failureCount: breaker.failureCount,
        isOpen: this.isCircuitOpen(endpoint),
        lastFailureTime: new Date(breaker.lastFailureTime).toISOString(),
      };
    }
    return stats;
  }
}

// Singleton instance
const retryManager = new RetryManager();

/**
 * Fetch with automatic retry and circuit breaker
 * 
 * Usage:
 * const response = await retryFetch('/api/endpoint', { method: 'POST', body: JSON.stringify({}) })
 */
export async function retryFetch(url, options = {}, maxRetries) {
  return retryManager.retryFetch(url, options, maxRetries);
}

/**
 * Get retry manager stats
 */
export function getRetryStats() {
  return retryManager.getStats();
}

export default retryManager;
export { retryManager };
