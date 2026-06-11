// lib/ai/CostOptimizer.js
/**
 * Cost and Latency Optimization System
 * Features:
 * - Request batching
 * - Model selection based on complexity
 * - Cost tracking and budgeting
 * - Latency monitoring and optimization
 * - Automatic scaling strategies
 */

export class CostOptimizer {
  constructor(config = {}) {
    this.config = {
      budget: config.budget || 100, // Monthly budget in USD
      budgetPeriod: config.budgetPeriod || 'month',
      enableCostTracking: config.enableCostTracking || true,
      enableLatencyTracking: config.enableLatencyTracking || true,
      enableAutoScaling: config.enableAutoScaling || true,
      ...config
    };

    // Model pricing (per 1K tokens)
    this.modelPricing = {
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 }
    };

    this.metrics = {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      totalLatency: 0,
      requestHistory: [],
      modelUsage: {}
    };

    this.budgetUsage = {
      current: 0,
      periodStart: Date.now(),
      alerts: []
    };
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(model, inputTokens, outputTokens) {
    const pricing = this.modelPricing[model];
    if (!pricing) {
      console.warn(`No pricing found for model: ${model}`);
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }

  /**
   * Select optimal model based on task complexity
   */
  selectModel(task, complexity = 'medium') {
    const modelSelection = {
      'simple': 'gpt-3.5-turbo',
      'medium': 'gpt-4-turbo',
      'complex': 'gpt-4',
      'creative': 'claude-3-opus',
      'analytical': 'gpt-4-turbo'
    };

    // Check budget constraints
    if (this.config.enableAutoScaling && this.isNearBudgetLimit()) {
      console.warn('Near budget limit, downgrading model');
      return 'gpt-3.5-turbo';
    }

    return modelSelection[complexity] || modelSelection['medium'];
  }

  /**
   * Check if near budget limit
   */
  isNearBudgetLimit(threshold = 0.9) {
    const usageRatio = this.budgetUsage.current / this.config.budget;
    return usageRatio >= threshold;
  }

  /**
   * Check if budget exceeded
   */
  isBudgetExceeded() {
    return this.budgetUsage.current >= this.config.budget;
  }

  /**
   * Track request metrics
   */
  trackRequest(model, inputTokens, outputTokens, latency, metadata = {}) {
    const costInfo = this.calculateCost(model, inputTokens, outputTokens);
    
    this.metrics.totalCost += costInfo.totalCost;
    this.metrics.totalTokens += costInfo.totalTokens;
    this.metrics.totalRequests++;
    this.metrics.totalLatency += latency;

    // Track model usage
    if (!this.metrics.modelUsage[model]) {
      this.metrics.modelUsage[model] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }
    this.metrics.modelUsage[model].requests++;
    this.metrics.modelUsage[model].tokens += costInfo.totalTokens;
    this.metrics.modelUsage[model].cost += costInfo.totalCost;

    // Update budget usage
    this.budgetUsage.current += costInfo.totalCost;

    // Add to history
    this.metrics.requestHistory.push({
      timestamp: Date.now(),
      model,
      ...costInfo,
      latency,
      metadata
    });

    // Keep only last 1000 requests
    if (this.metrics.requestHistory.length > 1000) {
      this.metrics.requestHistory.shift();
    }

    // Check budget alerts
    this.checkBudgetAlerts();

    return costInfo;
  }

  /**
   * Check and trigger budget alerts
   */
  checkBudgetAlerts() {
    const usageRatio = this.budgetUsage.current / this.config.budget;
    const thresholds = [0.5, 0.75, 0.9, 0.95, 1.0];

    thresholds.forEach(threshold => {
      if (usageRatio >= threshold && !this.budgetUsage.alerts.includes(threshold)) {
        this.budgetUsage.alerts.push(threshold);
        console.warn(`Budget alert: ${(threshold * 100).toFixed(0)}% of budget used`);
      }
    });
  }

  /**
   * Get average latency
   */
  getAverageLatency() {
    return this.metrics.totalRequests > 0
      ? this.metrics.totalLatency / this.metrics.totalRequests
      : 0;
  }

  /**
   * Get average cost per request
   */
  getAverageCostPerRequest() {
    return this.metrics.totalRequests > 0
      ? this.metrics.totalCost / this.metrics.totalRequests
      : 0;
  }

  /**
   * Get cost per 1K tokens
   */
  getCostPer1KTokens() {
    return this.metrics.totalTokens > 0
      ? (this.metrics.totalCost / this.metrics.totalTokens) * 1000
      : 0;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      budget: {
        total: this.config.budget,
        used: this.budgetUsage.current,
        remaining: this.config.budget - this.budgetUsage.current,
        usagePercent: ((this.budgetUsage.current / this.config.budget) * 100).toFixed(2),
        period: this.config.budgetPeriod,
        periodStart: new Date(this.budgetUsage.periodStart).toISOString(),
        alerts: this.budgetUsage.alerts
      },
      costs: {
        total: this.metrics.totalCost.toFixed(4),
        perRequest: this.getAverageCostPerRequest().toFixed(4),
        per1KTokens: this.getCostPer1KTokens().toFixed(4)
      },
      tokens: {
        total: this.metrics.totalTokens,
        avgPerRequest: this.metrics.totalRequests > 0
          ? Math.round(this.metrics.totalTokens / this.metrics.totalRequests)
          : 0
      },
      latency: {
        total: this.metrics.totalLatency,
        average: this.getAverageLatency().toFixed(2),
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99)
      },
      requests: {
        total: this.metrics.totalRequests,
        byModel: this.metrics.modelUsage
      }
    };
  }

  /**
   * Get percentile latency
   */
  getPercentile(percentile) {
    if (this.metrics.requestHistory.length === 0) return 0;

    const latencies = this.metrics.requestHistory
      .map(r => r.latency)
      .sort((a, b) => a - b);

    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[index];
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      totalLatency: 0,
      requestHistory: [],
      modelUsage: {}
    };
    this.budgetUsage = {
      current: 0,
      periodStart: Date.now(),
      alerts: []
    };
  }

  /**
   * Get cost optimization recommendations
   */
  getRecommendations() {
    const recommendations = [];
    const stats = this.getStats();

    // Budget recommendations
    if (stats.budget.usagePercent > 80) {
      recommendations.push({
        type: 'budget',
        priority: 'high',
        message: 'Budget usage exceeds 80%. Consider downgrading to gpt-3.5-turbo for simple tasks.'
      });
    }

    // Latency recommendations
    if (stats.latency.p95 > 5000) {
      recommendations.push({
        type: 'latency',
        priority: 'medium',
        message: 'P95 latency exceeds 5s. Consider implementing request batching or caching.'
      });
    }

    // Model usage recommendations
    const modelStats = stats.requests.byModel;
    if (modelStats['gpt-4'] && modelStats['gpt-4'].requests > modelStats['gpt-4-turbo']?.requests) {
      recommendations.push({
        type: 'model',
        priority: 'low',
        message: 'Consider using gpt-4-turbo instead of gpt-4 for cost savings with similar performance.'
      });
    }

    return recommendations;
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics() {
    return {
      config: this.config,
      metrics: this.metrics,
      budgetUsage: this.budgetUsage,
      stats: this.getStats(),
      recommendations: this.getRecommendations()
    };
  }
}

export class RequestBatcher {
  constructor(config = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize || 20,
      maxWaitTime: config.maxWaitTime || 1000, // ms
      minBatchSize: config.minBatchSize || 1,
      ...config
    };

    this.queue = [];
    this.timer = null;
  }

  /**
   * Add request to batch
   */
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });

      if (this.queue.length >= this.config.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.config.maxWaitTime);
      }
    });
  }

  /**
   * Flush batched requests
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length < this.config.minBatchSize) {
      return;
    }

    const batch = this.queue.splice(0, this.queue.length);
    const requests = batch.map(b => b.request);

    try {
      const results = await this.executeBatch(requests);
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }

  /**
   * Execute batch of requests (to be implemented by subclass)
   */
  async executeBatch(requests) {
    throw new Error('executeBatch must be implemented by subclass');
  }

  /**
   * Get queue size
   */
  getQueueSize() {
    return this.queue.length;
  }
}

export default CostOptimizer;
