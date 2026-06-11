'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

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

// ✅ YOUR ACTUAL INITIAL PITCH
const DEFAULT_TEMPLATE_A = {
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}}, 😊👋🏻
I hope you're doing well.
My name is Dulran Samarasinghe. I run Syndicate Solutions, a Sri Lanka–based mini agency supporting
small to mid-sized agencies and businesses with reliable execution across web, software,
AI automation, and ongoing digital operations.
We typically work as a white-label or outsourced partner when teams need:
• extra delivery capacity
• fast turnarounds without hiring
• ongoing technical and digital support
I'm reaching out to ask – do you ever use external support when workload or deadlines increase?
If helpful, I'm open to starting with a small task or short contract to build trust before
discussing anything larger.
You can review my work here:
Portfolio: https://syndicatesolutions.vercel.app/
LinkedIn: https://www.linkedin.com/in/dulran-samarasinghe-13941b175/
If it makes sense, you can book a short 15-minute call:
https://cal.com/syndicate-solutions/15min
You can contact me on Whatsapp - 0741143323
You can email me at - syndicatesoftwaresolutions@gmail.com
Otherwise, happy to continue the conversation over email.
Best regards,
Dulran Samarasinghe
Founder – Syndicate Solutions`
};

// ✅ FOLLOW-UP TEMPLATES
const FOLLOW_UP_1 = {
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}},
Just circling back—did my note about outsourced dev & ops support land at a bad time?
No pressure at all, but if you're ever swamped with web, automation, or backend work and need a reliable extra hand (especially for white-label or fast-turnaround needs), we're ready to help.
Even a 1-hour task is a great way to test the waters.
Either way, wishing you a productive week!
Best,
Dulran
Founder – Syndicate Solutions
WhatsApp: 0741143323`
};

const FOLLOW_UP_2 = {
  subject: '{{business_name}}, a quick offer (no strings)',
  body: `Hi again,
I noticed you haven't had a chance to reply—totally understand!
To make this zero-risk: **I'll audit one of your digital workflows (e.g., lead capture, client onboarding, internal tooling) for free** and send 2–3 actionable automation ideas you can implement immediately—even if you never work with us.
Zero sales pitch. Just value.
Interested? Hit "Yes" or reply with a workflow you'd like optimized.
Cheers,
Dulran
Portfolio: https://syndicatesolutions.vercel.app/
Book a call: https://cal.com/syndicate-solutions/15min`
};

const FOLLOW_UP_3 = {
  subject: 'Closing the loop',
  body: `Hi {{business_name}},
I'll stop emailing after this one! 😅
Just wanted to say: if outsourcing ever becomes a priority—whether for web dev, AI tools, or ongoing ops—we're here. Many of our clients started with a tiny $100 task and now work with us monthly.
If now's not the time, no worries! I'll circle back in a few months.
Either way, keep crushing it!
— Dulran
WhatsApp: 0741143323`
};

const DEFAULT_TEMPLATE_B = FOLLOW_UP_1;
const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{business_name}} 👋😊
Hope you're doing well.
I'm {{sender_name}} from Sri Lanka – I run a small digital mini-agency supporting businesses with websites, content, and AI automation.
Quick question:
Are you currently working on anything digital that's taking too much time or not delivering the results you want?
If yes, I'd be happy to share a quick idea – no pressure at all.`;

const DEFAULT_SMS_TEMPLATE = `Hi {{business_name}} 👋
This is {{sender_name}} from Syndicate Solutions.
Quick question – are you currently working on any digital work that's delayed or not giving results?
Reply YES or NO.`;

