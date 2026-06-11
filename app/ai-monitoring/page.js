// app/ai-monitoring/page.js
'use client';

import React from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import AIMonitoringDashboard from '../components/AIMonitoringDashboard';

export default function AIMonitoringPage() {
  return (
    <DashboardLayout
      title="AI Monitoring Dashboard"
      subtitle="Real-time monitoring of AI agent performance, costs, and optimization"
    >
      <div className="space-y-6">
        <AIMonitoringDashboard />
      </div>
    </DashboardLayout>
  );
}
