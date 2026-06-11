// lib/ai/ContextManager.js
/**
 * Context Window Management System
 * Features:
 * - Token counting and tracking
 * - Context compression/summarization
 * - Sliding window for long conversations
 * - Priority-based context retention
 * - Automatic overflow protection
 */

export class ContextManager {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 128000, // GPT-4 Turbo default
      reserveTokens: config.reserveTokens || 4000, // Reserve for response
      compressionThreshold: config.compressionThreshold || 0.8, // Compress at 80% capacity
      enableSummarization: config.enableSummarization || true,
      enableSlidingWindow: config.enableSlidingWindow || true,
      ...config
    };

    this.context = [];
    this.metadata = {
      totalTokens: 0,
      compressedCount: 0,
      summaryCount: 0
    };
  }

  /**
   * Estimate token count for text
   * Uses a simple approximation (1 token ≈ 4 characters for English)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Add message to context with overflow protection
   */
  addMessage(role, content, metadata = {}) {
    const message = {
      role,
      content,
      metadata,
      tokens: this.estimateTokens(content),
      timestamp: new Date().toISOString(),
      priority: metadata.priority || 'normal' // high, normal, low
    };

    // Check if adding would exceed limit
    if (this.metadata.totalTokens + message.tokens > this.config.maxTokens - this.config.reserveTokens) {
      this.handleOverflow(message);
    } else {
      this.context.push(message);
      this.metadata.totalTokens += message.tokens;
    }

    return message;
  }

  /**
   * Handle context overflow with multiple strategies
   */
  handleOverflow(newMessage) {
    const availableSpace = this.config.maxTokens - this.config.reserveTokens;
    const currentUsage = this.metadata.totalTokens;
    const usageRatio = currentUsage / this.config.maxTokens;

    this.log(`Context overflow: ${currentUsage}/${this.config.maxTokens} tokens (${(usageRatio * 100).toFixed(1)}%)`);

    if (usageRatio >= this.config.compressionThreshold && this.config.enableSummarization) {
      this.compressContext();
    }

    if (this.metadata.totalTokens + newMessage.tokens > availableSpace) {
      if (this.config.enableSlidingWindow) {
        this.applySlidingWindow(newMessage);
      } else {
        this.dropLowPriorityMessages(newMessage);
      }
    }
  }

  /**
   * Compress context by summarizing older messages
   */
  async compressContext() {
    this.log('Compressing context...');

    // Find messages to compress (older than threshold)
    const compressibleMessages = this.context.filter(msg => 
      msg.priority !== 'high' && 
      this.context.indexOf(msg) < this.context.length * 0.5
    );

    if (compressibleMessages.length === 0) return;

    // Group messages by role for summarization
    const grouped = compressibleMessages.reduce((acc, msg) => {
      if (!acc[msg.role]) acc[msg.role] = [];
      acc[msg.role].push(msg);
      return acc;
    }, {});

    // Create summaries (in production, use LLM for this)
    const summaries = [];
    for (const [role, messages] of Object.entries(grouped)) {
      const summary = this.createSummary(messages, role);
      summaries.push(summary);
    }

    // Remove compressed messages and add summaries
    const compressedIds = compressibleMessages.map(m => this.context.indexOf(m));
    this.context = this.context.filter((_, idx) => !compressedIds.includes(idx));
    
    summaries.forEach(summary => {
      this.context.unshift(summary);
    });

    this.metadata.compressedCount++;
    this.recalculateTokens();
    
    this.log(`Context compressed: ${compressibleMessages.length} messages → ${summaries.length} summaries`);
  }

  /**
   * Create summary of messages (simplified version)
   */
  createSummary(messages, role) {
    const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0);
    const content = messages.map(m => m.content).join('\n');
    
    // Simple summarization (in production, use LLM)
    const summary = content.length > 500 
      ? content.substring(0, 500) + '... [summarized]'
      : content;

    return {
      role: 'system',
      content: `[Summary of ${messages.length} ${role} messages]: ${summary}`,
      metadata: {
        type: 'summary',
        originalCount: messages.length,
        originalTokens: totalTokens
      },
      tokens: this.estimateTokens(summary),
      timestamp: new Date().toISOString(),
      priority: 'low'
    };
  }

  /**
   * Apply sliding window - remove oldest messages
   */
  applySlidingWindow(newMessage) {
    this.log('Applying sliding window...');

    // Keep high priority messages
    const highPriority = this.context.filter(m => m.priority === 'high');
    const removable = this.context.filter(m => m.priority !== 'high');

    // Remove oldest messages until space is available
    const availableSpace = this.config.maxTokens - this.config.reserveTokens;
    let removedTokens = 0;
    let removedCount = 0;

    while (this.metadata.totalTokens - removedTokens + newMessage.tokens > availableSpace && removable.length > 0) {
      const removed = removable.shift();
      removedTokens += removed.tokens;
      removedCount++;
    }

    // Rebuild context
    this.context = [...highPriority, ...removable];
    this.metadata.totalTokens -= removedTokens;

    // Add new message
    this.context.push(newMessage);
    this.metadata.totalTokens += newMessage.tokens;

    this.log(`Sliding window: removed ${removedCount} messages, freed ${removedTokens} tokens`);
  }

  /**
   * Drop low priority messages
   */
  dropLowPriorityMessages(newMessage) {
    this.log('Dropping low priority messages...');

    const availableSpace = this.config.maxTokens - this.config.reserveTokens;
    let removedTokens = 0;
    let removedCount = 0;

    // Sort by priority (low first) then by timestamp (oldest first)
    const sorted = [...this.context].sort((a, b) => {
      const priorityOrder = { low: 0, normal: 1, high: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    while (this.metadata.totalTokens - removedTokens + newMessage.tokens > availableSpace && sorted.length > 0) {
      const removed = sorted.shift();
      removedTokens += removed.tokens;
      removedCount++;
    }

    // Rebuild context with remaining messages
    this.context = sorted;
    this.metadata.totalTokens -= removedTokens;

    // Add new message
    this.context.push(newMessage);
    this.metadata.totalTokens += newMessage.tokens;

    this.log(`Dropped ${removedCount} low priority messages`);
  }

  /**
   * Recalculate total tokens
   */
  recalculateTokens() {
    this.metadata.totalTokens = this.context.reduce((sum, msg) => sum + msg.tokens, 0);
  }

  /**
   * Get context for LLM (formatted as messages array)
   */
  getContext() {
    return this.context.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Get context statistics
   */
  getStats() {
    return {
      totalMessages: this.context.length,
      totalTokens: this.metadata.totalTokens,
      maxTokens: this.config.maxTokens,
      usagePercent: ((this.metadata.totalTokens / this.config.maxTokens) * 100).toFixed(2),
      compressedCount: this.metadata.compressedCount,
      summaryCount: this.metadata.summaryCount,
      messagesByPriority: {
        high: this.context.filter(m => m.priority === 'high').length,
        normal: this.context.filter(m => m.priority === 'normal').length,
        low: this.context.filter(m => m.priority === 'low').length
      }
    };
  }

  /**
   * Clear context
   */
  clear() {
    this.context = [];
    this.metadata = {
      totalTokens: 0,
      compressedCount: 0,
      summaryCount: 0
    };
  }

  /**
   * Export context for debugging
   */
  export() {
    return {
      config: this.config,
      context: this.context,
      metadata: this.metadata,
      stats: this.getStats()
    };
  }

  log(message) {
    console.log(`[ContextManager] ${message}`);
  }
}

export default ContextManager;