// ✅ CONTACT STATUS DEFINITIONS (Business-Driven Workflow)
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New Lead', color: 'gray', description: 'Never contacted' },
  { id: 'contacted', label: '📞 Contacted', color: 'blue', description: 'Initial outreach sent' },
  { id: 'engaged', label: '💬 Engaged', color: 'indigo', description: 'Opened/clicked but no reply' },
  { id: 'replied', label: '✅ Replied', color: 'green', description: 'Responded to outreach' },
  { id: 'demo_scheduled', label: '📅 Demo Scheduled', color: 'purple', description: 'Meeting booked' },
  { id: 'proposal_sent', label: '📄 Proposal Sent', color: 'orange', description: 'Quote delivered' },
  { id: 'negotiation', label: '🤝 Negotiation', color: 'yellow', description: 'Discussing terms' },
  { id: 'closed_won', label: '💰 Closed Won', color: 'emerald', description: 'Deal secured!' },
  { id: 'not_interested', label: '❌ Not Interested', color: 'red', description: 'Declined service' },
  { id: 'do_not_contact', label: '🚫 Do Not Contact', color: 'rose', description: 'Requested no contact' },
  { id: 'unresponsive', label: '⏳ Unresponsive', color: 'orange', description: 'No response after 3 attempts' },
  { id: 'archived', label: '🗄️ Archived', color: 'gray', description: 'Inactive >30 days' }
];

// ✅ STATUS TRANSITION RULES (Prevent invalid state changes)
const STATUS_TRANSITIONS = {
  'new': ['contacted', 'do_not_contact'],
  'contacted': ['engaged', 'replied', 'unresponsive', 'not_interested'],
  'engaged': ['replied', 'unresponsive', 'not_interested'],
  'replied': ['demo_scheduled', 'proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'demo_scheduled': ['proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'proposal_sent': ['negotiation', 'closed_won', 'not_interested'],
  'negotiation': ['closed_won', 'not_interested'],
  'closed_won': [],
  'not_interested': ['archived'],
  'do_not_contact': ['archived'],
  'unresponsive': ['archived', 're_engage'],
  'archived': ['re_engage']
};

// ✅ ICP DEFINITION - TIGHT FOCUS
const ICP_DEFINITION = {
  industry: 'SaaS companies',
  size: '20-200 employees (Series A-C funding, $2M-$50M raised)',
  geography: 'North America & Europe primarily',
  pain: 'Scaling customer acquisition without burning cash',
  trigger: 'Recent funding round, product launch, or hiring growth'
};

// ✅ LEAD SOURCES FOR DISCOVERY
const LEAD_SOURCES = {
  linkedin_sales_navigator: {
    name: 'LinkedIn Sales Navigator',
    description: 'B2B professionals with company insights',
    filters: ['Industry', 'Company Size', 'Geography', 'Recent Activity']
  },
  crunchbase: {
    name: 'Crunchbase',
    description: 'Funded companies and recent rounds',
    filters: ['Funding Stage', 'Industry', 'Location', 'Last Funding']
  },
  product_hunt: {
    name: 'Product Hunt',
    description: 'Recently launched products',
    filters: ['Launch Date', 'Category', 'Upvotes', 'Team Size']
  },
  tech_crunch: {
    name: 'TechCrunch',
    description: 'Tech news and funding announcements',
    filters: ['News Category', 'Company Stage', 'Funding Amount']
  },
  angel_list: {
    name: 'AngelList',
    description: 'Startups and investors',
    filters: ['Market', 'Company Size', 'Funding', 'Location']
  }
};

// --- UTILITY FUNCTIONS ---
function formatForDialing(raw) {
  if (!raw || raw === 'N/A') return null;
  let cleaned = raw.toString().replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }
  return /^[1-9]\d{9,14}$/.test(cleaned) ? cleaned : null;
}

const extractTemplateVariables = (text) => {
  if (!text) return [];
  const matches = text.match(/\{\{\s*([^}]+?)\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, '').trim()))];
};

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  let cleaned = email.trim()
    .toLowerCase()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .replace(/\s+/g, '')
    .replace(/[<>]/g, '');
  if (cleaned.length < 5) return false;
  if (cleaned === 'undefined' || cleaned === 'null' || cleaned === 'na' || cleaned === 'n/a') return false;
  if (cleaned.startsWith('[') || cleaned.includes('missing')) return false;
  const atCount = (cleaned.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  const parts = cleaned.split('@');
  const [localPart, domainPart] = parts;
  if (!localPart || localPart.length < 1) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (!domainPart || domainPart.length < 3) return false;
  if (!domainPart.includes('.')) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;
  const domainBits = domainPart.split('.');
  const tld = domainBits[domainBits.length - 1];
  if (!tld || tld.length < 2 || tld.length > 6) return false;
  if (!/^[a-z0-9-]+$/.test(tld)) return false;
  if (tld.startsWith('-') || tld.endsWith('-')) return false;
  return true;
};

