'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';

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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// Simple working templates
const TEMPLATES = {
  initial: {
    subject: 'Quick question for {{company_name}}',
    body: `Hi {{first_name}},

I hope you're doing well. My name is Dulran Samarasinghe, and I run Syndicate Solutions - a technical partner for scaling SaaS companies.

I've been following {{company_name}}'s growth in the {{industry}} space and am impressed by your recent {{recent_achievement}}.

We help companies like yours with:
• Faster feature deployment cycles
• Technical debt reduction
• Development team productivity improvements
• Infrastructure cost optimization

Given your recent {{funding_round}}, I believe we could significantly accelerate your product roadmap.

Would you be open to a 20-minute technical consultation next week?

Best regards,
Dulran Samarasinghe
Founder & CEO
Syndicate Solutions
📱 +94 741 143 323
🌐 syndicatesolutions.vercel.app
📅 calendly.com/syndicate-solutions/technical-consultation`
  },
  followup1: {
    subject: 'Following up - {{company_name}}',
    body: `Hi {{first_name}},

Just circling back on my previous note about {{company_name}}'s growth.

I wanted to share a quick case study: we helped a similar {{industry}} company achieve 40% faster feature deployment and 60% reduction in technical debt.

Would you be interested in learning how we could replicate these results for your team?

Happy to connect you with their CTO for a reference call.

Best,
Dulran`
  },
  followup2: {
    subject: 'Final note - {{company_name}}',
    body: `Hi {{first_name}},

I'll keep this brief - if outsourcing technical development becomes a priority, we're here to help.

Many of our clients started with a small project and now work with us monthly.

Either way, wishing you continued success with {{company_name}}!

Best,
Dulran`
  }
};

// Contact statuses
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New', color: 'gray' },
  { id: 'contacted', label: '📞 Contacted', color: 'blue' },
  { id: 'replied', label: '✅ Replied', color: 'green' },
  { id: 'meeting', label: '📅 Meeting', color: 'purple' },
  { id: 'proposal', label: '📄 Proposal', color: 'orange' },
  { id: 'closed_won', label: '💰 Won', color: 'emerald' },
  { id: 'closed_lost', label: '❌ Lost', color: 'red' }
];

// ICP definition
const ICP = {
  industries: ['SaaS', 'FinTech', 'HealthTech', 'EdTech'],
  company_size: { min: 20, max: 500 },
  funding: ['Series A', 'Series B', 'Series C'],
  geography: ['North America', 'Europe']
};

