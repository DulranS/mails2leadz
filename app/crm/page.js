"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "../../components/ui/DashboardLayout";
import CRMComponent from "../../components/CRM";
import { useNotifications } from "../../components/ui/NotificationProvider";
import { supabase } from "../../lib/supabaseClient";

export default function CRMPage() {
  const { addNotification } = useNotifications();
  const [data, setData] = useState({
    leads: [],
    contacts: {},
    repliedLeads: {},
    leadScores: {},
    dealStages: {
      discovery: 0,
      negotiation: 0,
      closed: 0,
    },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      if (!supabase) {
        console.warn('Supabase not configured, using mock data');
        setLoading(false);
        return;
      }

      const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformedLeads = leads.map(lead => ({
        email: lead.email,
        status: lead.status || 'New',
        company: lead.company_name || '',
        score: lead.score || 'UNSCORED',
        ...lead
      }));

      const leadScores = {};
      leads.forEach(lead => {
        const scoreMap = { 'HOT': 85, 'WARM': 60, 'COLD': 30, 'UNSCORED': 0 };
        leadScores[lead.email] = scoreMap[lead.score] || 0;
      });

      const dealStages = {
        discovery: leads.filter(l => l.status === 'new' || l.status === 'contacted').length,
        negotiation: leads.filter(l => l.status === 'followup_1' || l.status === 'followup_2').length,
        closed: leads.filter(l => l.status === 'won' || l.status === 'lost').length,
      };

      setData({
        leads: transformedLeads,
        contacts: {},
        repliedLeads: {},
        leadScores,
        dealStages,
      });
    } catch (error) {
      console.error('Error fetching leads:', error);
      addNotification('Failed to load leads', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLead = async (email, updates) => {
    try {
      if (!supabase) {
        addNotification("Supabase not configured", "error");
        return;
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('email', email);

      if (error) throw error;

      addNotification("Lead updated successfully", "success");
      fetchLeads();
    } catch (error) {
      console.error('Error updating lead:', error);
      addNotification('Failed to update lead', 'error');
    }
  };

  const handleAddNote = async (email, noteText) => {
    try {
      if (!supabase) {
        addNotification("Supabase not configured", "error");
        return;
      }

      const { error } = await supabase
        .from('leads')
        .update({ 
          research_notes: noteText,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);

      if (error) throw error;

      addNotification("Note added successfully", "success");
    } catch (error) {
      console.error('Error adding note:', error);
      addNotification('Failed to add note', 'error');
    }
  };

  const handleScheduleFollowUp = async (email) => {
    try {
      if (!supabase) {
        addNotification("Supabase not configured", "error");
        return;
      }

      const nextFollowUp = new Date();
      nextFollowUp.setDate(nextFollowUp.getDate() + 3);

      const { error } = await supabase
        .from('leads')
        .update({ 
          next_followup_at: nextFollowUp.toISOString(),
          followup_count: (data.leads.find(l => l.email === email)?.followup_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);

      if (error) throw error;

      addNotification("Follow-up scheduled", "success");
      fetchLeads();
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      addNotification('Failed to schedule follow-up', 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="Customer Relationship Management"
        subtitle="Manage leads, deals, and customer interactions"
      >
        <div className="p-6 bg-white rounded-lg shadow">
          <p className="text-gray-500">Loading leads...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Customer Relationship Management"
      subtitle="Manage leads, deals, and customer interactions"
    >
      <CRMComponent
        data={data}
        onUpdateLead={handleUpdateLead}
        onAddNote={handleAddNote}
        onScheduleFollowUp={handleScheduleFollowUp}
      />
    </DashboardLayout>
  );
}
