import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Button } from './ui/Button';

export const AnalyticsDashboard = ({
  leads = [],
  campaigns = [],
  contacts = {},
  repliedLeads = {},
  leadScores = {},
  followUpStats = {},
  companyStats = {},
  dealStages = {},
}) => {
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedMetric, setSelectedMetric] = useState('overview');

  // Calculate metrics
  const metrics = {
    totalLeads: leads.length,
    contactedLeads: Object.keys(contacts).length,
    repliedLeads: Object.keys(repliedLeads).length,
    hotLeads: Object.values(leadScores).filter(score => score >= 75).length,
    conversionRate: leads.length > 0 ? (Object.keys(repliedLeads).length / leads.length * 100).toFixed(1) : 0,
    avgLeadScore: Object.values(leadScores).length > 0
      ? (Object.values(leadScores).reduce((a, b) => a + b, 0) / Object.values(leadScores).length).toFixed(1)
      : 0,
    pipelineValue: Object.keys(repliedLeads).length * 5000, // Assuming $5K avg deal
    companiesContacted: companyStats.totalCompanies || 0,
  };

  const chartData = {
    leadQuality: [
      { name: 'Hot (75+)', value: metrics.hotLeads, color: '#ef4444' },
      { name: 'Warm (50-74)', value: Object.values(leadScores).filter(s => s >= 50 && s < 75).length, color: '#f59e0b' },
      { name: 'Cold (<50)', value: Object.values(leadScores).filter(s => s < 50).length, color: '#6b7280' },
    ],
    conversionFunnel: [
      { stage: 'Contacted', count: metrics.contactedLeads, percentage: 100 },
      { stage: 'Replied', count: metrics.repliedLeads, percentage: metrics.conversionRate },
      { stage: 'Qualified', count: Math.floor(metrics.repliedLeads * 0.6), percentage: (metrics.conversionRate * 0.6).toFixed(1) },
      { stage: 'Closed', count: Math.floor(metrics.repliedLeads * 0.15), percentage: (metrics.conversionRate * 0.15).toFixed(1) },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">Track your lead generation performance</p>
        </div>
        <div className="flex gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{metrics.totalLeads}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Total Leads</p>
            <div className="mt-2 text-xs text-green-600 dark:text-green-400">
              +{Math.floor(metrics.totalLeads * 0.1)} this week
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{metrics.conversionRate}%</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Conversion Rate</p>
            <div className="mt-2 text-xs text-green-600 dark:text-green-400">
              +2.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{metrics.hotLeads}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Hot Leads</p>
            <div className="mt-2 text-xs text-purple-600 dark:text-purple-400">
              {((metrics.hotLeads / metrics.totalLeads) * 100).toFixed(1)}% of total
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">${(metrics.pipelineValue / 1000).toFixed(0)}k</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Pipeline Value</p>
            <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
              @ $5K avg deal
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Quality Distribution */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Lead Quality Distribution</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {chartData.leadQuality.map((segment, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{segment.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{segment.value}</span>
                    <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          backgroundColor: segment.color,
                          width: `${metrics.totalLeads > 0 ? (segment.value / metrics.totalLeads * 100) : 0}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Conversion Funnel</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {chartData.conversionFunnel.map((stage, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{stage.stage}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{stage.count}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">({stage.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance Insights</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Best Contact Time</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Tuesday 10 AM - 12 PM shows 35% higher response rate
              </p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h4 className="font-medium text-green-900 dark:text-green-100">Top Performing Channel</h4>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Email outreach: 24% conversion vs 12% for WhatsApp
              </p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <h4 className="font-medium text-purple-900 dark:text-purple-100">Follow-up Effectiveness</h4>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                3-day follow-ups increase response rate by 40%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white">New lead replied: TechCorp Solutions</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">2 minutes ago</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white">Campaign "Q4 Outreach" completed</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">1 hour ago</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white">5 leads need follow-up today</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">3 hours ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;