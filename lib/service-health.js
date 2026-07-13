/**
 * Service Health Monitoring System
 * 
 * Monitors health of external services and provides graceful degradation
 * Tracks service availability, response times, and failure rates
 */

class ServiceHealthMonitor {
  constructor() {
    this.services = new Map();
    this.checkInterval = 30000; // 30 seconds
    this.failureThreshold = 3;
    this.recoveryThreshold = 2;
    this.monitoringInterval = null;
  }

  /**
   * Register a service for monitoring
   */
  registerService(serviceId, config) {
    this.services.set(serviceId, {
      id: serviceId,
      name: config.name,
      endpoint: config.endpoint,
      healthCheck: config.healthCheck,
      fallback: config.fallback || null,
      status: 'unknown',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheck: null,
      lastResponseTime: null,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      isDegraded: false,
    });
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) {
      console.warn(`Service ${serviceId} not registered`);
      return null;
    }

    const startTime = Date.now();
    service.lastCheck = new Date().toISOString();
    service.totalChecks++;

    try {
      let isHealthy;
      
      if (service.healthCheck) {
        isHealthy = await service.healthCheck();
      } else {
        // Default health check - try to fetch the endpoint
        const response = await fetch(service.endpoint, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        isHealthy = response.ok;
      }

      const responseTime = Date.now() - startTime;
      service.lastResponseTime = responseTime;

      if (isHealthy) {
        service.consecutiveSuccesses++;
        service.consecutiveFailures = 0;
        service.successfulChecks++;
        
        // Update average response time
        const totalResponseTime = service.averageResponseTime * (service.successfulChecks - 1) + responseTime;
        service.averageResponseTime = totalResponseTime / service.successfulChecks;

        // Check if service has recovered
        if (service.status === 'down' && service.consecutiveSuccesses >= this.recoveryThreshold) {
          service.status = 'up';
          service.isDegraded = false;
          console.log(`✅ Service ${service.name} recovered`);
        } else if (service.status === 'unknown') {
          service.status = 'up';
        }
      } else {
        throw new Error('Health check failed');
      }

    } catch (error) {
      service.consecutiveFailures++;
      service.consecutiveSuccesses = 0;
      service.failedChecks++;

      // Check if service should be marked as down
      if (service.consecutiveFailures >= this.failureThreshold) {
        service.status = 'down';
        service.isDegraded = true;
        console.warn(`🚨 Service ${service.name} marked as down after ${service.consecutiveFailures} failures`);
      }
    }

    return this.getServiceStatus(serviceId);
  }

  /**
   * Check health of all registered services
   */
  async checkAllServices() {
    const results = {};
    
    for (const [serviceId] of this.services) {
      results[serviceId] = await this.checkServiceHealth(serviceId);
    }

    return results;
  }

  /**
   * Get current status of a service
   */
  getServiceStatus(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return null;

    return {
      id: service.id,
      name: service.name,
      status: service.status,
      isDegraded: service.isDegraded,
      lastCheck: service.lastCheck,
      lastResponseTime: service.lastResponseTime,
      averageResponseTime: service.averageResponseTime,
      consecutiveFailures: service.consecutiveFailures,
      consecutiveSuccesses: service.consecutiveSuccesses,
      uptime: service.totalChecks > 0 ? (service.successfulChecks / service.totalChecks * 100).toFixed(2) : 0,
      hasFallback: !!service.fallback,
    };
  }

  /**
   * Get status of all services
   */
  getAllServiceStatuses() {
    const statuses = {};
    
    for (const [serviceId] of this.services) {
      statuses[serviceId] = this.getServiceStatus(serviceId);
    }

    return statuses;
  }

  /**
   * Check if a service is healthy
   */
  isServiceHealthy(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return false;
    
    return service.status === 'up' && !service.isDegraded;
  }