const parseCsvRow = (str) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inQuotes) inQuotes = true;
    else if (char === '"' && inQuotes) {
      if (i + 1 < str.length && str[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else current += char;
  }
  result.push(current);
  return result.map(field => {
    let cleaned = field.replace(/[\r\n]/g, '').trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/""/g, '"');
    }
    return cleaned;
  });
};

const renderPreviewText = (text, recipient, mappings, sender) => {
  if (!text) return '';
  let result = text;
  Object.entries(mappings).forEach(([varName, col]) => {
    const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
    if (varName === 'sender_name') {
      result = result.replace(regex, sender || 'Team');
    } else if (recipient && col && recipient[col] !== undefined) {
      result = result.replace(regex, String(recipient[col]));
    } else {
      result = result.replace(regex, `[MISSING: ${varName}]`);
    }
  });
  return result;
};

// ✅ SMART CSV PROCESSOR
class SmartCSVProcessor {
  constructor() {
    this.processingHistory = [];
  }

  async processCSV(file, userId, senderName) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const rawContent = e.target.result;
          const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');
          
          if (lines.length < 2) {
            throw new Error('CSV must have headers and data rows.');
          }
          
          const headers = parseCsvRow(lines[0]).map(h => h.trim());
          const contacts = [];
          const analysis = {
            totalRows: lines.length - 1,
            validEmails: 0,
            validPhones: 0,
            duplicates: 0,
            quality: { hot: 0, warm: 0, cold: 0 }
          };
          
          const seenEmails = new Set();
          const seenPhones = new Set();
          
          for (let i = 1; i < lines.length; i++) {
            const values = parseCsvRow(lines[i]);
            if (values.length !== headers.length) continue;
            
            const row = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            
            // Validate email
            const email = row.email?.trim();
            const phone = formatForDialing(row.phone || row.whatsapp_number);
            
            let isValidContact = false;
            if (email && isValidEmail(email) && !seenEmails.has(email)) {
              isValidContact = true;
              seenEmails.add(email);
              analysis.validEmails++;
            }
            
            if (phone && !seenPhones.has(phone)) {
              isValidContact = true;
              seenPhones.add(phone);
              analysis.validPhones++;
            }
            
            if (email && seenEmails.has(email)) {
              analysis.duplicates++;
              continue;
            }
            
            if (phone && seenPhones.has(phone)) {
              analysis.duplicates++;
              continue;
            }
            
            if (isValidContact) {
              // Determine lead quality
              let quality = 'cold';
              const qualityScore = parseInt(row.lead_quality_score) || 0;
              const rating = parseFloat(row.rating) || 0;
              const reviewCount = parseInt(row.review_count) || 0;
              
              if (qualityScore >= 70 || rating >= 4.8) {
                quality = 'hot';
                analysis.quality.hot++;
              } else if (qualityScore >= 50 || rating >= 4.5) {
                quality = 'warm';
                analysis.quality.warm++;
              } else {
                analysis.quality.cold++;
              }
              
              contacts.push({
                ...row,
                phone: phone || row.phone,
                email: email || null,
                quality,
                leadScore: Math.min(100, Math.max(0, qualityScore + (rating > 4.5 ? 20 : 0) + (reviewCount > 100 ? 10 : 0))),
                contactId: email?.toLowerCase().trim() || `phone_${phone}`,
                status: 'new',
                source: 'csv_upload',
                importedAt: new Date(),
                senderName
              });
            }
          }
          
          // Save to Firestore
          if (userId && contacts.length > 0) {
            await this.saveContactsToFirestore(contacts, userId);
          }
          
