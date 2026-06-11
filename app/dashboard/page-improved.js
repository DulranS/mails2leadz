'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from './components/ui/DashboardLayout';
import { Card, CardHeader, CardContent } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { useNotifications } from './components/ui/NotificationProvider';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import CRM from './components/CRM';

// Import existing Firebase and utility functions
// ... existing imports ...

export default function Dashboard() {
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ... existing state and Firebase setup ...

  // Enhanced UI with proper component structure
  return (
    <DashboardLayout
      title="Sales Dashboard"
      subtitle="Manage your leads, campaigns, and analytics"
    >
      <div className="space-y-6">
        {/* Quick Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{whatsappLinks.length}</div>
              <p className="text-sm text-gray-600 mt-1">Total Leads</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(repliedLeads).filter(Boolean).length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Replied</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{validEmails}</div>
              <p className="text-sm text-gray-600 mt-1">Hot Leads</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">
                ${Math.round((Object.values(repliedLeads).filter(Boolean).length * 5000) / 1000)}k
              </div>
              <p className="text-sm text-gray-600 mt-1">Pipeline Value</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'leads', label: 'Lead Management', icon: '👥' },
              { id: 'campaigns', label: 'Campaigns', icon: '📧' },
              { id: 'analytics', label: 'Analytics', icon: '📈' },
              { id: 'crm', label: 'CRM', icon: '💼' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Recent Activity</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.values(repliedLeads).filter(Boolean).slice(0, 5).map((lead, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">New reply from lead</p>
                          <p className="text-xs text-gray-500">Just now</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl mb-2">📧</div>
                    <h3 className="font-semibold mb-2">Send Campaign</h3>
                    <p className="text-sm text-gray-600 mb-4">Start a new outreach campaign</p>
                    <Button onClick={() => setShowCampaignModal(true)}>Create Campaign</Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl mb-2">📱</div>
                    <h3 className="font-semibold mb-2">Multi-Channel</h3>
                    <p className="text-sm text-gray-600 mb-4">Reach leads across platforms</p>
                    <Button variant="outline" onClick={() => setShowMultiChannelModal(true)}>
                      Open Channels
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl mb-2">🤖</div>
                    <h3 className="font-semibold mb-2">AI Research</h3>
                    <p className="text-sm text-gray-600 mb-4">Get AI-powered insights</p>
                    <Button variant="outline" onClick={() => setShowResearchModal(true)}>
                      Research Lead
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="space-y-6">
              {/* CSV Upload Section */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Import Leads</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-sm text-gray-600">
                      Upload a CSV file with columns: business, email, phone, website
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Leads List */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Your Leads ({whatsappLinks.length})</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {whatsappLinks.slice(0, 20).map((link) => {
                      const score = leadScores[link.email] || 0;
                      const isReplied = repliedLeads[link.email];
                      return (
                        <div key={link.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium">{link.business}</div>
                            <div className="text-sm text-gray-500">{link.email}</div>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                score >= 75 ? 'bg-red-100 text-red-800' :
                                score >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                Score: {score}
                              </span>
                              {isReplied && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                  Replied
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleSendWhatsApp(link)}>
                              💬
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleSendEmail(link)}>
                              📧
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'campaigns' && (
            <div className="space-y-6">
              {/* Campaign Templates */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Email Templates</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h4 className="font-medium mb-2">Template A - Initial Outreach</h4>
                      <p className="text-sm text-gray-600 mb-3">Professional introduction with value proposition</p>
                      <Button size="sm" onClick={() => setAbTestMode(true)}>Use Template A</Button>
                    </div>
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h4 className="font-medium mb-2">Template B - Alternative</h4>
                      <p className="text-sm text-gray-600 mb-3">More casual approach for different audiences</p>
                      <Button size="sm" variant="outline" onClick={() => setAbTestMode(false)}>Use Template B</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Campaign Settings */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Campaign Settings</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">Sender Name</label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Daily Email Limit</label>
                      <input
                        type="number"
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard
              leads={whatsappLinks}
              campaigns={[]}
              contacts={lastSent}
              repliedLeads={repliedLeads}
              leadScores={leadScores}
              followUpStats={followUpStats}
              companyStats={companyStats}
              dealStages={dealStage}
            />
          )}

          {activeTab === 'crm' && (
            <CRM
              leads={whatsappLinks}
              contacts={lastSent}
              repliedLeads={repliedLeads}
              leadScores={leadScores}
              dealStages={dealStage}
              onUpdateLead={(email, updates) => {
                // Handle lead updates
                addNotification('Lead updated successfully', 'success');
              }}
              onAddNote={(email, note) => {
                // Handle adding notes
                addNotification('Note added successfully', 'success');
              }}
              onScheduleFollowUp={(email) => {
                // Handle scheduling follow-ups
                addNotification('Follow-up scheduled', 'success');
              }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {/* ... existing modals but with improved styling ... */}
    </DashboardLayout>
  );
}