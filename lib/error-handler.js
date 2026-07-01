/**
 * Comprehensive Error Handling Utility
 * 
 * Provides standardized error handling, logging, and user notification
 * Handles different error types with appropriate recovery strategies
 */

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical',
    };
  }

  /**
   * Classify error and determine severity
   */
  classifyError(error) {
    let severity = this.severityLevels.MEDIUM;
    let category = 'UNKNOWN';
    let isRetryable = false;
    let suggestedAction = 'Please try again later';

    if (!error) {
      return { severity, category, isRetryable, suggestedAction };
    }

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Network errors
    if (
      message.includes('network') ||
      message.includes('failed to fetch') ||
      code === 'network_error'
    ) {
      category = 'NETWORK_ERROR';
      severity = this.severityLevels.HIGH;
      isRetryable = true;
      suggestedAction = 'Check your internet connection and try again';
    }

    // Timeout errors
    if (message.includes('timeout') || code === 'timeout') {
      category = 'TIMEOUT_ERROR';
      severity = this.severityLevels.MEDIUM;
      isRetryable = true;
      suggestedAction = 'Request took too long. Please try again';
    }

    // Firebase auth errors
    if (message.includes('permission') || message.includes('unauthorized')) {
      category = 'AUTH_ERROR';
      severity = this.severityLevels.HIGH;
      isRetryable = false;
      suggestedAction = 'Please log in again';
    }

    // Firebase quota/rate limit errors
    if (
      message.includes('quota') ||
      message.includes('rate') ||
      code === 'resource-exhausted'
    ) {
      category = 'QUOTA_ERROR';
      severity = this.severityLevels.HIGH;
      isRetryable = true;
      suggestedAction = 'Service is temporarily busy. Please try again in a moment';
    }

    // Firebase index errors
    if (message.includes('index') || code === 'failed-precondition') {
      category = 'INDEX_ERROR';
      severity = this.severityLevels.MEDIUM;
      isRetryable = true;
      suggestedAction = 'Database is preparing. Please try again';
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('required')) {
      category = 'VALIDATION_ERROR';
      severity = this.severityLevels.LOW;
      isRetryable = false;
      suggestedAction = 'Please check your input and try again';
    }

    // Server errors
    if (message.includes('500') || message.includes('internal')) {
      category = 'SERVER_ERROR';
      severity = this.severityLevels.HIGH;
      isRetryable = true;
      suggestedAction = 'Server error. Please try again shortly';
    }

    return {
      severity,
      category,
      isRetryable,
      suggestedAction,
      originalMessage: error.message || String(error),
    };
}

  /**
   * Log error with context
   */
  logError(error, context = {}) {
    const classification = this.classifyError(error);
    const errorEntry = {
      timestamp: new Date().toISOString(),
      ...classification,
      context,
      stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
    };

    this.errorLog.push(errorEntry);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Console output with severity color
    const emoji =
      {
        [this.severityLevels.LOW]: '⚠️',
        [this.severityLevels.MEDIUM]: '⚠️⚠️',
        [this.severityLevels.HIGH]: '🚨',
        [this.severityLevels.CRITICAL]: '🔴',
      }[classification.severity] || '❓';

    console.error(
      `${emoji} [${classification.category}] ${classification.originalMessage}`,
      context,
    );

    return errorEntry;
  }

  /**
   * Convert error for user display
   */
  getUserMessage(error, context = {}) {
    const classification = this.classifyError(error);
    return {
      message: classification.suggestedAction,
      type: classification.severity === this.severityLevels.CRITICAL ? 'error' : 'warning',
      isRetryable: classification.isRetryable,
      category: classification.category,
    };
  }

  /**
   * Get error logs
   */
  getErrorLogs() {
    return [...this.errorLog];
  }

  /**
   * Clear error logs
   */
  clearErrorLogs() {
    this.errorLog = [];
  }

  /**
   * Get summary of recent errors
   */
  getErrorSummary() {
    const summary = {
      totalErrors: this.errorLog.length,
      byCategory: {},
      bySeverity: {},
    };

    for (const entry of this.errorLog) {
      summary.byCategory[entry.category] =
        (summary.byCategory[entry.category] || 0) + 1;
      summary.bySeverity[entry.severity] = (summary.bySeverity[entry.severity] || 0) + 1;
    }

    return summary;
  }
}

// Singleton instance
const errorHandler = new ErrorHandler();

/**
 * Wrap a function with error handling
 */
export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.logError(error, context);
      throw error;
    }
  };
}

/**
 * Safe wrapper for fetch calls
 */
export async function safeFetch(url, options = {}, context = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );
      error.response = response;
      error.status = response.status;
      throw error;
    }

    return response;
  } catch (error) {
    errorHandler.logError(error, { url, ...context });
    throw error;
  }
}

export default errorHandler;
export { errorHandler };