export default function WorkingSalesAutomation() {
  // State management
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [csvProcessing, setCsvProcessing] = useState(false);

  // Notification system
  const addNotification = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Authentication
  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
      addNotification('error', 'Failed to sign in');
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Load contacts from Firestore
  const loadContacts = useCallback(async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, orderBy('createdAt', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const loadedContacts = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        loadedContacts.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date()
        });
      });
      
      setContacts(loadedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      addNotification('error', 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, addNotification]);

  // CSV processing
  const handleCSVUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setCsvProcessing(true);
    addNotification('info', 'Processing CSV file...');
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV must contain headers and data');
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const contacts = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length !== headers.length) continue;
        
        const contact = {};
        headers.forEach((header, index) => {
          contact[header] = values[index] || '';
        });
        
        // Basic validation
        if (contact.email && contact.company_name) {
          contacts.push({
            ...contact,
            status: 'new',
            leadScore: calculateLeadScore(contact),
            createdAt: new Date(),
            source: 'csv_upload'
          });
        }
      }
      
      // Save to Firestore
      if (user?.uid && contacts.length > 0) {
        for (const contact of contacts) {
          try {
            const docRef = doc(collection(db, 'users', user.uid, 'contacts'));
            await setDoc(docRef, {
              ...contact,
              createdAt: serverTimestamp()
            });
          } catch (error) {
            console.error('Failed to save contact:', contact.company_name, error);
          }
        }
      }
      
      addNotification('success', `Successfully imported ${contacts.length} contacts`);
      await loadContacts();
      
    } catch (error) {
      console.error('CSV processing error:', error);
      addNotification('error', 'CSV processing failed: ' + error.message);
    } finally {
      setCsvProcessing(false);
    }
  };

  // Simple lead scoring
  const calculateLeadScore = (contact) => {
    let score = 50; // Base score
    
    // Industry match
    if (ICP.industries.includes(contact.industry)) {
      score += 20;
    }
    
    // Company size
    const employees = parseInt(contact.employees) || 0;
    if (employees >= ICP.company_size.min && employees <= ICP.company_size.max) {
      score += 15;
    }
    
    // Funding stage
    if (ICP.funding.includes(contact.funding_stage)) {
      score += 15;
    }
    
    // Tech stack
    const techStack = (contact.tech_stack || '').toLowerCase();
    if (techStack.includes('react') || techStack.includes('node') || techStack.includes('python')) {
      score += 10;
    }
    
    return Math.min(100, score);
  };

  // Update contact status
  const updateContactStatus = async (contactId, newStatus) => {
    if (!user?.uid) return;
    
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef);
      const snapshot = await getDocs(q);
      
      snapshot.forEach(doc => {
        if (doc.id === contactId) {
          updateDoc(doc.ref, {
            status: newStatus,
            updatedAt: serverTimestamp()
          });
        }
      });
      
      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contactId ? { ...c, status: newStatus } : c
      ));
      
      addNotification('success', `Status updated to ${newStatus}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      addNotification('error', 'Failed to update status');
    }
  };

  // Filter contacts
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = !searchQuery || 
      contact.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Authentication state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
      if (user) {
        loadContacts();
      }
    });

    return () => unsubscribe();
  }, [loadContacts]);

  // Loading state
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading Syndicate Solutions...</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-white text-4xl font-bold mb-4">Syndicate Solutions</h1>
          <p className="text-gray-300 mb-8">
            Sales Automation for B2B SaaS Companies
          </p>
          
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-white text-lg font-semibold mb-4">🎯 Target Profile</h3>
            <div className="text-left text-gray-300 space-y-2 text-sm">
              <p><strong>Industries:</strong> {ICP.industries.join(', ')}</p>
              <p><strong>Size:</strong> {ICP.company_size.min}-{ICP.company_size.max} employees</p>
              <p><strong>Funding:</strong> {ICP.funding.join(', ')}</p>
              <p><strong>Geography:</strong> {ICP.geography.join(', ')}</p>
            </div>
          </div>
          
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors w-full"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Syndicate Solutions - Sales Automation</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg shadow-lg max-w-sm ${
                notification.type === 'error' ? 'bg-red-900 text-red-200' :
                notification.type === 'success' ? 'bg-green-900 text-green-200' :
                'bg-blue-900 text-blue-200'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-white text-2xl font-bold">Syndicate Solutions</h1>
                <p className="text-gray-400 text-sm">B2B Sales Automation</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-white text-sm">{user.displayName}</p>
                  <p className="text-gray-400 text-xs">{user.email}</p>
                </div>
                <button
                  onClick={signOutUser}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-6">
          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Total Leads</h3>
              <p className="text-white text-3xl font-bold">{contacts.length}</p>
              <p className="text-gray-500 text-xs mt-1">In database</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">New Leads</h3>
              <p className="text-blue-400 text-3xl font-bold">
                {contacts.filter(c => c.status === 'new').length}
              </p>
              <p className="text-gray-500 text-xs mt-1">Not contacted</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Replied</h3>
              <p className="text-green-400 text-3xl font-bold">
                {contacts.filter(c => c.status === 'replied').length}
              </p>
              <p className="text-gray-500 text-xs mt-1">Engaged</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Meetings</h3>
              <p className="text-purple-400 text-3xl font-bold">
                {contacts.filter(c => c.status === 'meeting').length}
              </p>
              <p className="text-gray-500 text-xs mt-1">Booked calls</p>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* CSV Upload */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">📤 Import Leads</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Upload CSV with leads (company_name, email, first_name, industry, employees, funding_stage, tech_stack)
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    disabled={csvProcessing}
                    className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  />
                </div>
                
                {csvProcessing && (
                  <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                      <span className="text-blue-300 text-sm">Processing CSV...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Templates */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">📧 Email Templates</h2>
              <div className="space-y-3">
                <div className="bg-gray-700 rounded-lg p-3">
                  <h4 className="text-white font-medium text-sm mb-1">Initial Outreach</h4>
                  <p className="text-gray-400 text-xs">{TEMPLATES.initial.subject}</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <h4 className="text-white font-medium text-sm mb-1">Follow-up 1</h4>
                  <p className="text-gray-400 text-xs">{TEMPLATES.followup1.subject}</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <h4 className="text-white font-medium text-sm mb-1">Follow-up 2</h4>
                  <p className="text-gray-400 text-xs">{TEMPLATES.followup2.subject}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contacts Table */}
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h2 className="text-white text-lg font-semibold">📋 Contact Database</h2>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  />
                  
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  >
                    <option value="all">All Statuses</option>
                    {CONTACT_STATUSES.map(status => (
                      <option key={status.id} value={status.id}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredContacts.slice(0, 20).map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{contact.company_name}</div>
                        <div className="text-gray-400 text-sm">{contact.industry}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white text-sm">{contact.first_name}</div>
                        <div className="text-gray-400 text-sm">{contact.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{contact.leadScore || 0}</div>
                        <div className="text-gray-400 text-xs">points</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={contact.status || 'new'}
                          onChange={(e) => updateContactStatus(contact.id, e.target.value)}
                          className="px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                        >
                          {CONTACT_STATUSES.map(status => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-blue-400 hover:text-blue-300"
                              title="Send Email"
                            >
                              ✉️
                            </a>
                          )}
                          {contact.company_name && (
                            <button
                              className="text-green-400 hover:text-green-300"
                              title="View Details"
                              onClick={() => addNotification('info', `Details for ${contact.company_name}`)}
                            >
                              👁️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredContacts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No contacts found. Upload a CSV to get started.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
