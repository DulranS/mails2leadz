// app/ai-tools/page.js
'use client';

import React, { useState } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import CodeAutomationPanel from '../components/CodeAutomationPanel';
import AIMonitoringDashboard from '../components/AIMonitoringDashboard';

export default function AIToolsPage() {
  const [activeTab, setActiveTab] = useState('automation');

  return (
    <DashboardLayout
      title="AI Tools & Monitoring"
      subtitle="Code automation, bug detection, and AI performance monitoring"
    >
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-4">
          <button
            onClick={() => setActiveTab('automation')}
            className={`px-6 py-3 rounded-lg font-medium transition ${
              activeTab === 'automation'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            🤖 Code Automation
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-6 py-3 rounded-lg font-medium transition ${
              activeTab === 'monitoring'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            📊 Monitoring Dashboard
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'automation' && <CodeAutomationPanel />}
        {activeTab === 'monitoring' && <AIMonitoringDashboard />}
      </div>
    </DashboardLayout>
  );
}
