'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { useNotifications } from '../components/ui/NotificationProvider';

// Import Firebase functions (you'll need to adapt these from your existing dashboard)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  // Your Firebase config
};

const db = getFirestore(initializeApp(firebaseConfig));

export default function LeadsPage() {
  const { addNotification } = useNotifications();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const leadsRef = collection(db, 'leads');
      const snapshot = await getDocs(leadsRef);
      const leadsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLeads(leadsData);
    } catch (error) {
      console.error('Error loading leads:', error);
      addNotification('Error loading leads', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLead = async (leadId, updates) => {
    try {
      await updateDoc(doc(db, 'leads', leadId), updates);
      setLeads(prev => prev.map(lead =>
        lead.id === leadId ? { ...lead, ...updates } : lead
      ));
      addNotification('Lead updated successfully', 'success');
    } catch (error) {
      console.error('Error updating lead:', error);
      addNotification('Error updating lead', 'error');
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      await updateDoc(doc(db, 'leads', leadId), { deleted: true });
      setLeads(prev => prev.filter(lead => lead.id !== leadId));
      addNotification('Lead deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting lead:', error);
      addNotification('Error deleting lead', 'error');
    }
  };

  const filteredLeads = leads.filter(lead => {
    if (filter === 'all') return !lead.deleted;
    if (filter === 'hot') return !lead.deleted && (lead.score || 0) >= 75;
    if (filter === 'new') return !lead.deleted && lead.status === 'new';
    if (filter === 'contacted') return !lead.deleted && lead.status === 'contacted';
    return !lead.deleted;
  });

  const columns = [
    {
      key: 'company',
      label: 'Company',
      render: (value, lead) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-white">{value || 'Unknown'}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{lead.email}</div>
        </div>
      ),
    },
    {
      key: 'score',
      label: 'Score',
      render: (value) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          (value || 0) >= 75 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
          (value || 0) >= 50 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
        }`}>
          {(value || 0)}/100
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (value, lead) => (
        <select
          value={value || 'new'}
          onChange={(e) => handleUpdateLead(lead.id, { status: e.target.value })}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="demo">Demo</option>
          <option value="proposal">Proposal</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      ),
    },
    {
      key: 'lastContact',
      label: 'Last Contact',
      render: (value) => value ? new Date(value).toLocaleDateString() : 'Never',
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
              setShowModal(true);
            }}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => handleDeleteLead(lead.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <DashboardLayout title="Lead Management" subtitle="Loading leads...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Lead Management"
      subtitle="Manage and track all your business leads"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{leads.length}</div>
              <p className="text-sm text-gray-600 mt-1">Total Leads</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {leads.filter(l => (l.score || 0) >= 75).length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Hot Leads</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {leads.filter(l => l.status === 'qualified' || l.status === 'demo' || l.status === 'proposal').length}
              </div>
              <p className="text-sm text-gray-600 mt-1">In Pipeline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {leads.filter(l => l.status === 'won').length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Closed Won</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex gap-2">
                {[
                  { key: 'all', label: 'All Leads' },
                  { key: 'hot', label: 'Hot Leads' },
                  { key: 'new', label: 'New' },
                  { key: 'contacted', label: 'Contacted' },
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
              <Button onClick={() => {
                setSelectedLead(null);
                setShowModal(true);
              }}>
                Add Lead
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Leads ({filteredLeads.length})</h3>
          </CardHeader>
          <CardContent>
            <DataTable
              data={filteredLeads}
              columns={columns}
              searchable={true}
              sortable={true}
              pagination={true}
              pageSize={20}
            />
          </CardContent>
        </Card>

        {/* Lead Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={selectedLead ? 'Edit Lead' : 'Add New Lead'}
          size="lg"
        >
          <LeadForm
            lead={selectedLead}
            onSave={async (leadData) => {
              try {
                if (selectedLead) {
                  await handleUpdateLead(selectedLead.id, leadData);
                } else {
                  const docRef = await addDoc(collection(db, 'leads'), {
                    ...leadData,
                    createdAt: new Date(),
                    status: 'new',
                  });
                  setLeads(prev => [...prev, { id: docRef.id, ...leadData }]);
                }
                setShowModal(false);
                addNotification('Lead saved successfully', 'success');
              } catch (error) {
                console.error('Error saving lead:', error);
                addNotification('Error saving lead', 'error');
              }
            }}
            onCancel={() => setShowModal(false)}
          />
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function LeadForm({ lead, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    company: lead?.company || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    website: lead?.website || '',
    industry: lead?.industry || '',
    notes: lead?.notes || '',
    score: lead?.score || 0,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            required
            value={formData.company}
            onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Website
          </label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Industry
          </label>
          <input
            type="text"
            value={formData.industry}
            onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Lead Score
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={formData.score}
            onChange={(e) => setFormData(prev => ({ ...prev, score: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <textarea
          rows="3"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {lead ? 'Update Lead' : 'Add Lead'}
        </Button>
      </div>
    </form>
  );
}