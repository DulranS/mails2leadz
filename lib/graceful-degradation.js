/**
 * Graceful Degradation System
 * 
 * Provides fallback mechanisms and degraded mode functionality
 * Ensures application continues to function even when services are unavailable
 */

class GracefulDegradationManager {
  constructor() {
    this.fallbacks = new Map();
    this.degradedFeatures = new Set();
    this.cachedData = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Register a fallback for a feature
   */
  registerFallback(featureId, config) {
    this.fallbacks.set(featureId, {
      id: featureId,
      name: config.name,
      primary: config.primary,
      fallback: config.fallback,
      cacheKey: config.cacheKey || null,
      isCritical: config.isCritical || false,
      degradedUI: config.degradedUI || null,
    });
  }

  /**
   * Execute feature with fallback
   */
  async executeWithFallback(featureId, context = {}) {
    const feature = this.fallbacks.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not registered`);
    }

    // Check if feature is in degraded mode
    if (this.degradedFeatures.has(featureId)) {
      console.log(`Feature ${feature.name} is in degraded mode, using fallback`);
      
      if (feature.fallback) {
        return await feature.fallback(context);
      }
      
      // Return cached data if available
      if (feature.cacheKey && this.cachedData.has(feature.cacheKey)) {
        const cached = this.cachedData.get(feature.cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          console.log(`Returning cached data for ${feature.name}`);
          return cached.data;
        }
      }
      
      // Return degraded UI placeholder
      if (feature.degradedUI) {
        return feature.degradedUI(context);
      }
      
      throw new Error(`Feature ${feature.name} is unavailable and no fallback exists`);
    }

    try {
      const result = await feature.primary(context);
      
      // Cache successful results
      if (feature.cacheKey) {
        this.cachedData.set(feature.cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
      }
      
      return result;
    } catch (error) {
      console.error(`Primary function failed for ${feature.name}:`, error);
      
      // Mark feature as degraded if it's not critical
      if (!feature.isCritical) {
        this.setDegradedMode(featureId, true);
      }
      
      // Try fallback
      if (feature.fallback) {
        try {
          console.log(`Trying fallback for ${feature.name}`);
          return await feature.fallback(context);
        } catch (fallbackError) {
          console.error(`Fallback also failed for ${feature.name}:`, fallbackError);
        }
      }
      
      // Return cached data if available
      if (feature.cacheKey && this.cachedData.has(feature.cacheKey)) {
        const cached = this.cachedData.get(feature.cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          console.log(`Returning cached data for ${feature.name}`);
          return cached.data;
        }
      }
      
      // Return degraded UI placeholder
      if (feature.degradedUI) {
        return feature.degradedUI(context);
      }
      
      throw error;
    }
  }

  /**
   * Set degraded mode for a feature
   */
  setDegradedMode(featureId, isDegraded) {
    if (isDegraded) {
      this.degradedFeatures.add(featureId);
      console.warn(`Feature ${featureId} set to degraded mode`);
    } else {
      this.degradedFeatures.delete(featureId);
      console.log(`Feature ${featureId} restored to normal mode`);
    }
  }

  /**
   * Check if feature is in degraded mode
   */
  isDegraded(featureId) {
    return this.degradedFeatures.has(featureId);
  }

  /**
   * Get all degraded features
   */
  getDegradedFeatures() {
    return Array.from(this.degradedFeatures).map(id => {
      const feature = this.fallbacks.get(id);
      return feature ? feature.name : id;
    });
  }

  /**
   * Restore all features to normal mode
   */
  restoreAllFeatures() {
    this.degradedFeatures.clear();
    console.log('All features restored to normal mode');
  }

  /**
   * Clear cached data
   */
  clearCache(featureId = null) {
    if (featureId) {
      const feature = this.fallbacks.get(featureId);
      if (feature && feature.cacheKey) {
        this.cachedData.delete(feature.cacheKey);
      }
    } else {
      this.cachedData.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      totalEntries: this.cachedData.size,
      entries: Array.from(this.cachedData.entries()).map(([key, value]) => ({
        key,
        timestamp: value.timestamp,
        age: Date.now() - value.timestamp,
        isExpired: Date.now() - value.timestamp > this.cacheExpiry,
      })),
    };
  }
}

// Singleton instance
const gracefulDegradationManager = new GracefulDegradationManager();

// Register common feature fallbacks
gracefulDegradationManager.registerFallback('analytics', {
  name: 'Analytics Dashboard',
  primary: async (context) => {
    // This would be the actual analytics fetch
    return { metrics: [], charts: [] };
  },
  fallback: async (context) => {
    // Fallback: return cached or simplified analytics
    return {
      metrics: [],
      charts: [],
      isDegraded: true,
      message: 'Analytics temporarily unavailable',
    };
  },
  cacheKey: 'analytics_data',
  isCritical: false,
  degradedUI: (context) => ({
    metrics: [],
    charts: [],
    isDegraded: true,
    message: 'Analytics temporarily unavailable. Please try again later.',
  }),
});

gracefulDegradationManager.registerFallback('ai-research', {
  name: 'AI Research',
  primary: async (context) => {
    // This would be the actual AI research call
    return { insights: [], analysis: '' };
  },
  fallback: async (context) => {
    // Fallback: return basic research without AI
    return {
      insights: [],
      analysis: 'AI research temporarily unavailable. Using basic data.',
      isDegraded: true,
    };
  },
  cacheKey: 'ai_research_data',
  isCritical: false,
});

gracefulDegradationManager.registerFallback('email-sending', {
  name: 'Email Sending',
  primary: async (context) => {
    // This would be the actual email sending
    return { success: true, messageId: '' };
  },
  fallback: async (context) => {
    // Email sending is critical, so no fallback - just throw error
    throw new Error('Email sending is unavailable. Please try again later.');
  },
  cacheKey: null,
  isCritical: true,
  degradedUI: (context) => ({
    success: false,
    error: 'Email service temporarily unavailable',
    isDegraded: true,
  }),
});

gracefulDegradationManager.registerFallback('followup-scheduler', {
  name: 'Follow-up Scheduler',
  primary: async (context) => {
    // This would be the actual follow-up scheduling
    return { scheduled: true, nextRun: '' };
  },
  fallback: async (context) => {
    // Fallback: schedule for later when service is available
    return {
      scheduled: false,
      queued: true,
      message: 'Follow-up will be scheduled when service is available',
      isDegraded: true,
    };
  },
  cacheKey: 'followup_schedule',
  isCritical: false,
});

export default gracefulDegradationManager;
export { GracefulDegradationManager };
