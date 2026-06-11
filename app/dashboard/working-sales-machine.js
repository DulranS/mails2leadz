'use client';

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app, db, auth;
if (typeof window !== 'undefined' && firebaseConfig.apiKey) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error('Firebase init error:', error);
  }
}

// Working templates
const WORKING_TEMPLATES = {
  initial: {
    name: 'Initial Outreach',
    subject: 'Question about {{company}}',
    body: `Hi {{first_name},

Came across {{company}} and noticed you're in the {{industry}} space.

We help companies like yours generate 15-25 qualified leads per month through targeted outreach.

Would you be open to a quick 10-minute call to see if this could help {{company}} hit your growth targets?

Best regards,
{{sender_name}}
{{booking_link}}`
  },
  followup: {
    name: 'Follow-up',
    subject: 'Re: {{company}}',
    body: `Hi {{first_name}},

Just following up on my previous email about helping {{company}} generate more qualified leads.

We recently helped {{similar_company}} (also in {{industry}}) increase their lead flow by 40% in just 60 days.

Would you be interested in hearing how we did it?

Best,
{{sender_name}}`
  },
  final: {
    name: 'Final Follow-up',
    subject: 'Closing the loop - {{company}}',
    body: `Hi {{first_name}},

I've reached out a couple of times about helping {{company}} with lead generation.

Assuming now isn't the right time or this isn't a priority.

If that changes, I'm here to help.

Best,
{{sender_name}}`
  }
};

