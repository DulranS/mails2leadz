'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import CRM from '../components/CRM';
import { useNotifications } from '../components/ui/NotificationProvider';

// Import Firebase functions
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, addDoc, query, where, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase with error handling
let app;
let db;
let auth;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
  auth = getAuth(app);
  if (typeof window !== 'undefined') {
    auth.setPersistence(browserLocalPersistence).catch((error) => {
      console.error('Firebase auth persistence error:', error);
    });
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
}

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

  // Auth state listener
  useEffect(() => {
    if (!auth) {
      setLoadingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.uid) {
      loadCRMData();
    }
  }, [user?.uid]);

  const loadCRMData = async () => {
    if (!user?.uid || !db) {
      setLoading(false);
      return;
    }

    try {
      // Load sent emails (these are the leads from the dashboard)
      const sentEmailsRef = collection(db, 'sent_emails');
      const sentEmailsSnapshot = await getDocs(sentEmailsRef);
      const leads = sentEmailsSnapshot.docs
        .filter(doc => doc.data().userId === user.uid)
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            email: data.to || data.recipientEmail,
            business: data.recipientName || data.business_name || 'Unknown',
            company: data.business_name || 'Unknown',
            phone: data.recipientPhone || null,
            website: data.recipientWebsite || null,
            industry: data.industry || null,
            sentAt: data.sentAt,
            replied: data.replied || false,
            repliedAt: data.repliedAt || null,
            followUpAt: data.followUpAt || null,
            status: data.replied ? 'replied' : 'sent',
            notes: data.notes || [],
            nextFollowUp: data.followUpAt || null,
            ...data
          };
        });

      // Load contacts from nested user collection
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const contactsSnapshot = await getDocs(contactsRef);
      const contacts = {};
      contactsSnapshot.docs.forEach(doc => {
        const contact = doc.data();
        contacts[contact.email] = contact;
      });

      // Load deals from top-level collection
      const dealsRef = collection(db, 'deals');
      const dealsSnapshot = await getDocs(dealsRef);
      const dealStages = {};
      dealsSnapshot.docs.forEach(doc => {
        const deal = doc.data();
        if (deal.userId === user.uid) {
          dealStages[deal.email] = deal.stage || 'new';
        }
      });

      // Create replied leads map from sent_emails data
      const repliedLeads = {};
      leads.forEach(lead => {
        if (lead.replied) {
          repliedLeads[lead.email] = true;
        }
      });

      // Calculate lead scores using dashboard logic
      const leadScores = {};
      leads.forEach(lead => {
        let score = 50; // Base score
        if (lead.email) score += 15;
        if (lead.phone) score += 10;
        if (lead.website) score += 5;
        if (lead.industry) score += 5;
        if (repliedLeads[lead.email]) score += 25;
        if (lead.repliedAt) {
          const daysSinceReply = Math.floor((new Date() - new Date(lead.repliedAt)) / (1000 * 60 * 60 * 24));
          if (daysSinceReply < 7) score += 10;
        }
        leadScores[lead.email] = Math.min(score, 100);
      });

      // Update deal stages for leads without explicit deal records
      leads.forEach(lead => {
        if (!dealStages[lead.email]) {
          if (lead.replied) {
            dealStages[lead.email] = 'engaged';
          } else if (lead.followUpAt && new Date(lead.followUpAt) > new Date()) {
            dealStages[lead.email] = 'followup';
          } else {
            dealStages[lead.email] = 'new';
          }
        }
      });

      setData({
        leads,
        contacts,
        repliedLeads,
        leadScores,
        dealStages,
      });
    } catch (error) {
      console.error('Error loading CRM data:', error);
      addNotification('Error loading CRM data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLead = async (email, updates) => {
    if (!user?.uid || !db) return;

    try {
      // Find the lead document in sent_emails
      const leadsRef = collection(db, 'sent_emails');
      const q = query(leadsRef, where('userId', '==', user.uid), where('to', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const leadDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'sent_emails', leadDoc.id), updates);

        // Update deal stage in deals collection if status changed
        if (updates.status) {
          const dealRef = doc(db, 'deals', `${user.uid}_${email}`);
          const dealSnap = await getDoc(dealRef);
          if (dealSnap.exists()) {
            await updateDoc(dealRef, { 
              stage: updates.status,
              lastUpdate: new Date().toISOString()
            });
          } else {
            await setDoc(dealRef, {
              email,
              userId: user.uid,
              stage: updates.status,
              value: 5000,
              lastUpdate: new Date().toISOString()
            });
          }
        }

        // Update local state
        setData(prev => ({
          ...prev,
          leads: prev.leads.map(lead =>
            lead.email === email ? { ...lead, ...updates } : lead
          ),
          dealStages: {
            ...prev.dealStages,
            [email]: updates.status || prev.dealStages[email],
          },
        }));

        addNotification('Lead updated successfully', 'success');
      } else {
        addNotification('Lead not found', 'error');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      addNotification('Error updating lead', 'error');
    }
  };

  const handleAddNote = async (email, noteText) => {
    if (!user?.uid || !db) return;

    try {
      const note = {
        text: noteText,
        timestamp: new Date().toISOString(),
        type: 'manual',
        addedBy: user.email || user.displayName || 'User'
      };

      // Find the lead and update notes in sent_emails
      const leadsRef = collection(db, 'sent_emails');
      const q = query(leadsRef, where('userId', '==', user.uid), where('to', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const leadDoc = querySnapshot.docs[0];
        const currentNotes = leadDoc.data().notes || [];
        await updateDoc(doc(db, 'sent_emails', leadDoc.id), {
          notes: [...currentNotes, note],
        });

        // Update local state
        setData(prev => ({
          ...prev,
          leads: prev.leads.map(lead =>
            lead.email === email
              ? { ...lead, notes: [...(lead.notes || []), note] }
              : lead
          ),
        }));

        addNotification('Note added successfully', 'success');
      } else {
        addNotification('Lead not found', 'error');
      }
    } catch (error) {
      console.error('Error adding note:', error);
      addNotification('Error adding note', 'error');
    }
  };

  const handleScheduleFollowUp = async (email) => {
    if (!user?.uid || !db) return;

    try {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 3); // 3 days from now

      // Find the lead and update next follow-up in sent_emails
      const leadsRef = collection(db, 'sent_emails');
      const q = query(leadsRef, where('userId', '==', user.uid), where('to', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const leadDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'sent_emails', leadDoc.id), {
          followUpAt: followUpDate,
        });

        // Update local state
        setData(prev => ({
          ...prev,
          leads: prev.leads.map(lead =>
            lead.email === email
              ? { ...lead, nextFollowUp: followUpDate, followUpAt: followUpDate }
              : lead
          ),
          dealStages: {
            ...prev.dealStages,
            [email]: 'followup'
          },
        }));

        addNotification('Follow-up scheduled successfully', 'success');
      } else {
        addNotification('Lead not found', 'error');
      }
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      addNotification('Error scheduling follow-up', 'error');
    }
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
          <p className="text-gray-600 dark:text-gray-400">Please sign in to access the CRM.</p>
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
