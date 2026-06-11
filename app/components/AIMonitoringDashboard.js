// app/components/AIMonitoringDashboard.js
'use client';

import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export default function AIMonitoringDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/ai-automation');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load AI stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-gray-500">No stats available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-4">
        {['overview', 'agent', 'context', 'cache', 'cost', 'tools'].map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && <OverviewTab stats={stats} />}
      {selectedTab === 'agent' && <AgentTab stats={stats} />}
      {selectedTab === 'context' && <ContextTab stats={stats} />}
      {selectedTab === 'cache' && <CacheTab stats={stats} />}
      {selectedTab === 'cost' && <CostTab stats={stats} />}
      {selectedTab === 'tools' && <ToolsTab stats={stats} />}
    </div>
  );
}

function OverviewTab({ stats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Agent Status"
        value={stats.agent.status}
        color={stats.agent.status === 'completed' ? 'green' : 'blue'}
      />
      <StatCard
        title="Total Requests"
        value={stats.cost.requests.total}
        color="blue"
      />
      <StatCard
        title="Cache Hit Rate"
        value={stats.cache.hitRate}
        color="green"
      />
      <StatCard
        title="Total Cost"
        value={`$${stats.cost.costs.total}`}
        color="purple"
      />
    </div>
  );
}

function AgentTab({ stats }) {
  const agent = stats.agent;
  
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Agent State</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Status" value={agent.status} />
          <InfoRow label="Current Step" value={`${agent.currentStep}/${agent.totalSteps}`} />
          <InfoRow label="Iterations" value={agent.metrics.iterations} />
          <InfoRow label="Errors" value={agent.errors.length} />
          <InfoRow label="Start Time" value={new Date(agent.metrics.startTime).toLocaleString()} />
          <InfoRow label="End Time" value={agent.metrics.endTime ? new Date(agent.metrics.endTime).toLocaleString() : 'Running'} />
        </div>
      </Card>

      {agent.errors.length > 0 && (
        <Card className="p-6 border-red-200 dark:border-red-800">
          <h3 className="text-lg font-semibold mb-4 text-red-600 dark:text-red-400">Errors</h3>
          <div className="space-y-2">
            {agent.errors.map((error, idx) => (
              <div key={idx} className="text-sm text-red-600 dark:text-red-400">
                <strong>Step {error.step}:</strong> {error.error}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Execution History</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {agent.history.map((entry, idx) => (
            <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              {' - '}
              {entry.status} (Step {entry.step})
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ContextTab({ stats }) {
  const context = stats.context;
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Messages" value={context.totalMessages} color="blue" />
        <StatCard title="Total Tokens" value={context.totalTokens.toLocaleString()} color="purple" />
        <StatCard title="Usage %" value={`${context.usagePercent}%`} color="green" />
        <StatCard title="Compressed" value={context.compressedCount} color="orange" />
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Message Priority Distribution</h3>
        <div className="space-y-2">
          <ProgressBar label="High Priority" value={context.messagesByPriority.high} total={context.totalMessages} color="red" />
          <ProgressBar label="Normal Priority" value={context.messagesByPriority.normal} total={context.totalMessages} color="blue" />
          <ProgressBar label="Low Priority" value={context.messagesByPriority.low} total={context.totalMessages} color="gray" />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Context Window Usage</h3>
        <ProgressBar 
          label="Token Usage" 
          value={context.totalTokens} 
          total={context.maxTokens} 
          color={context.usagePercent > 80 ? 'red' : 'green'}
          showPercentage
        />
      </Card>
    </div>
  );
}

function CacheTab({ stats }) {
  const cache = stats.cache;
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Cache Size" value={`${cache.size}/${cache.maxSize}`} color="blue" />
        <StatCard title="Hit Rate" value={cache.hitRate} color="green" />
        <StatCard title="Total Hits" value={cache.hits} color="green" />
        <StatCard title="Total Misses" value={cache.misses} color="red" />
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Cache Performance</h3>
        <div className="space-y-2">
          <InfoRow label="Semantic Hits" value={cache.semanticHits} />
          <InfoRow label="Semantic Hit Rate" value={cache.semanticHitRate} />
          <InfoRow label="Evictions" value={cache.evictions} />
          <InfoRow label="Total Requests" value={cache.totalRequests} />
        </div>
      </Card>
    </div>
  );
}

function CostTab({ stats }) {
  const cost = stats.cost;
  
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Budget Overview</h3>
        <div className="space-y-4">
          <ProgressBar 
            label="Budget Usage" 
            value={cost.budget.used} 
            total={cost.budget.total} 
            color={cost.budget.usagePercent > 80 ? 'red' : 'green'}
            showPercentage
            prefix="$"
          />
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Total Budget" value={`$${cost.budget.total}`} />
            <InfoRow label="Used" value={`$${cost.budget.used.toFixed(2)}`} />
            <InfoRow label="Remaining" value={`$${cost.budget.remaining.toFixed(2)}`} />
            <InfoRow label="Period" value={cost.budget.period} />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
        <div className="space-y-2">
          <InfoRow label="Total Cost" value={`$${cost.costs.total}`} />
          <InfoRow label="Cost per Request" value={`$${cost.costs.perRequest}`} />
          <InfoRow label="Cost per 1K Tokens" value={`$${cost.costs.per1KTokens}`} />
          <InfoRow label="Total Tokens" value={cost.tokens.total.toLocaleString()} />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Latency Metrics</h3>
        <div className="space-y-2">
          <InfoRow label="Average" value={`${cost.latency.average}ms`} />
          <InfoRow label="P50" value={`${cost.latency.p50}ms`} />
          <InfoRow label="P95" value={`${cost.latency.p95}ms`} />
          <InfoRow label="P99" value={`${cost.latency.p99}ms`} />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Model Usage</h3>
        <div className="space-y-2">
          {Object.entries(cost.requests.byModel).map(([model, data]) => (
            <div key={model} className="flex justify-between items-center">
              <span className="font-medium">{model}</span>
              <span className="text-gray-600 dark:text-gray-400">
                {data.requests} requests, {data.tokens.toLocaleString()} tokens, ${data.cost.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ToolsTab({ stats }) {
  const tools = stats.tools;
  
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Tool Performance</h3>
        <div className="space-y-4">
          {Object.entries(tools).map(([name, metrics]) => (
            <div key={name} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{name}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  metrics.errorRate < 0.1 ? 'bg-green-100 text-green-800' :
                  metrics.errorRate < 0.3 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Error Rate: {(metrics.errorRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <InfoRow label="Usage Count" value={metrics.usageCount} />
                <InfoRow label="Error Count" value={metrics.errorCount} />
                <InfoRow label="Avg Latency" value={`${metrics.avgLatency.toFixed(2)}ms`} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  return (
    <Card className="p-6">
      <div className="flex items-center space-x-4">
        <div className={`w-3 h-3 rounded-full ${colorClasses[color] || 'bg-blue-500'}`}></div>
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{title}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600 dark:text-gray-400">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProgressBar({ label, value, total, color, showPercentage = false, prefix = '' }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500'
  };

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-sm font-medium">
          {prefix}{value.toLocaleString()}/{prefix}{total.toLocaleString()}
          {showPercentage && ` (${percentage.toFixed(1)}%)`}
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`${colorClasses[color] || 'bg-blue-500'} h-2 rounded-full transition-all`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
}
