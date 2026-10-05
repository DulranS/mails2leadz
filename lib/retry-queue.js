/**
 * Retry Queue for Failed Operations
 * 
 * Manages failed operations and retries them with backoff
 * Ensures no data is lost due to transient failures
 */

class RetryQueue {
  constructor() {
    this.queue = new Map();
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 60000; // 1 minute
    this.processingInterval = null;
    this.isProcessing = false;
  }

  /**
   * Generate unique ID for queue item
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate backoff delay with exponential backoff
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  /**
   * Add item to retry queue
   */
  async add(operation, options = {}) {
    const {
      priority = 'normal',
      maxRetries = this.maxRetries,
      context = {},
      category = 'general',
    } = options;

    const itemId = this.generateId();
    
    const queueItem = {
      id: itemId,
      operation,
      attempt: 0,
      maxRetries,
      priority,
      context,
      category,
      addedAt: Date.now(),
      nextRetryAt: Date.now(),
      lastError: null,
      status: 'pending',
    };

    this.queue.set(itemId, queueItem);
    
    console.log(`Added item ${itemId} to retry queue (category: ${category})`);
    
    return itemId;
  }

  /**
   * Process a single queue item
   */
  async processItem(itemId) {
    const item = this.queue.get(itemId);
    if (!item) {
      console.warn(`Item ${itemId} not found in queue`);
      return;
    }

    if (item.status === 'processing' || item.status === 'completed') {
      return;
    }

    // Check if it's time to retry
    if (Date.now() < item.nextRetryAt) {
      return;
    }

    item.status = 'processing';
    item.attempt++;

    try {
      console.log(`Processing retry item ${itemId} (attempt ${item.attempt}/${item.maxRetries})`);
      
      const result = await item.operation(item.context);
      
      // Mark as completed
      item.status = 'completed';
      item.result = result;
      item.completedAt = Date.now();
      
      console.log(`Retry item ${itemId} completed successfully`);
      
      // Remove from queue after a delay
      setTimeout(() => {
        this.queue.delete(itemId);
      }, 5000);
      
      return result;
    } catch (error) {
      item.lastError = error.message;
      
      if (item.attempt >= item.maxRetries) {
        // Max retries reached, mark as failed
        item.status = 'failed';
        item.failedAt = Date.now();
        
        console.error(`Retry item ${itemId} failed after ${item.maxRetries} attempts`);
        
        // Keep failed items for inspection
        return null;
      } else {
        // Schedule next retry
        const delay = this.calculateDelay(item.attempt);
        item.nextRetryAt = Date.now() + delay;
        item.status = 'pending';
        
        console.log(`Retry item ${itemId} failed, scheduling next retry in ${Math.round(delay / 1000)}s`);
        
        return null;
      }
    }
  }

  /**
   * Process all ready items in queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyItems = [];

      // Find items ready for retry
      for (const [itemId, item] of this.queue.entries()) {
        if (item.status === 'pending' && now >= item.nextRetryAt) {
          readyItems.push(itemId);
        }
      }

      // Sort by priority and next retry time
      readyItems.sort((a, b) => {
        const itemA = this.queue.get(a);
        const itemB = this.queue.get(b);
        
        // Priority order: high > normal > low
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[itemA.priority] - priorityOrder[itemB.priority];
        
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        
        // If same priority, sort by next retry time
        return itemA.nextRetryAt - itemB.nextRetryAt;
      });

      // Process ready items
      for (const itemId of readyItems) {
        await this.processItem(itemId);
      }

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic queue processing
   */
  startProcessing(interval = 5000) {
    if (this.processingInterval) {
      console.warn('Queue processing already started');
      return;
    }

    console.log('Starting retry queue processing...');
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('Error processing retry queue:', error);
      });
    }, interval);

    // Initial processing
    this.processQueue();
  }

  /**
   * Stop automatic queue processing
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Retry queue processing stopped');
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const items = Array.from(this.queue.values());
    
    return {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      processing: items.filter(i => i.status === 'processing').length,
      completed: items.filter(i => i.status === 'completed').length,
      failed: items.filter(i => i.status === 'failed').length,
      byCategory: this.getStatsByCategory(items),
      byPriority: this.getStatsByPriority(items),
    };
  }

  /**
   * Get statistics by category
   */
  getStatsByCategory(items) {
    const stats = {};
    
    for (const item of items) {
      if (!stats[item.category]) {
        stats[item.category] = { total: 0, pending: 0, failed: 0, completed: 0 };
      }
      
      stats[item.category].total++;
      stats[item.category][item.status]++;
    }
    
    return stats;
  }

  /**
   * Get statistics by priority
   */
  getStatsByPriority(items) {
    const stats = { high: 0, normal: 0, low: 0 };
    
    for (const item of items) {
      if (stats[item.priority] !== undefined) {
        stats[item.priority]++;
      }
    }
    
    return stats;
  }

  /**
   * Get all items in queue
   */
  getAllItems() {
    return Array.from(this.queue.values()).map(item => ({
      id: item.id,
      status: item.status,
      attempt: item.attempt,
      maxRetries: item.maxRetries,
      priority: item.priority,
      category: item.category,
      addedAt: new Date(item.addedAt).toISOString(),
      nextRetryAt: new Date(item.nextRetryAt).toISOString(),
      lastError: item.lastError,
    }));
  }

  /**
   * Get items by status
   */
  getItemsByStatus(status) {
    return Array.from(this.queue.values())
      .filter(item => item.status === status)
      .map(item => ({
        id: item.id,
        attempt: item.attempt,
        maxRetries: item.maxRetries,
        priority: item.priority,
        category: item.category,
        addedAt: new Date(item.addedAt).toISOString(),
        lastError: item.lastError,
      }));
  }

  /**
   * Remove item from queue
   */
  removeItem(itemId) {
    return this.queue.delete(itemId);
  }

  /**
   * Clear completed items
   */
  clearCompleted() {
    for (const [itemId, item] of this.queue.entries()) {
      if (item.status === 'completed') {
        this.queue.delete(itemId);
      }
    }
  }

  /**
   * Clear failed items
   */
  clearFailed() {
    for (const [itemId, item] of this.queue.entries()) {
      if (item.status === 'failed') {
        this.queue.delete(itemId);
      }
    }
  }

  /**
   * Retry a failed item immediately
   */
  async retryItem(itemId) {
    const item = this.queue.get(itemId);
    if (!item) {
      console.warn(`Item ${itemId} not found in queue`);
      return null;
    }

    if (item.status !== 'failed') {
      console.warn(`Item ${itemId} is not in failed status`);
      return null;
    }

    // Reset item for retry
    item.status = 'pending';
    item.attempt = 0;
    item.nextRetryAt = Date.now();
    item.lastError = null;

    console.log(`Reset item ${itemId} for immediate retry`);

    return await this.processItem(itemId);
  }

  /**
   * Clear all items
   */
  clearAll() {
    this.queue.clear();
  }
}

// Singleton instance
const retryQueue = new RetryQueue();

// Start automatic processing in production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  retryQueue.startProcessing(10000); // Process every 10 seconds
}

export default retryQueue;
export { RetryQueue };