  /**
   * Execute service call with fallback
   */
  async executeWithFallback(serviceId, primaryFn, fallbackFn = null) {
    const service = this.services.get(serviceId);
    if (!service) {
      return await primaryFn();
    }

    // If service is down and fallback is available, use fallback
    if (service.isDegraded && service.fallback) {
      console.log(`Using fallback for ${service.name}`);
      return await service.fallback();
    }

    // If service is down and no fallback, throw error
    if (service.isDegraded) {
      throw new Error(`Service ${service.name} is currently unavailable`);
    }

    try {
      const result = await primaryFn();
      
      // Record successful call
      service.consecutiveSuccesses++;
      service.consecutiveFailures = 0;
      
      return result;
    } catch (error) {
      // Record failure
      service.consecutiveFailures++;
      service.consecutiveSuccesses++;
      
      // If fallback is available, try it
      if (service.fallback) {
        console.log(`Primary failed for ${service.name}, trying fallback`);
        try {
          return await service.fallback();
        } catch (fallbackError) {
          console.error(`Fallback also failed for ${service.name}`, fallbackError);
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }

  /**
   * Start automatic health monitoring
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      console.warn('Monitoring already started');
      return;
    }

    console.log('Starting service health monitoring...');
    this.monitoringInterval = setInterval(() => {
      this.checkAllServices().catch(error => {
        console.error('Error during health check:', error);
      });
    }, this.checkInterval);

    // Initial check
    this.checkAllServices();
  }

  /**
   * Stop automatic health monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Service health monitoring stopped');
    }
  }

  /**
   * Reset service status
   */
  resetService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return;

    service.status = 'unknown';
    service.consecutiveFailures = 0;
    service.consecutiveSuccesses = 0;
    service.isDegraded = false;
    
    console.log(`Reset service ${service.name} status`);
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const services = Array.from(this.services.values());
    
    return {
      total: services.length,
      healthy: services.filter(s => s.status === 'up').length,
      degraded: services.filter(s => s.isDegraded).length,
      down: services.filter(s => s.status === 'down').length,
      unknown: services.filter(s => s.status === 'unknown').length,
      overallHealth: this.getOverallHealth(),
    };
  }

  /**
   * Get overall system health
   */
  getOverallHealth() {
    const services = Array.from(this.services.values());
    
    if (services.length === 0) return 'unknown';
    
    const healthyCount = services.filter(s => s.status === 'up').length;
    const degradedCount = services.filter(s => s.isDegraded).length;
    const downCount = services.filter(s => s.status === 'down').length;

    if (downCount === 0 && degradedCount === 0) return 'healthy';
    if (downCount === 0) return 'degraded';
    if (healthyCount > downCount) return 'partial';
    return 'critical';
  }
}

// Singleton instance
const serviceHealthMonitor = new ServiceHealthMonitor();

// Register common services
serviceHealthMonitor.registerService('gmail', {
  name: 'Gmail API',
  endpoint: 'https://www.googleapis.com/gmail/v1/users/me/profile',
  healthCheck: async () => {
    // Gmail health check would be done via actual API call
    // For now, return true as placeholder
    return true;
  },
});

serviceHealthMonitor.registerService('twilio', {
  name: 'Twilio API',
  endpoint: 'https://api.twilio.com',
  healthCheck: async () => {
    // Twilio health check would be done via actual API call
    // For now, return true as placeholder
    return true;
  },
});

serviceHealthMonitor.registerService('openai', {
  name: 'OpenAI API',
  endpoint: 'https://api.openai.com/v1/models',
  healthCheck: async () => {
    // OpenAI health check would be done via actual API call
    // For now, return true as placeholder
    return true;
  },
});

serviceHealthMonitor.registerService('firestore', {
  name: 'Firebase Firestore',
  endpoint: 'https://firestore.googleapis.com',
  healthCheck: async () => {
    // Firestore health check would be done via actual API call
    // For now, return true as placeholder
    return true;
  },
});

// Start monitoring in production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  serviceHealthMonitor.startMonitoring();
}

export default serviceHealthMonitor;
export { ServiceHealthMonitor };
