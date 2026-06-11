// lib/ai/AgentFramework.js
/**
 * Advanced AI Agent Framework
 * Features:
 * - Loop management with state tracking
 * - Error recovery and retry logic
 * - Tool execution and validation
 * - Memory management
 */

export class AgentState {
  constructor() {
    this.status = 'idle'; // idle, running, paused, error, completed
    this.currentStep = 0;
    this.totalSteps = 0;
    this.context = {};
    this.history = [];
    this.errors = [];
    this.metrics = {
      startTime: null,
      endTime: null,
      totalTokens: 0,
      totalCost: 0,
      iterations: 0
    };
  }

  reset() {
    this.status = 'idle';
    this.currentStep = 0;
    this.context = {};
    this.history = [];
    this.errors = [];
    this.metrics = {
      startTime: null,
      endTime: null,
      totalTokens: 0,
      totalCost: 0,
      iterations: 0
    };
  }

  updateStatus(status) {
    this.status = status;
    this.history.push({
      timestamp: new Date().toISOString(),
      status,
      step: this.currentStep
    });
  }

  addError(error) {
    this.errors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      step: this.currentStep
    });
  }

  toJSON() {
    return {
      status: this.status,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      context: this.context,
      history: this.history,
      errors: this.errors,
      metrics: this.metrics
    };
  }
}

export class AgentTool {
  constructor(name, description, execute, schema = {}) {
    this.name = name;
    this.description = description;
    this.execute = execute;
    this.schema = schema;
    this.usageCount = 0;
    this.errorCount = 0;
    this.avgLatency = 0;
  }

  async executeWithMetrics(...args) {
    const startTime = Date.now();
    this.usageCount++;
    
    try {
      const result = await this.execute(...args);
      const latency = Date.now() - startTime;
      this.avgLatency = (this.avgLatency * (this.usageCount - 1) + latency) / this.usageCount;
      
      return {
        success: true,
        result,
        latency,
        tool: this.name
      };
    } catch (error) {
      this.errorCount++;
      const latency = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        latency,
        tool: this.name
      };
    }
  }

  getMetrics() {
    return {
      usageCount: this.usageCount,
      errorCount: this.errorCount,
      errorRate: this.usageCount > 0 ? this.errorCount / this.usageCount : 0,
      avgLatency: this.avgLatency
    };
  }
}

export class AgentFramework {
  constructor(config = {}) {
    this.config = {
      maxIterations: config.maxIterations || 10,
      maxErrors: config.maxErrors || 3,
      timeout: config.timeout || 30000,
      retryDelay: config.retryDelay || 1000,
      enableLogging: config.enableLogging || true,
      ...config
    };
    
    this.tools = new Map();
    this.state = new AgentState();
    this.hooks = {
      beforeStep: [],
      afterStep: [],
      onError: [],
      onComplete: []
    };
  }

  registerTool(tool) {
    if (!(tool instanceof AgentTool)) {
      throw new Error('Tool must be an instance of AgentTool');
    }
    this.tools.set(tool.name, tool);
  }

  addHook(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(callback);
    }
  }

  async executeHook(hookName, data) {
    if (this.hooks[hookName]) {
      for (const callback of this.hooks[hookName]) {
        await callback(data);
      }
    }
  }

  async run(initialContext = {}) {
    this.state.reset();
    this.state.context = initialContext;
    this.state.metrics.startTime = Date.now();
    this.state.updateStatus('running');

    try {
      let iterations = 0;
      
      while (iterations < this.config.maxIterations) {
        this.state.currentStep = iterations + 1;
        
        // Check error threshold
        if (this.state.errors.length >= this.config.maxErrors) {
          throw new Error(`Max errors (${this.config.maxErrors}) exceeded`);
        }

        // Execute before step hooks
        await this.executeHook('beforeStep', {
          step: this.state.currentStep,
          context: this.state.context
        });

        // Execute the agent step
        const stepResult = await this.executeStep();
        
        // Update context with step result
        if (stepResult) {
          this.state.context = {
            ...this.state.context,
            ...stepResult
          };
        }

        // Execute after step hooks
        await this.executeHook('afterStep', {
          step: this.state.currentStep,
          context: this.state.context,
          result: stepResult
        });

        // Check if complete
        if (this.isComplete(stepResult)) {
          this.state.updateStatus('completed');
          break;
        }

        iterations++;
        this.state.metrics.iterations++;
      }

      if (iterations >= this.config.maxIterations) {
        this.state.updateStatus('completed');
        this.log('Max iterations reached');
      }

    } catch (error) {
      this.state.addError(error);
      this.state.updateStatus('error');
      await this.executeHook('onError', { error, state: this.state });
      throw error;
    } finally {
      this.state.metrics.endTime = Date.now();
      await this.executeHook('onComplete', { state: this.state });
    }

    return this.state;
  }

  async executeStep() {
    throw new Error('executeStep must be implemented by subclass');
  }

  isComplete(stepResult) {
    // Override in subclass to define completion condition
    return false;
  }

  async useTool(toolName, ...args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const result = await tool.executeWithMetrics(...args);
    
    if (!result.success) {
      this.state.addError(new Error(result.error));
    }

    return result;
  }

  getToolMetrics() {
    const metrics = {};
    for (const [name, tool] of this.tools) {
      metrics[name] = tool.getMetrics();
    }
    return metrics;
  }

  log(message) {
    if (this.config.enableLogging) {
      console.log(`[Agent ${this.constructor.name}] ${message}`);
    }
  }

  getState() {
    return this.state.toJSON();
  }
}

export default AgentFramework;
