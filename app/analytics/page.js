'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

// Import Firebase functions
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  // Your Firebase config - same as dashboard
};

const db = getFirestore(initializeApp(firebaseConfig));

export default function AnalyticsPage() {
  const [data, setData] = useState({
    leads: [],
    campaigns: [],
    contacts: {},
    repliedLeads: {},
    leadScores: {},
    followUpStats: {},
    companyStats: { totalCompanies: 0, totalContacts: 0, replyRate: 0 },
    dealStages: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      // Load leads
      const leadsRef = collection(db, 'leads');
      const leadsSnapshot = await getDocs(leadsRef);
      const leads = leadsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load campaigns
      const campaignsRef = collection(db, 'campaigns');
      const campaignsSnapshot = await getDocs(campaignsRef);
      const campaigns = campaignsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load contact history
      const contactsRef = collection(db, 'contacts');
      const contactsSnapshot = await getDocs(contactsRef);
      const contacts = {};
      contactsSnapshot.docs.forEach(doc => {
        const contact = doc.data();
        contacts[contact.email] = contact;
      });

      // Load replied leads
      const repliesRef = collection(db, 'replies');
      const repliesSnapshot = await getDocs(repliesRef);
      const repliedLeads = {};
      repliesSnapshot.docs.forEach(doc => {
        const reply = doc.data();
        repliedLeads[reply.email] = true;
      });

      // Calculate lead scores (simplified)
      const leadScores = {};
      leads.forEach(lead => {
        let score = 0;
        if (lead.email) score += 20;
        if (lead.phone) score += 15;
        if (lead.website) score += 15;
        if (lead.industry) score += 10;
        if (repliedLeads[lead.email]) score += 40;
        leadScores[lead.email] = Math.min(score, 100);
      });

      // Calculate follow-up stats
      const followUpStats = {
        readyForFollowUp: leads.filter(lead =>
          contacts[lead.email] &&
          new Date() - new Date(contacts[lead.email].lastContact) > 2 * 24 * 60 * 60 * 1000
        ).length,
      };

      // Calculate company stats
      const companies = [...new Set(leads.map(lead => lead.company).filter(Boolean))];
      const companyStats = {
        totalCompanies: companies.length,
        totalContacts: leads.length,
        replyRate: leads.length > 0 ? Math.round((Object.keys(repliedLeads).length / leads.length) * 100) : 0,
      };

      // Deal stages
      const dealStages = {};
      leads.forEach(lead => {
        dealStages[lead.email] = lead.status || 'new';
      });

      setData({
        leads,
        campaigns,
        contacts,
        repliedLeads,
        leadScores,
        followUpStats,
        companyStats,
        dealStages,
      });
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Analytics" subtitle="Loading analytics data...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Analytics & Insights"
      subtitle="Track your sales performance and business metrics"
    >
      <AnalyticsDashboard
        leads={data.leads}
        campaigns={data.campaigns}
        contacts={data.contacts}
        repliedLeads={data.repliedLeads}
        leadScores={data.leadScores}
        followUpStats={data.followUpStats}
        companyStats={data.companyStats}
        dealStages={data.dealStages}
      />
    </DashboardLayout>
  );
}