import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { DataTable } from './ui/DataTable';
import { Modal } from './ui/Modal';

export const CRM = ({
  leads = [],
  contacts = {},
  repliedLeads = {},
  leadScores = {},
  dealStages = {},
  onUpdateLead,
  onAddNote,
  onScheduleFollowUp,
}) => {
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Enhanced lead data with CRM information
  const crmLeads = useMemo(() => {
    return leads.map(lead => ({
      ...lead,
      score: leadScores[lead.email] || 0,
      stage: dealStages[lead.email] || 'new',
      lastContact: contacts[lead.email]?.lastContact || null,
      replied: !!repliedLeads[lead.email],
      notes: contacts[lead.email]?.notes || [],
      nextFollowUp: contacts[lead.email]?.nextFollowUp || null,
      company: lead.business || lead.company || 'Unknown',
      value: 5000, // Default deal value
    }));
  }, [leads, leadScores, dealStages, contacts, repliedLeads]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    let filtered = crmLeads;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(lead =>
        lead.business?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.company?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    switch (filter) {
      case 'hot':
        filtered = filtered.filter(lead => lead.score >= 75);
        break;
      case 'replied':
        filtered = filtered.filter(lead => lead.replied);
        break;
      case 'followup':
        filtered = filtered.filter(lead => lead.nextFollowUp);
        break;
      case 'new':
        filtered = filtered.filter(lead => lead.stage === 'new');
        break;
      default:
        break;
    }

    return filtered;
  }, [crmLeads, filter, searchTerm]);

  const tableColumns = [
    {
      key: 'company',
      label: 'Company',
      render: (value, lead) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-white">{value}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{lead.email}</div>
        </div>
      ),
    },
    {
      key: 'score',
      label: 'Score',
      render: (value) => (
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            value >= 75 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
            value >= 50 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          }`}>
            {value}/100
          </span>
        </div>
      ),
    },
    {
      key: 'stage',
      label: 'Stage',
      render: (value) => (
        <select
          value={value}
          onChange={(e) => onUpdateLead?.(selectedLead?.email, { stage: e.target.value })}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="demo">Demo Scheduled</option>
          <option value="proposal">Proposal Sent</option>
          <option value="won">Closed Won</option>
          <option value="lost">Closed Lost</option>
        </select>
      ),
    },
    {
      key: 'lastContact',
      label: 'Last Contact',
      render: (value) => value ? new Date(value).toLocaleDateString() : 'Never',
    },
    {
      key: 'nextFollowUp',
      label: 'Next Follow-up',
      render: (value) => value ? new Date(value).toLocaleDateString() : 'None',
    },
    {
      key: 'value',
      label: 'Value',
      render: (value) => `$${value.toLocaleString()}`,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (value, lead) => (
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedLead(lead);
              setShowLeadModal(true);
            }}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onScheduleFollowUp?.(lead.email)}
          >
            Follow-up
          </Button>
        </div>
      ),
    },
  ];

  const stats = {
    total: crmLeads.length,
    hot: crmLeads.filter(l => l.score >= 75).length,
    replied: crmLeads.filter(l => l.replied).length,
    pipeline: crmLeads.filter(l => ['qualified', 'demo', 'proposal'].includes(l.stage)).length,
    won: crmLeads.filter(l => l.stage === 'won').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">CRM Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage your leads and deals</p>
        </div>
        <Button onClick={() => {/* Add new lead functionality */}}>
          Add Lead
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.hot}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Hot Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.replied}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Replied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.pipeline}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">In Pipeline</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.won}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Closed Won</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: 'hot', label: 'Hot' },
                { key: 'replied', label: 'Replied' },
                { key: 'followup', label: 'Needs Follow-up' },
                { key: 'new', label: 'New' },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  variant={filter === key ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Leads</h3>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredLeads}
            columns={tableColumns}
            searchable={false} // We have our own search
            pagination={true}
            pageSize={10}
          />
        </CardContent>
      </Card>

      {/* Lead Detail Modal */}
      <Modal
        isOpen={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        title="Lead Details"
        size="lg"
      >
        {selectedLead && (
          <div className="space-y-6">
            {/* Lead Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Company</label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLead.company}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLead.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLead.phone || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Score</label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLead.score}/100</p>
              </div>
            </div>

            {/* Deal Stage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Deal Stage</label>
              <select
                value={selectedLead.stage}
                onChange={(e) => onUpdateLead?.(selectedLead.email, { stage: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="demo">Demo Scheduled</option>
                <option value="proposal">Proposal Sent</option>
                <option value="won">Closed Won</option>
                <option value="lost">Closed Lost</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedLead.notes?.length > 0 ? (
                  selectedLead.notes.map((note, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                      <p className="text-sm text-gray-900 dark:text-white">{note.text}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(note.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No notes yet</p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      onAddNote?.(selectedLead.email, e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
                <Button size="sm" onClick={() => onScheduleFollowUp?.(selectedLead.email)}>
                  Schedule Follow-up
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CRM;