          resolve({
            contacts,
            analysis,
            headers,
            preview: contacts.slice(0, 3)
          });
          
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  }

  async saveContactsToFirestore(contacts, userId) {
    const contactsRef = collection(db, 'users', userId, 'contacts');
    const batch = writeBatch(db);
    
    contacts.forEach(contact => {
      const docRef = doc(contactsRef);
      batch.set(docRef, {
        ...contact,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        statusHistory: [{
          status: 'new',
          timestamp: serverTimestamp(),
          note: 'Imported via CSV upload'
        }]
      });
    });
    
    await batch.commit();
  }
}

// ✅ SMART LEAD DISCOVERY
class SmartLeadDiscovery {
  constructor() {
    this.discoverySources = Object.keys(LEAD_SOURCES);
    this.discoveryHistory = [];
  }

  async discoverLeads(source, filters, userId) {
    // Simulate lead discovery (in real implementation, this would call actual APIs)
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockLeads = this.generateMockLeads(source, filters);
        resolve({
          source,
          leads: mockLeads,
          timestamp: new Date(),
          filters
        });
      }, 2000);
    });
  }

  generateMockLeads(source, filters) {
    const count = Math.floor(Math.random() * 20) + 10;
    const leads = [];
    
    for (let i = 0; i < count; i++) {
      const lead = {
        id: `${source}_${Date.now()}_${i}`,
        business: `Company ${i + 1}`,
        email: `contact${i + 1}@company${i + 1}.com`,
        phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        website: `https://company${i + 1}.com`,
        industry: 'SaaS',
        size: '50-100 employees',
        funding: 'Series A',
        location: 'San Francisco, CA',
        description: `Leading SaaS company in the ${filters.industry || 'technology'} space`,
        source,
        discoveredAt: new Date(),
        quality: Math.random() > 0.7 ? 'hot' : Math.random() > 0.4 ? 'warm' : 'cold',
        leadScore: Math.floor(Math.random() * 40) + 60
      };
      leads.push(lead);
    }
    
    return leads;
  }
}

