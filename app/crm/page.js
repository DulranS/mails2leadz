"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import CRM from "../components/CRM";
import { useNotifications } from "../components/ui/NotificationProvider";

export default function CRMPage() {
  const { addNotification } = useNotifications();
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [data, setData] = useState({
    leads: [],
    contacts: {},
    repliedLeads: {},
    leadScores: {},
    dealStages: {},
  });
  const [loading, setLoading] = useState(true);

  // Firebase has been disabled due to webpack compilation errors
  // The CRM page requires migration to use Supabase APIs instead
  // TODO: Implement Supabase-based data loading for all CRM functionality

  useEffect(() => {
    // Firebase disabled - authentication requires Supabase migration
    setUser(null);
    setLoadingAuth(false);
  }, []);

  useEffect(() => {
    // Firebase disabled - data loading requires Supabase migration
    setLoading(false);
  }, [user?.uid]);

  const handleUpdateLead = async (email, updates) => {
    // Firebase disabled - implement using Supabase
    addNotification("CRM requires Supabase migration", "error");
  };

  const handleAddNote = async (email, noteText) => {
    // Firebase disabled - implement using Supabase
    addNotification("CRM requires Supabase migration", "error");
  };

  const handleScheduleFollowUp = async (email) => {
    // Firebase disabled - implement using Supabase
    addNotification("CRM requires Supabase migration", "error");
  };

  if (loadingAuth) {
    return (
      <DashboardLayout title="CRM" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout title="CRM" subtitle="Authentication Required">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            The CRM page requires Supabase migration. Firebase has been disabled due to webpack build errors.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout title="CRM" subtitle="Loading CRM data...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Customer Relationship Management"
      subtitle="Manage leads, deals, and customer interactions"
    >
      <CRM
        leads={data.leads}
        contacts={data.contacts}
        repliedLeads={data.repliedLeads}
        leadScores={data.leadScores}
        dealStages={data.dealStages}
        onUpdateLead={handleUpdateLead}
        onAddNote={handleAddNote}
        onScheduleFollowUp={handleScheduleFollowUp}
      />
    </DashboardLayout>
  );
}