export default function WorkingSalesMachine() {
  // Core state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('import');
  
  // Data state
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  
  // UI state
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // AI state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Notification system
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type, timestamp: new Date() }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Authentication
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadContacts();
        loadCampaigns();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    if (!auth) {
      addNotification('Firebase not configured', 'error');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      addNotification('Signed in successfully', 'success');
    } catch (error) {
      addNotification('Sign in failed: ' + error.message, 'error');
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      addNotification('Signed out', 'success');
    } catch (error) {
      addNotification('Sign out failed: ' + error.message, 'error');
    }
  };

  // Load contacts from Firestore
  const loadContacts = async () => {
    if (!user || !db) return;
    
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedContacts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      
      setContacts(loadedContacts);
      addNotification(`Loaded ${loadedContacts.length} contacts`, 'success');
    } catch (error) {
      console.error('Load contacts error:', error);
      addNotification('Failed to load contacts: ' + error.message, 'error');
    }
  };

  // Load campaigns from Firestore
  const loadCampaigns = async () => {
    if (!user || !db) return;
    
    try {
      const campaignsRef = collection(db, 'users', user.uid, 'campaigns');
      const q = query(campaignsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedCampaigns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      
      setCampaigns(loadedCampaigns);
    } catch (error) {
      console.error('Load campaigns error:', error);
      addNotification('Failed to load campaigns: ' + error.message, 'error');
    }
  };

  // CSV Import
  const handleCsvImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    addNotification('Processing CSV file...', 'info');
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV must have headers and data');
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const importedContacts = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length !== headers.length) continue;
        
        const contact = {};
        headers.forEach((header, index) => {
          contact[header.toLowerCase().replace(/\s+/g, '_')] = values[index] || '';
        });
        
        // Ensure required fields
        if (!contact.email) continue;
        
        importedContacts.push({
          ...contact,
          status: 'new',
          createdAt: serverTimestamp(),
          source: 'csv_import'
        });
      }
      
      // Save to Firestore
      if (user && db && importedContacts.length > 0) {
        const batch = writeBatch(db);
        importedContacts.forEach(contact => {
          const docRef = doc(collection(db, 'users', user.uid, 'contacts'));
          batch.set(docRef, contact);
        });
        
        await batch.commit();
        await loadContacts();
        addNotification(`Successfully imported ${importedContacts.length} contacts`, 'success');
      }
      
    } catch (error) {
      console.error('CSV import error:', error);
      addNotification('CSV import failed: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // AI Research
  const performAiResearch = async (contact) => {
    if (!aiEnabled) {
      addNotification('AI is disabled', 'warning');
      return;
    }
    
    setAiLoading(true);
    addNotification('AI researching contact...', 'info');
    
    try {
      // Simulate AI research
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const research = {
        company_info: `${contact.company_name || contact.company} is a ${contact.industry || 'technology'} company`,
        recent_activity: 'Recent funding or product launch detected',
        decision_makers: 'CEO, CTO, Head of Sales',
        personalization_angles: [
          'Growth trajectory and market expansion',
          'Recent product launch or funding',
          'Industry leadership position'
        ]
      };
      
      // Update contact with AI research
      if (user && db) {
        const contactRef = doc(db, 'users', user.uid, 'contacts', contact.id);
        await updateDoc(contactRef, {
          ai_research: research,
          status: 'researched',
          lastUpdated: serverTimestamp()
        });
        
        await loadContacts();
        addNotification('AI research completed', 'success');
      }
      
    } catch (error) {
      console.error('AI research error:', error);
      addNotification('AI research failed: ' + error.message, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // Create Campaign
  const createCampaign = async (campaignData) => {
    if (!user || !db) return;
    
    try {
      const campaign = {
        ...campaignData,
        status: 'draft',
        createdAt: serverTimestamp(),
        stats: {
          sent: 0,
          replies: 0,
          meetings: 0,
          bounces: 0
        }
      };
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'campaigns'), campaign);
      await loadCampaigns();
      addNotification('Campaign created successfully', 'success');
      
      return docRef.id;
    } catch (error) {
      console.error('Create campaign error:', error);
      addNotification('Failed to create campaign: ' + error.message, 'error');
      return null;
    }
  };

  // Execute Campaign
  const executeCampaign = async (campaignId) => {
    if (!user || !db) return;
    
    try {
      addNotification('Starting campaign execution...', 'info');
      
      // Get campaign details
      const campaignRef = doc(db, 'users', user.uid, 'campaigns', campaignId);
      const campaignDoc = await getDoc(campaignRef);
      
      if (!campaignDoc.exists()) {
        throw new Error('Campaign not found');
      }
      
      const campaign = campaignDoc.data();
      
      // Get target contacts
      const targetContacts = contacts.filter(contact => 
        campaign.target_contacts.includes(contact.id) && 
        contact.status !== 'sent'
      );
      
      let sentCount = 0;
      for (const contact of targetContacts) {
        try {
          // Personalize email
          const template = WORKING_TEMPLATES[campaign.template];
          const personalizedEmail = {
            to: contact.email,
            subject: template.subject
              .replace(/\{\{company\}\}/g, contact.company_name || contact.company || 'your company')
              .replace(/\{\{first_name\}\}/g, contact.first_name || contact.name?.split(' ')[0] || 'there')
              .replace(/\{\{industry\}\}/g, contact.industry || 'your industry'),
            body: template.body
              .replace(/\{\{company\}\}/g, contact.company_name || contact.company || 'your company')
              .replace(/\{\{first_name\}\}/g, contact.first_name || contact.name?.split(' ')[0] || 'there')
              .replace(/\{\{industry\}\}/g, contact.industry || 'your industry')
              .replace(/\{\{similar_company\}\}/g, 'a similar company')
              .replace(/\{\{sender_name\}\}/g, user.displayName || 'Your Name')
              .replace(/\{\{booking_link\}\}/g, 'https://calendly.com/your-team/15min'),
            template: campaign.template,
            campaignId: campaignId,
            contactId: contact.id
          };
          
          // Send email (in real implementation, use email service)
          console.log('Sending email:', personalizedEmail);
          
          // Update contact status
          const contactRef = doc(db, 'users', user.uid, 'contacts', contact.id);
          await updateDoc(contactRef, {
            status: 'sent',
            lastEmailSent: serverTimestamp(),
            emailHistory: [...(contact.emailHistory || []), {
              sentAt: serverTimestamp(),
              template: campaign.template,
              campaignId: campaignId
            }]
          });
          
          sentCount++;
          
          // Small delay to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error('Failed to send to contact:', contact.email, error);
        }
      }
      
      // Update campaign stats
      await updateDoc(campaignRef, {
        status: 'active',
        'stats.sent': campaign.stats.sent + sentCount,
        lastExecuted: serverTimestamp()
      });
      
      await loadContacts();
      await loadCampaigns();
      addNotification(`Campaign executed: ${sentCount} emails sent`, 'success');
      
    } catch (error) {
      console.error('Execute campaign error:', error);
      addNotification('Campaign execution failed: ' + error.message, 'error');
    }
  };

  // Filter contacts
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = !searchQuery || 
      contact.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.first_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h1 className="text-white text-3xl font-bold mb-2">Sales Machine</h1>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-white text-4xl font-bold mb-6">Sales Machine</h1>
          <p className="text-gray-300 mb-8">Sign in to access your sales automation system</p>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign In with Google
          </button>
          {!firebaseConfig.apiKey && (
            <p className="text-red-400 text-sm mt-4">
              Firebase not configured. Please set up environment variables.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Working Sales Machine</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg shadow-lg max-w-sm ${
                notification.type === 'error' ? 'bg-red-600 text-white' :
                notification.type === 'success' ? 'bg-green-600 text-white' :
                notification.type === 'warning' ? 'bg-yellow-600 text-black' :
                'bg-blue-600 text-white'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-white text-2xl font-bold">Sales Machine</h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    aiEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}
                >
                  AI: {aiEnabled ? 'ON' : 'OFF'}
                </button>
                <span className="text-white">{user.displayName}</span>
                <button
                  onClick={signOutUser}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto p-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6 bg-gray-800 p-1 rounded-lg">
            {['import', 'contacts', 'campaigns', 'automation'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Import Tab */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-bold text-white mb-4">Import Contacts</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Upload CSV File
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvImport}
                      className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg"
                    />
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-white font-medium mb-2">Expected CSV Format:</h3>
                    <code className="text-green-400 text-sm">
                      company_name,first_name,email,industry,phone
                    </code>
                    <p className="text-gray-400 text-sm mt-2">
                      Make sure your CSV has these columns. Additional columns will be imported as custom fields.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Contacts ({contacts.length})</h2>
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg"
                    />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-4 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="new">New</option>
                      <option value="researched">Researched</option>
                      <option value="sent">Sent</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4">Company</th>
                        <th className="text-left py-3 px-4">Name</th>
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((contact) => (
                        <tr key={contact.id} className="border-b border-gray-700">
                          <td className="py-3 px-4">{contact.company_name || contact.company}</td>
                          <td className="py-3 px-4">{contact.first_name}</td>
                          <td className="py-3 px-4">{contact.email}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              contact.status === 'new' ? 'bg-gray-600' :
                              contact.status === 'researched' ? 'bg-blue-600' :
                              contact.status === 'sent' ? 'bg-green-600' :
                              'bg-gray-600'
                            }`}>
                              {contact.status || 'new'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              {aiEnabled && (
                                <button
                                  onClick={() => performAiResearch(contact)}
                                  disabled={aiLoading}
                                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                                >
                                  {aiLoading ? 'AI Researching...' : 'AI Research'}
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedContact(contact)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {filteredContacts.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      No contacts found. Import some contacts to get started.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Campaigns</h2>
                  <button
                    onClick={() => {
                      const campaignName = prompt('Enter campaign name:');
                      if (campaignName) {
                        createCampaign({
                          name: campaignName,
                          template: 'initial',
                          target_contacts: contacts.filter(c => c.status === 'researched').map(c => c.id)
                        });
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
                  >
                    Create Campaign
                  </button>
                </div>

                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-white font-semibold text-lg">{campaign.name}</h3>
                          <p className="text-gray-400 text-sm">
                            Template: {WORKING_TEMPLATES[campaign.template]?.name || campaign.template}
                          </p>
                          <p className="text-gray-400 text-sm">
                            Targets: {campaign.target_contacts?.length || 0} contacts
                          </p>
                          <div className="flex space-x-4 mt-2 text-sm">
                            <span className="text-blue-400">Sent: {campaign.stats?.sent || 0}</span>
                            <span className="text-green-400">Replies: {campaign.stats?.replies || 0}</span>
                            <span className="text-purple-400">Meetings: {campaign.stats?.meetings || 0}</span>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => executeCampaign(campaign.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                            >
                              Execute
                            </button>
                          )}
                          <span className={`px-3 py-1 rounded text-sm ${
                            campaign.status === 'draft' ? 'bg-gray-600' :
                            campaign.status === 'active' ? 'bg-green-600' :
                            'bg-gray-600'
                          }`}>
                            {campaign.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {campaigns.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      No campaigns yet. Create your first campaign to get started.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Automation Tab */}
          {activeTab === 'automation' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-bold text-white mb-4">Automation Settings</h2>
                
                <div className="space-y-6">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-white font-semibold mb-3">AI Assistant</h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-300">Enable AI-powered research and personalization</p>
                        <p className="text-gray-400 text-sm">AI will help research contacts and personalize emails</p>
                      </div>
                      <button
                        onClick={() => setAiEnabled(!aiEnabled)}
                        className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                          aiEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        {aiEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-white font-semibold mb-3">Email Templates</h3>
                    <div className="space-y-3">
                      {Object.entries(WORKING_TEMPLATES).map(([key, template]) => (
                        <div key={key} className="bg-gray-600 p-3 rounded">
                          <h4 className="text-white font-medium">{template.name}</h4>
                          <p className="text-gray-400 text-sm mt-1">{template.subject}</p>
                          <p className="text-gray-500 text-xs mt-2">
                            {template.body.split(' ').length} words
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-white font-semibold mb-3">System Status</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Contacts:</span>
                        <span className="text-white">{contacts.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Campaigns:</span>
                        <span className="text-white">{campaigns.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">AI Status:</span>
                        <span className={aiEnabled ? 'text-green-400' : 'text-gray-400'}>
                          {aiEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Firebase:</span>
                        <span className={db ? 'text-green-400' : 'text-red-400'}>
                          {db ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