export default function ComprehensiveSalesAutomation() {
  // Authentication state
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // Initialize smart processors
  const csvProcessor = useRef(new SmartCSVProcessor());
  const leadDiscovery = useRef(new SmartLeadDiscovery());

  // Core campaign state
  const [campaign, setCampaign] = useState({
    status: 'idle',
    in_sequence_leads: [],
    nurture_queue: [],
    outreach_queue: [],
    completed_leads: [],
    daily_stats: {
      emails_sent: 0,
      replies: 0,
      meetings_booked: 0,
      unsubscribes: 0
    }
  });

  // Sales workflow and general states
  const [salesPipeline, setSalesPipeline] = useState({
    discovery: { leads: [], active: false },
    qualification: { leads: [], active: false },
    outreach: { leads: [], active: false },
    followup: { leads: [], active: false },
    conversion: { leads: [], active: false }
  });
  
  const [manualMode, setManualMode] = useState(false);
  const [kpis, setKpis] = useState({
    leads_discovered: 0,
    leads_qualified: 0,
    emails_sent: 0,
    replies: 0,
    meetings_booked: 0,
    reply_rate: 0,
    meeting_rate: 0,
    bounce_rate: 0,
    unsubscribe_rate: 0
  });
  
  const [contacts, setContacts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [manualEmailComposer, setManualEmailComposer] = useState(null);
  const [csvProcessing, setCsvProcessing] = useState({ processing: false, progress: 0, analysis: null, preview: null, errors: [] });
  const [discoveryStatus, setDiscoveryStatus] = useState({ discovering: false, sources: Object.keys(LEAD_SOURCES), results: [], lastDiscovery: null });
  const [systemHealth, setSystemHealth] = useState({ status: 'healthy', last_check: null, failures: [], token_valid: true, firestore_connected: true });
  
  // Template and messaging state
  const [senderName, setSenderName] = useState('Dulran Samarasinghe');
  const [templateA, setTemplateA] = useState(DEFAULT_TEMPLATE_A);
  const [templateB, setTemplateB] = useState(DEFAULT_TEMPLATE_B);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);
  const [fieldMappings, setFieldMappings] = useState({});
  const [previewRecipient, setPreviewRecipient] = useState(null);
  
  // Contact status management
  const [contactStatuses, setContactStatuses] = useState({});
  const [statusHistory, setStatusHistory] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedContactForStatus, setSelectedContactForStatus] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  
  // Follow-up system
  const [followUpTemplates, setFollowUpTemplates] = useState([
    {
      id: 'followup_1',
      name: 'Follow-Up 1 (Day 3)',
      channel: 'email',
      enabled: true,
      delayDays: 3,
      subject: FOLLOW_UP_1.subject,
      body: FOLLOW_UP_1.body
    },
    {
      id: 'followup_2',
      name: 'Follow-Up 2 (Day 5)',
      channel: 'email',
      enabled: true,
      delayDays: 5,
      subject: FOLLOW_UP_2.subject,
      body: FOLLOW_UP_2.body
    },
    {
      id: 'followup_3',
      name: 'Break-up Email (Day 7)',
      channel: 'email',
      enabled: true,
      delayDays: 7,
      subject: FOLLOW_UP_3.subject,
      body: FOLLOW_UP_3.body
    }
  ]);
  
  const [followUpHistory, setFollowUpHistory] = useState({});
  const [followUpStats, setFollowUpStats] = useState({
    totalSent: 0,
    totalReplied: 0,
    readyForFollowUp: 0,
    alreadyFollowedUp: 0,
    awaitingReply: 0,
    interestedLeads: 0
  });
  
  // Multi-channel outreach
  const [multiChannelContacts, setMultiChannelContacts] = useState([]);
  const [showMultiChannelModal, setShowMultiChannelModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  
  // Analytics and reporting
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState({
    funnel: [],
    performance: {},
    trends: []
  });
  
  // Notification management
  const addNotification = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Authentication handlers
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
    
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, orderBy('lastUpdated', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedContacts = [];
      const statuses = {};
      const history = {};
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const contact = {
          id: doc.id,
          ...data,
          lastUpdated: data.lastUpdated?.toDate?.() || data.lastUpdated || new Date(),
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date()
        };
        
        loadedContacts.push(contact);
        statuses[contact.contactId] = contact.status || 'new';
        history[contact.contactId] = contact.statusHistory || [];
      });
      
      setContacts(loadedContacts);
      setContactStatuses(statuses);
      setStatusHistory(history);
      setMultiChannelContacts(loadedContacts);
      
      // Update KPIs
      setKpis(prev => ({
        ...prev,
        leads_discovered: loadedContacts.length,
        leads_qualified: loadedContacts.filter(c => c.quality === 'hot').length
      }));
      
    } catch (error) {
      console.error('Failed to load contacts:', error);
      addNotification('error', 'Failed to load contacts');
    }
  }, [user?.uid, addNotification]);

  // Handle CSV upload
  const handleCsvUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCsvProcessing(prev => ({ ...prev, processing: true, progress: 0, errors: [] }));
    
    try {
      addNotification('info', 'Processing CSV file...');
      
      const result = await csvProcessor.current.processCSV(file, user?.uid, senderName);
      
      setCsvProcessing({
        processing: false,
        progress: 100,
        analysis: result.analysis,
        preview: result.preview,
        errors: []
      });
      
      addNotification('success', `Successfully processed ${result.contacts.length} contacts`);
      
      // Reload contacts
      await loadContacts();
      
    } catch (error) {
      console.error('CSV processing error:', error);
      setCsvProcessing(prev => ({
        ...prev,
        processing: false,
        errors: [error.message]
      }));
      addNotification('error', `CSV processing failed: ${error.message}`);
    }
  }, [user?.uid, senderName, addNotification, loadContacts]);

  // Handle lead discovery
  const handleLeadDiscovery = useCallback(async (source, filters) => {
    setDiscoveryStatus(prev => ({ ...prev, discovering: true }));
    
    try {
      addNotification('info', `Discovering leads from ${LEAD_SOURCES[source].name}...`);
      
      const result = await leadDiscovery.current.discoverLeads(source, filters, user?.uid);
      
      // Save discovered leads
      if (result.leads.length > 0) {
        const contactsRef = collection(db, 'users', user.uid, 'contacts');
        const batch = writeBatch(db);
        
        result.leads.forEach(lead => {
          const docRef = doc(contactsRef);
          batch.set(docRef, {
            ...lead,
            status: 'new',
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            statusHistory: [{
              status: 'new',
              timestamp: serverTimestamp(),
              note: `Discovered via ${LEAD_SOURCES[source].name}`
            }]
          });
        });
        
        await batch.commit();
        
        setDiscoveryStatus(prev => ({
          ...prev,
          discovering: false,
          results: [...prev.results, result],
          lastDiscovery: result
        }));
        
        addNotification('success', `Discovered ${result.leads.length} new leads`);
        
        // Reload contacts
        await loadContacts();
      }
      
    } catch (error) {
      console.error('Lead discovery error:', error);
      addNotification('error', `Lead discovery failed: ${error.message}`);
      setDiscoveryStatus(prev => ({ ...prev, discovering: false }));
    }
  }, [user?.uid, addNotification, loadContacts]);

  // Update contact status
  const updateContactStatus = useCallback(async (contactId, newStatus, note = '') => {
    if (!user?.uid || !contactId || !newStatus) return false;
    
    try {
      // Find contact document
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, where('contactId', '==', contactId));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        console.error('Contact not found:', contactId);
        return false;
      }
      
      const contactDoc = snapshot.docs[0];
      const contactData = contactDoc.data();
      
      // Validate transition
      const currentStatus = contactData.status || 'new';
      if (currentStatus !== newStatus && 
          !STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) &&
          currentStatus !== 'archived') {
        console.warn(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
        return false;
      }
      
      // Update status
      const historyEntry = {
        status: newStatus,
        timestamp: serverTimestamp(),
        note: note || `Status changed from ${currentStatus} to ${newStatus}`,
        userId: user.uid
      };
      
      await updateDoc(contactDoc.ref, {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        statusHistory: [...(contactData.statusHistory || []), historyEntry]
      });
      
      // Update local state
      setContactStatuses(prev => ({ ...prev, [contactId]: newStatus }));
      setStatusHistory(prev => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), historyEntry]
      }));
      
      // Update contacts array
      setContacts(prev => prev.map(c => 
        c.contactId === contactId 
          ? { ...c, status: newStatus, lastUpdated: new Date() }
          : c
      ));
      
      setMultiChannelContacts(prev => prev.map(c => 
        c.contactId === contactId 
          ? { ...c, status: newStatus, lastUpdated: new Date() }
          : c
      ));
      
      addNotification('success', `Status updated to ${newStatus}`);
      return true;
      
    } catch (error) {
      console.error('Failed to update status:', error);
      addNotification('error', 'Failed to update contact status');
      return false;
    }
  }, [user?.uid, addNotification]);

  // Filter contacts for display
  const getFilteredContacts = useCallback(() => {
    let filtered = [...contacts];
    
    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.business?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery.replace(/\D/g, ''))
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    // Apply contact filter
    if (contactFilter === 'replied') {
      filtered = filtered.filter(c => c.status === 'replied');
    } else if (contactFilter === 'pending') {
      filtered = filtered.filter(c => !['replied', 'closed_won', 'not_interested', 'do_not_contact'].includes(c.status));
    } else if (contactFilter === 'high-quality') {
      filtered = filtered.filter(c => c.leadScore >= 70);
    }
    
    // Apply sorting
    if (sortBy === 'score') {
      filtered.sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => (a.business || '').localeCompare(b.business || ''));
    }
    
    return filtered;
  }, [contacts, searchQuery, statusFilter, contactFilter, sortBy]);

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
          <p className="text-white text-xl">Loading Sales Automation System...</p>
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
            Strategic Sales Automation for B2B SaaS Companies
          </p>
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-white text-lg font-semibold mb-4">ICP Focus</h3>
            <div className="text-left text-gray-300 space-y-2 text-sm">
              <p><strong>Industry:</strong> SaaS companies</p>
              <p><strong>Size:</strong> 20-200 employees (Series A-C)</p>
              <p><strong>Geography:</strong> North America & Europe</p>
              <p><strong>Pain:</strong> Scaling customer acquisition efficiently</p>
              <p><strong>Trigger:</strong> Recent funding or growth</p>
            </div>
          </div>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
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
                <p className="text-gray-400 text-sm">Strategic Sales Automation Dashboard</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Total Leads</h3>
              <p className="text-white text-3xl font-bold">{kpis.leads_discovered}</p>
              <p className="text-gray-500 text-xs mt-1">In database</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Qualified Leads</h3>
              <p className="text-green-400 text-3xl font-bold">{kpis.leads_qualified}</p>
              <p className="text-gray-500 text-xs mt-1">High quality</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Emails Sent</h3>
              <p className="text-blue-400 text-3xl font-bold">{kpis.emails_sent}</p>
              <p className="text-gray-500 text-xs mt-1">Campaign emails</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm font-medium mb-2">Reply Rate</h3>
              <p className="text-yellow-400 text-3xl font-bold">{kpis.reply_rate}%</p>
              <p className="text-gray-500 text-xs mt-1">Response rate</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* CSV Upload */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">📤 Import CSV</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Upload lead list (CSV format)
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    disabled={csvProcessing.processing}
                    className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  />
                </div>
                
                {csvProcessing.processing && (
                  <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                      <span className="text-blue-300 text-sm">Processing CSV...</span>
                    </div>
                  </div>
                )}
                
                {csvProcessing.analysis && (
                  <div className="bg-green-900/30 border border-green-800 rounded-lg p-3">
                    <p className="text-green-300 text-sm font-medium">✅ Import Complete</p>
                    <div className="text-green-200 text-xs mt-1 space-y-1">
                      <p>Valid emails: {csvProcessing.analysis.validEmails}</p>
                      <p>Valid phones: {csvProcessing.analysis.validPhones}</p>
                      <p>Quality: {csvProcessing.analysis.quality.hot} hot, {csvProcessing.analysis.quality.warm} warm</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lead Discovery */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">🔍 Discover Leads</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(LEAD_SOURCES).map(([key, source]) => (
                    <button
                      key={key}
                      onClick={() => handleLeadDiscovery(key, { industry: 'SaaS', size: '20-200' })}
                      disabled={discoveryStatus.discovering}
                      className="p-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 rounded-lg text-left transition-colors"
                    >
                      <div className="text-white font-medium text-sm">{source.name}</div>
                      <div className="text-gray-400 text-xs">{source.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Campaign Controls */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">🚀 Campaign</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">Manual Mode</span>
                  <button
                    onClick={() => setManualMode(!manualMode)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      manualMode ? 'bg-blue-600' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      manualMode ? 'translate-x-6' : 'translate-x-0.5'
                    }`}></div>
                  </button>
                </div>
                
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Start Outreach Campaign
                </button>
                
                <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Send Follow-ups
                </button>
                
                <button
                  onClick={() => setShowMultiChannelModal(true)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Multi-Channel Manager
                </button>
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
                  
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  >
                    <option value="score">Score ↓</option>
                    <option value="recent">Recent</option>
                    <option value="name">A-Z</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Business</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {getFilteredContacts().slice(0, 10).map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{contact.business}</div>
                        <div className="text-gray-400 text-sm">{contact.industry}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white text-sm">{contact.email}</div>
                        <div className="text-gray-400 text-sm">{contact.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={contact.status || 'new'}
                          onChange={(e) => updateContactStatus(contact.contactId, e.target.value)}
                          className="px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                        >
                          {CONTACT_STATUSES.map(status => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{contact.leadScore || 0}</div>
                        <div className="text-gray-400 text-sm">{contact.quality}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              ✉️
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`https://wa.me/${contact.phone.replace('+', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                            >
                              💬
                            </a>
                          )}
                          <button
                            className="text-purple-400 hover:text-purple-300"
                            onClick={() => setManualEmailComposer(contact)}
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {getFilteredContacts().length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No contacts found. Upload a CSV or discover leads to get started.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
